from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable

from . import media, store

MODEL_SIZES = {
    "tiny": {"label": "Tiny", "approx_mb": 75},
    "base": {"label": "Base", "approx_mb": 145},
    "small": {"label": "Small", "approx_mb": 490},
}
MODEL_CACHE = store.DATA_DIR / "models"


class ModelError(RuntimeError):
    pass


def _repo_id(size: str) -> str:
    if size not in MODEL_SIZES:
        raise ModelError("Choose a supported model: tiny, base, or small.")
    return "Systran/faster-whisper-" + size


def _cached_path(size: str) -> Path | None:
    repo_cache = MODEL_CACHE / ("models--Systran--faster-whisper-" + size) / "snapshots"
    if not repo_cache.is_dir():
        return None
    snapshots = sorted(
        (entry for entry in repo_cache.iterdir() if entry.is_dir() and (entry / "model.bin").is_file()),
        key=lambda entry: entry.stat().st_mtime,
        reverse=True,
    )
    return snapshots[0] if snapshots else None


def model_status() -> list[dict[str, Any]]:
    return [
        {
            "id": name,
            **metadata,
            "installed": _cached_path(name) is not None,
            "source": "Systran/faster-whisper-" + name,
        }
        for name, metadata in MODEL_SIZES.items()
    ]


def install_model(size: str, progress: Callable[[str, float, str], None] | None = None) -> dict[str, Any]:
    repo_id = _repo_id(size)
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    if progress:
        progress("model.download", 0.05, "Connecting to the public model repository…")
    try:
        from huggingface_hub import snapshot_download

        path = Path(snapshot_download(repo_id=repo_id, cache_dir=str(MODEL_CACHE)))
    except Exception as exc:
        raise ModelError(
            "Model download failed. Check your internet connection and try again. Details: "
            + str(exc)[:350]
        ) from exc
    if not (path / "model.bin").is_file():
        raise ModelError("The downloaded model is incomplete: model.bin is missing.")
    if progress:
        progress("model.ready", 1.0, "Local model is ready.")
    return {
        "id": size,
        "installed": True,
        "path": str(path),
        "approx_mb": MODEL_SIZES[size]["approx_mb"],
        "source": repo_id,
    }


def transcribe_video(
    video_path: str,
    project_id: str,
    language: str,
    model_size: str,
    cancelled: Callable[[], bool],
    progress: Callable[[str, float, str], None],
) -> tuple[list[dict[str, Any]], str]:
    model_path = _cached_path(model_size)
    if model_path is None:
        raise ModelError("Download the selected Whisper model first.")
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise ModelError("The local transcription package is not installed. Run the install instructions.") from exc

    audio_path = media.extract_audio(video_path)
    try:
        progress("transcribe.load", 0.08, "Loading the local model…")
        model = WhisperModel(str(model_path), device="cpu", compute_type="int8")
        language_code = None if language == "auto" else language
        segments_iterator, info = model.transcribe(
            str(audio_path),
            language=language_code,
            beam_size=5,
            vad_filter=True,
            word_timestamps=False,
        )
        total_seconds = max(1.0, media.duration_seconds(str(audio_path)))
        results: list[dict[str, Any]] = []
        for segment in segments_iterator:
            if cancelled():
                return [], info.language or language
            text = segment.text.strip()
            if not text:
                continue
            results.append(
                {
                    "id": os.urandom(16).hex(),
                    "project_id": project_id,
                    "start_ms": max(0, int(segment.start * 1000)),
                    "end_ms": max(0, int(segment.end * 1000)),
                    "text": text,
                    "language": info.language or language,
                    "confidence": None,
                }
            )
            ratio = min(0.92, 0.1 + (segment.end / total_seconds) * 0.82)
            progress("transcribe.running", ratio, "Transcribing on this device…")
        return results, info.language or language
    finally:
        audio_path.unlink(missing_ok=True)
