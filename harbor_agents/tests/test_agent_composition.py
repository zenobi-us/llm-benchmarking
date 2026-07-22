import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from harbor_agents.base import LmStudioAgentProvider
from harbor_agents.pi_lmstudio import PiLmStudio


class RecordingHarness:
    """Small harness double proving provider declarations are not Pi-specific."""

    def __init__(
        self,
        *args,
        logs_dir: Path,
        model_name: str | None = None,
        extra_env: dict[str, str] | None = None,
        **kwargs,
    ) -> None:
        self.logs_dir = logs_dir
        self.model_name = model_name
        self.extra_env = extra_env or {}
        self.installed = False
        self.configured_provider = None

    async def install(self, environment) -> None:
        self.installed = True

    async def configure_model_provider(self, environment, provider) -> None:
        self.configured_provider = provider


class LmStudioRecordingAgent(LmStudioAgentProvider, RecordingHarness):
    pass


class AgentCompositionTest(unittest.IsolatedAsyncioTestCase):
    async def test_lmstudio_provider_can_configure_a_non_pi_harness(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            agent = LmStudioRecordingAgent(
                logs_dir=Path(temp_dir),
                model_name="lmstudio/test-model",
                lmstudio_base_url="http://10.0.0.5:1234/v1",
            )

            await agent.install(object())

            self.assertTrue(agent.installed)
            self.assertEqual(agent.configured_provider.name, "lmstudio")
            self.assertEqual(agent.configured_provider.model_id, "test-model")
            self.assertEqual(
                agent.configured_provider.base_url,
                "http://10.0.0.5:1234/v1",
            )
            self.assertEqual(
                agent.configured_provider.api_protocol,
                "openai-completions",
            )

    async def test_prompt_failure_still_exports_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            agent_dir = root / "jobs" / "job-1" / "task__abc" / "agent"
            agent_dir.mkdir(parents=True)
            agent = PiLmStudio(
                logs_dir=agent_dir,
                model_name="lmstudio/test-model",
                lmstudio_base_url="http://127.0.0.1:1234/v1",
                prompt_template_path=root / "missing-template.md",
            )
            execute = AsyncMock(return_value=None)
            agent.exec_as_agent = execute

            with self.assertRaises(FileNotFoundError):
                await agent.run("instruction", object(), object())

            self.assertEqual(execute.await_count, 2)
            self.assertIn("rm -f", execute.await_args_list[0].kwargs["command"])
            self.assertIn("pi --export", execute.await_args_list[1].kwargs["command"])

    async def test_pi_failure_still_exports_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            agent_dir = root / "jobs" / "job-1" / "task__abc" / "agent"
            agent_dir.mkdir(parents=True)
            agent = PiLmStudio(
                logs_dir=agent_dir,
                model_name="lmstudio/test-model",
                lmstudio_base_url="http://127.0.0.1:1234/v1",
            )
            execute = AsyncMock(side_effect=[None, RuntimeError("Pi failed"), None])
            agent.exec_as_agent = execute

            with self.assertRaisesRegex(RuntimeError, "Pi failed"):
                await agent.run("instruction", object(), object())

            self.assertEqual(execute.await_count, 3)
            run_command = execute.await_args_list[1].kwargs["command"]
            export_command = execute.await_args_list[2].kwargs["command"]
            self.assertIn("--session /logs/agent/session.jsonl", run_command)
            self.assertNotIn("--no-session", run_command)
            self.assertIn("pi --export", export_command)

    def test_pi_lmstudio_mro_keeps_provider_harness_order(self) -> None:
        names = [base.__name__ for base in PiLmStudio.__mro__]
        self.assertLess(
            names.index("LmStudioAgentProvider"),
            names.index("AgentProviderBase"),
        )
        self.assertLess(names.index("AgentProviderBase"), names.index("PiMonoAgentBase"))

    def test_caller_environment_overrides_pi_offline_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            agent = PiLmStudio(
                logs_dir=Path(temp_dir),
                model_name="lmstudio/test-model",
                lmstudio_base_url="http://127.0.0.1:1234/v1",
                extra_env={"PI_OFFLINE": "0", "CUSTOM": "value"},
            )

            self.assertEqual(agent.extra_env["PI_OFFLINE"], "0")
            self.assertEqual(agent.extra_env["CUSTOM"], "value")


if __name__ == "__main__":
    unittest.main()
