from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

UZ_HOOKS = {
    "aslida", "hech qachon", "eng katta xato", "mana nima", "tasavvur qiling",
    "nega", "qanday qilib", "muammo shundaki", "sir shuki", "ammo", "lekin",
}
EN_HOOKS = {
    "the truth is", "here is why", "the biggest mistake", "what if", "how to",
    "the problem is", "most people", "but", "however", "never", "secret",
}
UZ_VALUE = {"foyda", "maslahat", "usul", "natija", "o‘rgan", "o'rgan", "qadam", "misol", "sabab"}
EN_VALUE = {"learn", "tip", "lesson", "result", "example", "because", "step", "solution", "reason"}


def _words(text: str) -> list[str]:
    return re.findall(r"[\w‘’'-]+", text.lower(), flags=re.UNICODE)


def _overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    overlap = max(0, min(a["end_ms"], b["end_ms"]) - max(a["start_ms"], b["start_ms"]))
    shorter = max(1, min(a["end_ms"] - a["start_ms"], b["end_ms"] - b["start_ms"]))
    return overlap / shorter


def suggest_clips(
    project_id: str,
    segments: list[dict[str, Any]],
    duration_ms: int,
    detected_language: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    if len(segments) < 2:
        return []
    segments = sorted(segments, key=lambda item: item["start_ms"])
    language = "en" if detected_language == "en" else "uz"
    hooks = EN_HOOKS if language == "en" else UZ_HOOKS
    value_words = EN_VALUE if language == "en" else UZ_VALUE
    candidates: list[dict[str, Any]] = []
    stride = max(1, len(segments) // 240)

    for start_index in range(0, len(segments), stride):
        start = segments[start_index]["start_ms"]
        for target_seconds in (24, 36, 48, 60):
            target_end = start + target_seconds * 1000
            end_index = next(
                (index for index in range(start_index + 1, len(segments)) if segments[index]["end_ms"] >= target_end),
                None,
            )
            if end_index is None:
                end_index = len(segments) - 1
            end = min(duration_ms, segments[end_index]["end_ms"])
            actual_seconds = (end - start) / 1000
            if actual_seconds < 12 or actual_seconds > 72:
                continue
            text = " ".join(item["text"].strip() for item in segments[start_index : end_index + 1]).strip()
            words = _words(text)
            if len(words) < 18:
                continue

            opening = " ".join(words[:14])
            hook_hits = sum(1 for phrase in hooks if phrase in opening)
            value_hits = sum(1 for word in words if word in value_words)
            punctuation = text.rstrip().endswith((".", "!", "?", "…"))
            complete = 12 if punctuation else 5
            density = min(14, max(0, int((len(words) / max(actual_seconds, 1)) * 1.4)))
            hook_score = min(20, hook_hits * 11 + (7 if "?" in text[:100] else 0))
            value_score = min(15, value_hits * 4)
            emotion_score = min(18, (text.count("!") * 5) + (text.count("?") * 3))
            duration_score = 10 if 20 <= actual_seconds <= 55 else 6
            score = max(25, min(96, 33 + complete + density + hook_score + value_score + emotion_score + duration_score))
            title_words = " ".join(text.split()[:9]).strip(" ,.!?…")
            if len(title_words) > 72:
                title_words = title_words[:69].rsplit(" ", 1)[0] + "…"
            reason = (
                "Clear opening and a complete idea." if language == "en"
                else "Kirish qismi aniq, fikr yakunlangan."
            )
            if hook_score >= 11:
                reason = "Strong opening and a complete thought." if language == "en" else "Kuchli kirish va yakunlangan fikr."
            if value_score >= 8:
                reason = "Contains a practical point and a clear opening." if language == "en" else "Amaliy fikr va aniq kirish bor."
            candidates.append(
                {
                    "id": uuid.uuid4().hex,
                    "project_id": project_id,
                    "start_ms": start,
                    "end_ms": end,
                    "score": score,
                    "title": title_words or ("Suggested clip" if language == "en" else "Tavsiya etilgan klip"),
                    "hook": text[:180],
                    "reason": reason,
                    "language": language,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected: list[dict[str, Any]] = []
    for candidate in candidates:
        if any(_overlap_ratio(candidate, chosen) > 0.55 for chosen in selected):
            continue
        selected.append(candidate)
        if len(selected) >= limit:
            break
    return selected
