from __future__ import annotations

import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import media, store


class RenderError(RuntimeError):
    pass


class RenderCancelled(RenderError):
    pass


def _srt_time(milliseconds: int) -> str:
    milliseconds = max(0, int(milliseconds))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _vtt_time(milliseconds: int) -> str:
    return _srt_time(milliseconds).replace(",", ".")


def _write_srt(segments: list[dict[str, Any]], start_ms: int, end_ms: int, path: Path) -> int:
    selected = [
        segment for segment in segments
        if segment["end_ms"] > start_ms and segment["start_ms"] < end_ms
    ]
    rows = []
    for index, segment in enumerate(selected, start=1):
        local_start = max(0, segment["start_ms"] - start_ms)
        local_end = min(end_ms - start_ms, segment["end_ms"] - start_ms)
        if local_end <= local_start:
            continue
        rows.append(
            f"{index}\n{_srt_time(local_start)} --> {_srt_time(local_end)}\n{segment['text'].strip()}\n"
        )
    path.write_text("\n".join(rows), encoding="utf-8")
    return len(rows)


def _write_vtt(segments: list[dict[str, Any]], start_ms: int, end_ms: int, path: Path) -> int:
    selected = [
        segment for segment in segments
        if segment["end_ms"] > start_ms and segment["start_ms"] < end_ms
    ]
    rows = ["WEBVTT"]
    count = 0
    for segment in selected:
        local_start = max(0, segment["start_ms"] - start_ms)
        local_end = min(end_ms - start_ms, segment["end_ms"] - start_ms)
        if local_end <= local_start:
            continue
        count += 1
        rows.append(
            f"{_vtt_time(local_start)} --> {_vtt_time(local_end)}\n{segment['text'].strip()}"
        )
    path.write_text("\n\n".join(rows) + "\n", encoding="utf-8")
    return count


def _escape_filter_path(path: Path) -> str:
    value = str(path.resolve()).replace("\\", "\\\\")
    value = value.replace(":", "\\:").replace("'", "\\'").replace(",", "\\,")
    value = value.replace("[", "\\[").replace("]", "\\]")
    return value


def render_clip(
    project_id: str,
    clip_id: str,
    output_path: str,
    burn_captions: bool,
    progress: Callable[[str, float, str], None],
    cancelled: Callable[[], bool],
) -> dict[str, Any]:
    project = store.get_project(project_id)
    clip = store.get_clip(project_id, clip_id)
    if project is None or clip is None:
        raise RenderError("Project or clip could not be found.")
    destination = Path(output_path).expanduser().resolve()
    if destination.suffix.lower() != ".mp4":
        destination = destination.with_suffix(".mp4")
    source_path = Path(project["source_path"]).expanduser().resolve()
    if destination == source_path:
        raise RenderError("Choose a different export path so the original video remains safe.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not source_path.is_file():
        raise RenderError("The source video is no longer available at its saved path.")
    if clip["end_ms"] <= clip["start_ms"]:
        raise RenderError("Clip end time must be after its start time.")

    temp_dir = store.DATA_DIR / "tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_output = destination.with_name(destination.stem + "-tmp-" + os.urandom(5).hex() + ".mp4")
    metadata_temp = destination.with_name(destination.stem + "-tmp-" + os.urandom(5).hex() + ".uzclip.json")
    subtitle_path = temp_dir / (destination.stem + "-" + os.urandom(5).hex() + ".srt")
    vtt_path = temp_dir / (destination.stem + "-" + os.urandom(5).hex() + ".vtt")
    subtitle_count = _write_srt(project["segments"], clip["start_ms"], clip["end_ms"], subtitle_path)
    _write_vtt(project["segments"], clip["start_ms"], clip["end_ms"], vtt_path)
    horizontal = "0" if clip["crop_mode"] == "left" else "(in_w-out_w)" if clip["crop_mode"] == "right" else "(in_w-out_w)/2"
    filters = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:" + horizontal + ":(in_h-out_h)/2"
    if burn_captions and subtitle_count:
        filters += ",subtitles=filename='" + _escape_filter_path(subtitle_path) + "':force_style='FontName=Arial,FontSize=22,Outline=2,Shadow=1,MarginV=150'"
    duration = (clip["end_ms"] - clip["start_ms"]) / 1000
    command = [
        media.FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error",
        "-ss", f"{clip['start_ms'] / 1000:.3f}", "-i", project["source_path"],
        "-t", f"{duration:.3f}", "-map", "0:v:0", "-map", "0:a?",
        "-vf", filters, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", "-y", str(temp_output),
    ]
    progress("render.start", 0.05, "Preparing the vertical clip…")
    if cancelled():
        raise RenderCancelled("Render cancelled.")
    process = None
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        last_lines: list[str] = []
        if process.stdout:
            for line in process.stdout:
                if cancelled():
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise RenderCancelled("Render cancelled.")
                line = line.strip()
                if line and "=" not in line:
                    last_lines.append(line)
                    last_lines = last_lines[-20:]
                elif line.startswith("out_time_ms="):
                    try:
                        seconds = int(line.split("=", 1)[1]) / 1_000_000
                        progress("render.running", min(0.95, 0.08 + seconds / max(duration, 1) * 0.85), "Rendering the clip on this device…")
                    except ValueError:
                        pass
        return_code = process.wait(timeout=7200)
        if return_code != 0 or not temp_output.is_file() or temp_output.stat().st_size < 1024:
            raise RenderError("FFmpeg could not export this clip. " + " ".join(last_lines)[-500:])
        metadata_destination = destination.with_suffix(".uzclip.json")
        metadata_temp.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "project": {
                        "id": project["id"],
                        "name": project["name"],
                        "source_filename": source_path.name,
                    },
                    "clip": {
                        "id": clip["id"],
                        "title": clip["title"],
                        "start_ms": clip["start_ms"],
                        "end_ms": clip["end_ms"],
                        "crop_mode": clip["crop_mode"],
                    },
                    "export": {
                        "output_filename": destination.name,
                        "width": 1080,
                        "height": 1920,
                        "burn_captions": bool(burn_captions and subtitle_count),
                        "srt_filename": destination.with_suffix(".srt").name if subtitle_count else None,
                        "vtt_filename": destination.with_suffix(".vtt").name if subtitle_count else None,
                    },
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )
        temp_output.replace(destination)
        srt_destination = destination.with_suffix(".srt")
        vtt_destination = destination.with_suffix(".vtt")
        if subtitle_count:
            subtitle_path.replace(srt_destination)
            vtt_path.replace(vtt_destination)
        else:
            srt_destination.unlink(missing_ok=True)
            vtt_destination.unlink(missing_ok=True)
        metadata_temp.replace(metadata_destination)
        progress("render.complete", 1.0, "Export complete.")
        return {
            "output_path": str(destination),
            "subtitle_path": str(srt_destination) if subtitle_count else None,
            "vtt_path": str(vtt_destination) if subtitle_count else None,
            "metadata_path": str(metadata_destination),
            "duration_ms": clip["end_ms"] - clip["start_ms"],
            "burn_captions": bool(burn_captions and subtitle_count),
        }
    except FileNotFoundError as exc:
        raise RenderError("FFmpeg is missing. Install FFmpeg and make it available on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        if process:
            process.kill()
        raise RenderError("Rendering took too long and was stopped.") from exc
    finally:
        if process and process.poll() is None:
            process.kill()
        temp_output.unlink(missing_ok=True)
        subtitle_path.unlink(missing_ok=True)
        vtt_path.unlink(missing_ok=True)
        metadata_temp.unlink(missing_ok=True)
