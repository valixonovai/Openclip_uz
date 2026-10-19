from __future__ import annotations

import json
import os
import shutil
import sys
import threading
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker import media, render, scoring, store, transcriber

_stdout_lock = threading.Lock()
_jobs_lock = threading.Lock()
_jobs: dict[str, threading.Event] = {}
_deferred_jobs: list[tuple[Callable[..., None], tuple[Any, ...]]] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit(payload: dict[str, Any]) -> None:
    with _stdout_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def event(name: str, data: dict[str, Any]) -> None:
    emit({"type": "event", "event": name, "data": data})


def _progress(job_id: str, project_id: str | None, stage: str, value: float, message: str) -> None:
    store.update_job(job_id, stage, "running", value)
    event(
        "job.progress",
        {"job_id": job_id, "project_id": project_id, "stage": stage, "progress": value, "message": message},
    )


def _create_job(job_id: str, project_id: str | None, kind: str, stage: str) -> None:
    now = _now()
    store.create_job(
        {
            "id": job_id,
            "project_id": project_id,
            "kind": kind,
            "stage": stage,
            "status": "running",
            "progress": 0.0,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    with _jobs_lock:
        _jobs[job_id] = threading.Event()


def _finish_job(job_id: str) -> None:
    with _jobs_lock:
        _jobs.pop(job_id, None)


def _defer_job(target: Callable[..., None], *args: Any) -> None:
    _deferred_jobs.append((target, args))


def _start_deferred_jobs() -> None:
    while _deferred_jobs:
        target, args = _deferred_jobs.pop(0)
        threading.Thread(target=target, args=args, daemon=True).start()


def _complete(job_id: str, project_id: str | None, result: dict[str, Any]) -> None:
    store.update_job(job_id, "complete", "completed", 1.0)
    event("job.completed", {"job_id": job_id, "project_id": project_id, "result": result})
    _finish_job(job_id)


def _fail(job_id: str, project_id: str | None, exc: Exception, kind: str) -> None:
    detail = str(exc) or exc.__class__.__name__
    store.update_job(job_id, "failed", "failed", 1.0, detail[:1000])
    print(traceback.format_exc(), file=sys.stderr, flush=True)
    event(
        "job.failed",
        {"job_id": job_id, "project_id": project_id, "kind": kind, "message": detail[:1000]},
    )
    _finish_job(job_id)


def _run_model_install(job_id: str, size: str) -> None:
    try:
        def report(stage: str, value: float, message: str) -> None:
            _progress(job_id, None, stage, value, message)

        result = transcriber.install_model(size, report)
        _complete(job_id, None, result)
    except Exception as exc:
        _fail(job_id, None, exc, "model_install")


def _run_transcription(job_id: str, project_id: str, language: str, model_size: str) -> None:
    try:
        project = store.get_project(project_id)
        if project is None:
            raise ValueError("Project could not be found.")
        cancel_event = _jobs[job_id]

        def report(stage: str, value: float, message: str) -> None:
            _progress(job_id, project_id, stage, value, message)

        segments, detected = transcriber.transcribe_video(
            project["source_path"],
            project_id,
            language,
            model_size,
            cancel_event.is_set,
            report,
        )
        if cancel_event.is_set():
            store.update_job(job_id, "cancelled", "cancelled", 0.0)
            event("job.cancelled", {"job_id": job_id, "project_id": project_id})
            _finish_job(job_id)
            return
        if not segments:
            raise ValueError("No speech segments were detected in the video.")
        store.replace_transcript(project_id, segments)
        _progress(job_id, project_id, "clip_suggestions", 0.94, "Finding useful moments…")
        candidates = scoring.suggest_clips(
            project_id=project_id,
            segments=segments,
            duration_ms=project["duration_ms"],
            detected_language=detected,
        )
        store.replace_clips(project_id, candidates)
        _complete(
            job_id,
            project_id,
            {"segment_count": len(segments), "clip_count": len(candidates), "language": detected},
        )
    except Exception as exc:
        _fail(job_id, project_id, exc, "transcription")


def _run_render(job_id: str, project_id: str, clip_id: str, output_path: str, burn_captions: bool) -> None:
    try:
        cancel_event = _jobs[job_id]

        def report(stage: str, value: float, message: str) -> None:
            _progress(job_id, project_id, stage, value, message)

        result = render.render_clip(
            project_id,
            clip_id,
            output_path,
            burn_captions,
            report,
            cancel_event.is_set,
        )
        _complete(job_id, project_id, result)
    except render.RenderCancelled:
        store.update_job(job_id, "cancelled", "cancelled", 0.0)
        event("job.cancelled", {"job_id": job_id, "project_id": project_id})
        _finish_job(job_id)
    except Exception as exc:
        _fail(job_id, project_id, exc, "render")


def _status() -> dict[str, Any]:
    return {
        "version": "0.1.0",
        "platform": sys.platform,
        "python": sys.version.split()[0],
        "ffmpeg_available": shutil.which(media.FFMPEG) is not None,
        "ffprobe_available": shutil.which(media.FFPROBE) is not None,
        "data_dir": str(store.DATA_DIR),
        "models": transcriber.model_status(),
    }


def dispatch(method: str, params: dict[str, Any]) -> Any:
    if method == "runtime.status":
        return _status()
    if method == "projects.list":
        return store.list_projects()
    if method == "projects.get":
        project = store.get_project(str(params.get("project_id", "")))
        if project is None:
            raise ValueError("Project could not be found.")
        return project
    if method == "projects.import":
        metadata = media.probe(str(params.get("path", "")))
        now = _now()
        project = {
            "id": uuid.uuid4().hex,
            "name": Path(metadata["name"]).stem,
            "source_path": metadata["path"],
            "duration_ms": metadata["duration_ms"],
            "width": metadata["width"],
            "height": metadata["height"],
            "language": str(params.get("language", "auto")),
            "created_at": now,
            "updated_at": now,
        }
        store.create_project(project)
        project["has_audio"] = metadata["has_audio"]
        project["video_codec"] = metadata["video_codec"]
        return project
    if method == "projects.delete":
        project_id = str(params.get("project_id", ""))
        deleted = store.delete_project(project_id)
        return {"deleted": deleted, "source_file_removed": False}
    if method == "models.status":
        return transcriber.model_status()
    if method == "models.install":
        size = str(params.get("model_size", "base"))
        job_id = uuid.uuid4().hex
        _create_job(job_id, None, "model_install", "model.download")
        _defer_job(_run_model_install, job_id, size)
        return {"job_id": job_id, "model_size": size}
    if method == "transcription.start":
        project_id = str(params.get("project_id", ""))
        project = store.get_project(project_id)
        if project is None:
            raise ValueError("Project could not be found.")
        language = str(params.get("language", project["language"]))
        if language not in {"auto", "uz", "en"}:
            raise ValueError("Language must be auto, Uzbek, or English.")
        model_size = str(params.get("model_size", "base"))
        if model_size not in transcriber.MODEL_SIZES:
            raise ValueError("Choose tiny, base, or small.")
        store.set_project_language(project_id, language)
        job_id = uuid.uuid4().hex
        _create_job(job_id, project_id, "transcription", "transcribe.load")
        _defer_job(_run_transcription, job_id, project_id, language, model_size)
        return {"job_id": job_id}
    if method == "transcript.update":
        project_id = str(params.get("project_id", ""))
        segment_id = str(params.get("segment_id", ""))
        text = " ".join(str(params.get("text", "")).strip().split())
        project = store.get_project(project_id)
        if project is None:
            raise ValueError("Project could not be found.")
        if not segment_id:
            raise ValueError("Transcript segment is required.")
        if not text:
            raise ValueError("Transcript text cannot be empty.")
        if len(text) > 2000:
            raise ValueError("Transcript text is too long.")
        if not store.update_transcript_segment(project_id, segment_id, text):
            raise ValueError("Transcript segment could not be found.")
        segments = store.get_segments(project_id)
        detected_language = next(
            (str(segment.get("language")) for segment in segments if segment.get("language") in {"uz", "en"}),
            project.get("language", "uz"),
        )
        candidates = scoring.suggest_clips(
            project_id=project_id,
            segments=segments,
            duration_ms=project["duration_ms"],
            detected_language=detected_language,
        )
        store.replace_clips(project_id, candidates)
        return {"updated": True, "clip_count": len(candidates)}
    if method == "jobs.cancel":
        job_id = str(params.get("job_id", ""))
        with _jobs_lock:
            cancel_event = _jobs.get(job_id)
        if cancel_event is None:
            return {"cancelled": False}
        cancel_event.set()
        return {"cancelled": True}
    if method == "clips.update":
        project_id = str(params.get("project_id", ""))
        clip_id = str(params.get("clip_id", ""))
        project = store.get_project(project_id)
        if project is None:
            raise ValueError("Project could not be found.")
        start_ms = int(params.get("start_ms", 0))
        end_ms = int(params.get("end_ms", 0))
        if start_ms < 0 or end_ms <= start_ms or end_ms > project["duration_ms"]:
            raise ValueError("Clip boundaries must fit inside the source video.")
        crop_mode = str(params.get("crop_mode", "center"))
        status = str(params.get("status", "suggested"))
        if crop_mode not in {"center", "left", "right"}:
            raise ValueError("Choose a supported crop position.")
        if status not in {"suggested", "approved", "rejected"}:
            raise ValueError("Choose a supported clip status.")
        updated = store.update_clip(project_id, clip_id, start_ms, end_ms, crop_mode, status)
        if not updated:
            raise ValueError("Clip could not be found.")
        return {"updated": True}
    if method == "clips.render":
        project_id = str(params.get("project_id", ""))
        clip_id = str(params.get("clip_id", ""))
        output_path = str(params.get("output_path", ""))
        if not output_path:
            raise ValueError("Choose an output path first.")
        job_id = uuid.uuid4().hex
        _create_job(job_id, project_id, "render", "render.start")
        _defer_job(_run_render, job_id, project_id, clip_id, output_path, bool(params.get("burn_captions", True)))
        return {"job_id": job_id}
    raise ValueError("Unknown worker method: " + method)


def main() -> None:
    store.initialize()
    emit({"type": "ready", "version": 1})
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        request: dict[str, Any] = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            method = request.get("method")
            params = request.get("params") or {}
            if not isinstance(method, str) or not isinstance(params, dict):
                raise ValueError("Invalid request shape.")
            result = dispatch(method, params)
            emit({"type": "response", "id": request_id, "ok": True, "result": result})
            _start_deferred_jobs()
        except Exception as exc:
            emit(
                {
                    "type": "response",
                    "id": request.get("id"),
                    "ok": False,
                    "error": {"message": str(exc)[:1000]},
                }
            )


if __name__ == "__main__":
    main()
