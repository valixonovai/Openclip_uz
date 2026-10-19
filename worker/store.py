from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.environ.get("UZCLIP_DATA_DIR", Path.home() / ".uzclip-ai" / "data")).expanduser()
DB_PATH = DATA_DIR / "uzclip.sqlite3"


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def initialize() -> None:
    with connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_path TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                width INTEGER,
                height INTEGER,
                language TEXT NOT NULL DEFAULT 'auto',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transcript_segments (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                text TEXT NOT NULL,
                language TEXT NOT NULL DEFAULT 'unknown',
                confidence REAL
            );
            CREATE INDEX IF NOT EXISTS transcript_project_idx
                ON transcript_segments(project_id, start_ms);
            CREATE TABLE IF NOT EXISTS clip_candidates (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                score INTEGER NOT NULL,
                title TEXT NOT NULL,
                hook TEXT NOT NULL,
                reason TEXT NOT NULL,
                language TEXT NOT NULL DEFAULT 'unknown',
                status TEXT NOT NULL DEFAULT 'suggested',
                crop_mode TEXT NOT NULL DEFAULT 'center',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS clips_project_idx
                ON clip_candidates(project_id, score DESC);
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                stage TEXT NOT NULL,
                status TEXT NOT NULL,
                progress REAL NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        db.execute(
            """
            UPDATE jobs
               SET stage = 'interrupted',
                   status = 'interrupted',
                   error = COALESCE(error, 'The app closed before this job finished. Start the action again.'),
                   updated_at = datetime('now')
             WHERE status IN ('queued', 'running')
            """
        )


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


def list_projects() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute(
            """
            SELECT p.*,
                   (SELECT COUNT(*) FROM clip_candidates c WHERE c.project_id = p.id) AS clip_count,
                   (SELECT status FROM jobs j WHERE j.project_id = p.id
                    ORDER BY updated_at DESC LIMIT 1) AS latest_job_status
            FROM projects p
            ORDER BY p.updated_at DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def get_project(project_id: str) -> dict[str, Any] | None:
    with connect() as db:
        project = row_dict(db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone())
        if project is None:
            return None
        project["segments"] = [
            dict(row) for row in db.execute(
                "SELECT * FROM transcript_segments WHERE project_id = ? ORDER BY start_ms",
                (project_id,),
            ).fetchall()
        ]
        project["clips"] = [
            dict(row) for row in db.execute(
                "SELECT * FROM clip_candidates WHERE project_id = ? ORDER BY score DESC, start_ms",
                (project_id,),
            ).fetchall()
        ]
        project["latest_job"] = row_dict(
            db.execute(
                """
                SELECT id, project_id, kind, stage, status, progress, error, created_at, updated_at
                  FROM jobs
                 WHERE project_id = ?
                 ORDER BY updated_at DESC
                 LIMIT 1
                """,
                (project_id,),
            ).fetchone()
        )
        return project


def create_project(project: dict[str, Any]) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO projects(id, name, source_path, duration_ms, width, height, language, created_at, updated_at)
            VALUES(:id, :name, :source_path, :duration_ms, :width, :height, :language, :created_at, :updated_at)
            """,
            project,
        )


def delete_project(project_id: str) -> bool:
    with connect() as db:
        cursor = db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        return cursor.rowcount > 0


def set_project_language(project_id: str, language: str) -> None:
    with connect() as db:
        db.execute(
            "UPDATE projects SET language = ?, updated_at = datetime('now') WHERE id = ?",
            (language, project_id),
        )


def replace_transcript(project_id: str, segments: list[dict[str, Any]]) -> None:
    with connect() as db:
        db.execute("DELETE FROM transcript_segments WHERE project_id = ?", (project_id,))
        db.execute("DELETE FROM clip_candidates WHERE project_id = ?", (project_id,))
        db.executemany(
            """
            INSERT INTO transcript_segments(id, project_id, start_ms, end_ms, text, language, confidence)
            VALUES(:id, :project_id, :start_ms, :end_ms, :text, :language, :confidence)
            """,
            segments,
        )
        db.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))


def update_transcript_segment(project_id: str, segment_id: str, text: str) -> bool:
    with connect() as db:
        cursor = db.execute(
            """
            UPDATE transcript_segments
               SET text = ?
             WHERE project_id = ? AND id = ?
            """,
            (text, project_id, segment_id),
        )
        if cursor.rowcount:
            db.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))
        return cursor.rowcount > 0


def replace_clips(project_id: str, clips: list[dict[str, Any]]) -> None:
    with connect() as db:
        db.execute("DELETE FROM clip_candidates WHERE project_id = ?", (project_id,))
        db.executemany(
            """
            INSERT INTO clip_candidates(
                id, project_id, start_ms, end_ms, score, title, hook, reason,
                language, status, crop_mode, created_at
            ) VALUES(
                :id, :project_id, :start_ms, :end_ms, :score, :title, :hook, :reason,
                :language, 'suggested', 'center', :created_at
            )
            """,
            clips,
        )
        db.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))


def update_clip(
    project_id: str,
    clip_id: str,
    start_ms: int,
    end_ms: int,
    crop_mode: str,
    status: str,
) -> bool:
    with connect() as db:
        cursor = db.execute(
            """
            UPDATE clip_candidates SET start_ms = ?, end_ms = ?, crop_mode = ?, status = ?
             WHERE project_id = ? AND id = ?
            """,
            (start_ms, end_ms, crop_mode, status, project_id, clip_id),
        )
        return cursor.rowcount > 0


def create_job(job: dict[str, Any]) -> None:
    with connect() as db:
        db.execute(
            """
            INSERT INTO jobs(id, project_id, kind, stage, status, progress, error, created_at, updated_at)
            VALUES(:id, :project_id, :kind, :stage, :status, :progress, :error, :created_at, :updated_at)
            """,
            job,
        )


def update_job(job_id: str, stage: str, status: str, progress: float, error: str | None = None) -> None:
    with connect() as db:
        db.execute(
            """
            UPDATE jobs SET stage = ?, status = ?, progress = ?, error = ?, updated_at = datetime('now')
             WHERE id = ?
            """,
            (stage, status, max(0.0, min(1.0, progress)), error, job_id),
        )


def get_segments(project_id: str) -> list[dict[str, Any]]:
    with connect() as db:
        return [
            dict(row) for row in db.execute(
                "SELECT * FROM transcript_segments WHERE project_id = ? ORDER BY start_ms",
                (project_id,),
            ).fetchall()
        ]


def get_clip(project_id: str, clip_id: str) -> dict[str, Any] | None:
    with connect() as db:
        return row_dict(
            db.execute(
                "SELECT * FROM clip_candidates WHERE project_id = ? AND id = ?",
                (project_id, clip_id),
            ).fetchone()
        )
