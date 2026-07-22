"""Shared Harbor agent lifecycle behavior."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from fcntl import LOCK_EX, LOCK_UN, flock
from pathlib import Path
from typing import Any

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


class AgentBase:
    """Add project-wide lifecycle behavior to a concrete harness agent.

    This mixin must appear before the harness base in the concrete class MRO so
    its ``run`` wrapper can record the finished harness session.
    """

    def __init__(
        self,
        *args: Any,
        jobs_jsonl_path: str | Path | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._jobs_jsonl_path = (
            Path(jobs_jsonl_path).expanduser()
            if jobs_jsonl_path
            else self._find_jobs_jsonl_path()
        )

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        try:
            await super().run(instruction, environment, context)
        finally:
            # Failed runs are evidence too. Indexing in ``finally`` keeps their
            # transcript and failure state discoverable in the static viewer.
            self._record_job_session()

    def session_artifact_path(self) -> Path | None:
        """Return the host-side session artifact exposed by the harness."""
        harness_path = getattr(super(), "session_artifact_path", None)
        return harness_path() if harness_path else None

    def _find_jobs_jsonl_path(self) -> Path | None:
        for parent in self.logs_dir.resolve().parents:
            if parent.name == "jobs":
                return parent.parent / "jobs.jsonl"
        return None

    def _record_job_session(self) -> None:
        """Append a static-viewer index record without altering benchmark results."""
        if not self._jobs_jsonl_path:
            return

        try:
            trial_dir = self.logs_dir.parent
            job_dir = trial_dir.parent
            config_path = trial_dir / "config.json"
            config = json.loads(config_path.read_text()) if config_path.is_file() else {}
            task = config.get("task", {})
            task_name = task.get("name") or task.get("path") or trial_dir.name
            index_root = self._jobs_jsonl_path.resolve().parent

            def relative(path: Path) -> str:
                return Path(os.path.relpath(path.resolve(), index_root)).as_posix()

            record: dict[str, Any] = {
                "schemaVersion": 1,
                "id": f"{job_dir.name}/{trial_dir.name}",
                "job": job_dir.name,
                "trial": trial_dir.name,
                "task": task_name,
                "model": self.model_name,
                "recordedAt": datetime.now(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "resultPath": relative(trial_dir / "result.json"),
                "jobResultPath": relative(job_dir / "result.json"),
            }

            session_path = self.session_artifact_path()
            if session_path is not None:
                record["sessionPath"] = relative(session_path)
                record["sessionAvailable"] = session_path.is_file()

            line = json.dumps(record, separators=(",", ":")) + "\n"
            self._jobs_jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            with self._jobs_jsonl_path.open("a", encoding="utf-8") as index:
                flock(index.fileno(), LOCK_EX)
                try:
                    index.write(line)
                    index.flush()
                finally:
                    flock(index.fileno(), LOCK_UN)
        except Exception as exc:
            self.logger.warning("Failed to update jobs.jsonl: %s", exc)
