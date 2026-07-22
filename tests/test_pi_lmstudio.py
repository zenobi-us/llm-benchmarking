import shlex
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from harbor.agents.installed.pi import Pi

from harbor_agents.pi_lmstudio import PiLmStudio


class PiLmStudioModelsConfigTest(unittest.IsolatedAsyncioTestCase):
    async def test_install_writes_supplied_models_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config = root / "models.json"
            models_json = '{"providers":{"lmstudio":{"models":[]}}}'
            config.write_text(models_json)
            agent = PiLmStudio(
                logs_dir=root,
                model_name="lmstudio/test-model",
                models_json_path=config,
            )

            with (
                patch.object(Pi, "install", new=AsyncMock()),
                patch.object(agent, "exec_as_agent", new=AsyncMock()) as execute,
            ):
                await agent.install(object())

            command = execute.await_args.kwargs["command"]
            self.assertIn(shlex.quote(models_json), command)
            self.assertIn('> "$HOME/.pi/agent/models.json"', command)

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


if __name__ == "__main__":
    unittest.main()
