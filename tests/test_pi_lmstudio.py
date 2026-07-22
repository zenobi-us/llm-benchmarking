import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from harbor.agents.installed.pi import Pi

from harbor_agents.pi_lmstudio import PiLmStudio, _discover_host_ip


class PiLmStudioModelsConfigTest(unittest.IsolatedAsyncioTestCase):
    async def test_install_writes_supplied_models_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config = root / "models.json"
            config.write_text(
                '{"providers":{"lmstudio":{"baseUrl":"http://stale:1234/v1","models":[]}}}'
            )
            agent = PiLmStudio(
                logs_dir=root,
                model_name="lmstudio/test-model",
                models_json_path=config,
                lmstudio_base_url="http://10.0.0.5:1234/v1",
            )

            with (
                patch.object(Pi, "install", new=AsyncMock()),
                patch.object(agent, "exec_as_agent", new=AsyncMock()) as execute,
            ):
                await agent.install(object())

            command = execute.await_args.kwargs["command"]
            self.assertIn('"baseUrl": "http://10.0.0.5:1234/v1"', command)
            self.assertIn('> "$HOME/.pi/agent/models.json"', command)

    def test_discovers_default_route_ip(self) -> None:
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.getsockname.return_value = ("10.0.0.5", 54321)

        with patch("harbor_agents.pi_lmstudio.socket.socket", return_value=connection):
            self.assertEqual(_discover_host_ip(), "10.0.0.5")

        connection.connect.assert_called_once_with(("1.1.1.1", 80))

    def test_rejects_missing_models_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = Path(temp_dir) / "missing.json"
            with self.assertRaisesRegex(FileNotFoundError, "Pi models config not found"):
                PiLmStudio(
                    logs_dir=Path(temp_dir),
                    model_name="lmstudio/test-model",
                    models_json_path=missing,
                )

    def test_rejects_invalid_models_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config = Path(temp_dir) / "models.json"
            config.write_text("not json")
            with self.assertRaisesRegex(ValueError, "Invalid Pi models config JSON"):
                PiLmStudio(
                    logs_dir=Path(temp_dir),
                    model_name="lmstudio/test-model",
                    models_json_path=config,
                )

    def test_records_job_for_static_viewer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            agent_dir = root / "jobs" / "job-1" / "task__abc" / "agent"
            agent_dir.mkdir(parents=True)
            (agent_dir.parent / "config.json").write_text(
                '{"task":{"path":"tests/example"}}'
            )
            index_path = root / "jobs.jsonl"
            agent = PiLmStudio(
                logs_dir=agent_dir,
                model_name="lmstudio/test-model",
                lmstudio_base_url="http://127.0.0.1:1234/v1",
                jobs_jsonl_path=index_path,
            )

            agent._record_job_session()

            record = json.loads(index_path.read_text())
            self.assertEqual(record["id"], "job-1/task__abc")
            self.assertEqual(record["task"], "tests/example")
            self.assertEqual(record["model"], "lmstudio/test-model")
            self.assertEqual(
                record["sessionPath"], "jobs/job-1/task__abc/agent/session.html"
            )
            self.assertFalse(record["sessionAvailable"])
            self.assertEqual(record["resultPath"], "jobs/job-1/task__abc/result.json")


if __name__ == "__main__":
    unittest.main()
