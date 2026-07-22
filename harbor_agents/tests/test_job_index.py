import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from harbor_agents.job_index import JobIndexPlugin


class JobIndexPluginTest(unittest.IsolatedAsyncioTestCase):
    async def test_indexes_job_config_after_job_completion(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            job_dir = root / "jobs" / "2026-07-22__20-02-12"
            job_dir.mkdir(parents=True)
            index_path = root / "jobs.jsonl"
            plugin = JobIndexPlugin()

            await plugin.on_job_start(SimpleNamespace(job_dir=job_dir))
            await plugin.on_job_end(
                SimpleNamespace(
                    id=UUID("2dc03624-9a0e-427d-8778-601e34253a0c"),
                    finished_at=datetime(2026, 7, 22, 20, 5, 39, tzinfo=timezone.utc),
                )
            )

            record = json.loads(index_path.read_text())
            self.assertEqual(record["schemaVersion"], 2)
            self.assertEqual(record["id"], "2026-07-22__20-02-12")
            self.assertEqual(
                record["configPath"],
                "jobs/2026-07-22__20-02-12/config.json",
            )
            self.assertEqual(
                record["resultPath"],
                "jobs/2026-07-22__20-02-12/result.json",
            )
            self.assertEqual(record["recordedAt"], "2026-07-22T20:05:39Z")


if __name__ == "__main__":
    unittest.main()