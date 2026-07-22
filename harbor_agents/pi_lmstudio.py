"""Harbor's Pi agent configured for the local LM Studio server."""

from __future__ import annotations

import json
import shlex
from pathlib import Path, PurePosixPath
from typing import Any

from harbor.agents.installed.base import with_prompt_template
from harbor.agents.installed.pi import Pi
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trial.paths import EnvironmentPaths


class PiLmStudio(Pi):
    """Install Pi and inject an LM Studio custom-provider configuration."""

    DEFAULT_BASE_URL = "http://192.168.86.35:1234/v1"
    DEFAULT_MODEL_ID = "google/gemma-4-26b-a4b-qat"
    _SESSION_FILENAME = "session.jsonl"
    _SESSION_HTML_FILENAME = "session.html"
    _SESSION_EXPORT_LOG_FILENAME = "session-export.txt"

    def __init__(
        self,
        *args: Any,
        lmstudio_base_url: str = DEFAULT_BASE_URL,
        lmstudio_model: str | None = None,
        lmstudio_api_key: str = "lm-studio",
        models_json_path: str | Path | None = None,
        extra_env: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> None:
        merged_env = {"PI_OFFLINE": "1"}
        if extra_env:
            merged_env.update(extra_env)

        super().__init__(*args, extra_env=merged_env, **kwargs)

        model_provider, separator, model_id = (self.model_name or "").partition("/")
        if model_provider and model_provider != "lmstudio":
            raise ValueError("PiLmStudio requires an lmstudio/<model-id> model name")

        self._lmstudio_base_url = lmstudio_base_url.rstrip("/")
        self._lmstudio_model = (
            lmstudio_model or (model_id if separator else None) or self.DEFAULT_MODEL_ID
        )
        self._lmstudio_api_key = lmstudio_api_key
        self._models_json_path = (
            Path(models_json_path).expanduser() if models_json_path else None
        )
        if self._models_json_path:
            if not self._models_json_path.is_file():
                raise FileNotFoundError(
                    f"Pi models config not found: {self._models_json_path}"
                )
            try:
                json.loads(self._models_json_path.read_text())
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"Invalid Pi models config JSON: {self._models_json_path}"
                ) from exc

    @staticmethod
    def name() -> str:
        return "pi-lmstudio"

    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)

        if self._models_json_path:
            models_json = self._models_json_path.read_text()
        else:
            models_json = json.dumps(
                {
                    "providers": {
                        "lmstudio": {
                            "baseUrl": self._lmstudio_base_url,
                            "api": "openai-completions",
                            "apiKey": self._lmstudio_api_key,
                            "compat": {
                                "supportsDeveloperRole": False,
                                "supportsReasoningEffort": False,
                            },
                            "models": [
                                {
                                    "id": self._lmstudio_model,
                                    "input": ["text", "image"],
                                }
                            ],
                        }
                    }
                },
                indent=2,
            )
        payload = shlex.quote(models_json)

        await self.exec_as_agent(
            environment,
            command=(
                'mkdir -p "$HOME/.pi/agent" && '
                f"printf '%s\\n' {payload} > \"$HOME/.pi/agent/models.json\""
            ),
        )

    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        if not self.model_name or "/" not in self.model_name:
            raise ValueError("Model name must be in the format provider/model_name")

        provider, model_id = self.model_name.split("/", 1)
        if provider != "lmstudio":
            raise ValueError("PiLmStudio requires an lmstudio/<model-id> model name")

        agent_dir = EnvironmentPaths.agent_dir
        session_path = agent_dir / self._SESSION_FILENAME
        html_path = agent_dir / self._SESSION_HTML_FILENAME
        export_log_path = agent_dir / self._SESSION_EXPORT_LOG_FILENAME
        output_path = agent_dir / self._OUTPUT_FILENAME

        await self.exec_as_agent(
            environment,
            command=(
                f"mkdir -p {shlex.quote(agent_dir.as_posix())} && "
                f"rm -f {shlex.quote(session_path.as_posix())} "
                f"{shlex.quote(html_path.as_posix())} "
                f"{shlex.quote(export_log_path.as_posix())}"
            ),
        )

        skills_command = self._build_register_skills_command()
        if skills_command:
            await self.exec_as_agent(environment, command=skills_command)

        model_args = (
            f"--provider {shlex.quote(provider)} --model {shlex.quote(model_id)} "
        )
        cli_flags = self.build_cli_flags()
        if cli_flags:
            cli_flags += " "

        try:
            await self.exec_as_agent(
                environment,
                command=(
                    ". ~/.nvm/nvm.sh; "
                    "pi --print --mode json "
                    f"--session {shlex.quote(session_path.as_posix())} "
                    f"{model_args}"
                    f"{cli_flags}"
                    f"{shlex.quote(instruction)} "
                    "2>&1 </dev/null | "
                    "grep -v '\"type\":\"message_update\"' | "
                    f"stdbuf -oL tee {shlex.quote(output_path.as_posix())}"
                ),
            )
        finally:
            await self._export_session(
                environment,
                session_path,
                html_path,
                export_log_path,
            )

    async def _export_session(
        self,
        environment: BaseEnvironment,
        session_path: PurePosixPath,
        html_path: PurePosixPath,
        export_log_path: PurePosixPath,
    ) -> None:
        """Best-effort export that does not alter the benchmark result."""
        session = shlex.quote(session_path.as_posix())
        html = shlex.quote(html_path.as_posix())
        export_log = shlex.quote(export_log_path.as_posix())

        try:
            await self.exec_as_agent(
                environment,
                command=(
                    ". ~/.nvm/nvm.sh; "
                    f"if [ ! -s {session} ]; then "
                    f"printf '%s\\n' 'No persisted Pi session was produced.' > {export_log}; "
                    "else "
                    "set +e; "
                    f"pi --export {session} {html} > {export_log} 2>&1; "
                    "status=$?; "
                    "if [ \"$status\" -ne 0 ]; then "
                    "printf 'Pi session export failed with exit code %s.\\n' "
                    f"\"$status\" >> {export_log}; "
                    "fi; "
                    "fi; "
                    "exit 0"
                ),
            )
        except Exception as exc:
            self.logger.warning("Failed to export Pi session HTML: %s", exc)
