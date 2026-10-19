from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from . import store

FFMPEG = os.environ.get("UZCLIP_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("UZCLIP_FFPROBE", "ffprobe")
SUPPORTED_VIDEO = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}


class MediaError(RuntimeError):
    pass


def probe(path: str) -> dict[str, Any]:
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise MediaError("Video file could not be found.")
    if source.suffix.lower() not in SUPPORTED_VIDEO:
        raise MediaError("This video format is not supported yet.")
    try:
        result = subprocess.run(
            [
                FFPROBE, "-v", "error", "-show_streams", "-show_format",
                "-of", "json", str(source),
            ],
            capture_output=True,
            text=True,
            timeout=45,
            check=True,
        )
        metadata = json.loads(result.stdout)
    except FileNotFoundError as exc:
        raise MediaError("FFprobe is missing. Install FFmpeg and make ffprobe available on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("Reading video metadata timed out.") from exc
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        detail = getattr(exc, "stderr", "") or ""
        raise MediaError("Could not read this video. " + detail[-500:]) from exc

    video = next((stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video:
        raise MediaError("The selected file does not contain a video stream.")
    try:
        duration_ms = int(float(metadata.get("format", {}).get("duration", 0)) * 1000)
    except (TypeError, ValueError):
        duration_ms = 0
    if duration_ms <= 0:
        duration_ms = int(float(video.get("duration", 0) or 0) * 1000)
    if duration_ms <= 0:
        raise MediaError("The video duration could not be determined.")
    return {
        "path": str(source),
        "name": source.name,
        "duration_ms": duration_ms,
        "width": int(video.get("width", 0) or 0),
        "height": int(video.get("height", 0) or 0),
        "has_audio": any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", [])),
        "video_codec": video.get("codec_name", "unknown"),
    }


def extract_audio(video_path: str) -> Path:
    temp_dir = store.DATA_DIR / "tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(prefix="uzclip-audio-", suffix=".wav", dir=temp_dir, delete=False)
    output_path = Path(handle.name)
    handle.close()
    try:
        subprocess.run(
            [
                FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", video_path, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
                "-c:a", "pcm_s16le", str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=3600,
            check=True,
        )
    except FileNotFoundError as exc:
        output_path.unlink(missing_ok=True)
        raise MediaError("FFmpeg is missing. Install FFmpeg and make it available on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        output_path.unlink(missing_ok=True)
        raise MediaError("Audio extraction took too long.") from exc
    except subprocess.CalledProcessError as exc:
        output_path.unlink(missing_ok=True)
        detail = (exc.stderr or "").strip()
        if "matches no streams" in detail or "does not contain any stream" in detail:
            raise MediaError("No audio track was found in this video.") from exc
        raise MediaError("Could not extract audio. " + detail[-500:]) from exc
    return output_path


def duration_seconds(path: str) -> float:
    try:
        completed = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
        return max(0.0, float(completed.stdout.strip()))
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0.0
