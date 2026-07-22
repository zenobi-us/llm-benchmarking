"""Harbor plugin that indexes completed jobs for the static viewer."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from fcntl import LOCK_EX, LOCK_UN, flock
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from harbor.job import Job
    from harbor.models.job.result import JobResult


class JobIndexPlugin:
    """Append one job-level record after Harbor finishes all trials."""

    def __init__(self, jobs_jsonl_path: str | Path | None = None) -> None:
        self._jobs_jsonl_path = (
            Path(jobs_jsonl_path).expanduser() if jobs_jsonl_path else None
        )
        self._job_dir: Path | None = None

    async def on_job_start(self, job: Job) -> None:
        self._job_dir = Path(job.job_dir)
        if self._jobs_jsonl_path is None:
            self._jobs_jsonl_path = self._job_dir.parent.parent / "jobs.jsonl"

    async def on_job_end(self, job_result: JobResult) -> None:
        if self._job_dir is None or self._jobs_jsonl_path is None:
            raise RuntimeError("JobIndexPlugin.on_job_start must run before on_job_end")

        index_root = self._jobs_jsonl_path.resolve().parent

        def relative(path: Path) -> str:
            return Path(os.path.relpath(path.resolve(), index_root)).as_posix()

        finished_at = job_result.finished_at or datetime.now(timezone.utc)
        if finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)

        record: dict[str, Any] = {
            "schemaVersion": 2,
            "id": self._job_dir.name,
            "jobId": str(job_result.id),
            "recordedAt": finished_at.astimezone(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "configPath": relative(self._job_dir / "config.json"),
            "resultPath": relative(self._job_dir / "result.json"),
        }

        self._jobs_jsonl_path.parent.mkdir(parents=True, exist_ok=True)
        with self._jobs_jsonl_path.open("a", encoding="utf-8") as index:
            flock(index.fileno(), LOCK_EX)
            try:
                index.write(json.dumps(record, separators=(",", ":")) + "\n")
                index.flush()
            finally:
                flock(index.fileno(), LOCK_UN)


__all__ = ["JobIndexPlugin"]