"""Pi harness behavior with provider translation and persisted session export."""

from __future__ import annotations

import json
import shlex
from pathlib import Path, PurePosixPath
from typing import Any

from harbor.agents.installed.pi import Pi
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trial.paths import EnvironmentPaths

from .provider import AgentProviderSpec


class PiMonoAgentBase(Pi):
    """Run Pi with a persisted session and export that session as HTML.

    Provider mixins deliberately do not know Pi's configuration schema. This
    harness consumes their generic spec and writes Pi-specific ``models.json``.
    """

    _SESSION_FILENAME = "session.jsonl"
    _SESSION_HTML_FILENAME = "session.html"
    _SESSION_EXPORT_LOG_FILENAME = "session-export.txt"

    def __init__(
        self,
        *args: Any,
        models_json_path: str | Path | None = None,
        extra_env: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> None:
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

        # Local providers must not trigger Pi's online model discovery. This is
        # a Pi concern, so the provider only marks itself local in its spec.
        merged_env: dict[str, str] = {}
        if getattr(self, "LOCAL_PROVIDER", False):
            merged_env["PI_OFFLINE"] = "1"
        if extra_env:
            merged_env.update(extra_env)

        super().__init__(*args, extra_env=merged_env, **kwargs)

    def session_artifact_path(self) -> Path:
        return self.logs_dir / self._SESSION_HTML_FILENAME

    async def configure_model_provider(
        self,
        environment: BaseEnvironment,
        provider: AgentProviderSpec,
    ) -> None:
        """Translate a harness-neutral provider spec into Pi configuration."""
        if self._models_json_path:
            models_config = json.loads(self._models_json_path.read_text())
            try:
                models_config["providers"][provider.name]["baseUrl"] = provider.base_url
            except (KeyError, TypeError) as exc:
                raise ValueError(
                    f"Pi models config must define providers.{provider.name}"
                ) from exc
        elif provider.base_url:
            models_config = {
                "providers": {
                    provider.name: {
                        "baseUrl": provider.base_url,
                        "api": provider.api_protocol,
                        "apiKey": provider.api_key,
                        "compat": {
                            "supportsDeveloperRole": provider.supports_developer_role,
                            "supportsReasoningEffort": provider.supports_reasoning_effort,
                        },
                        "models": [
                            {
                                "id": provider.model_id,
                                "input": list(provider.model_inputs),
                            }
                        ],
                    }
                }
            }
        else:
            # Native Pi providers (for example Bedrock) need credentials but no
            # custom provider file. This keeps the future provider mixin small.
            return

        payload = shlex.quote(json.dumps(models_config, indent=2))
        await self.exec_as_agent(
            environment,
            command=(
                'mkdir -p "$HOME/.pi/agent" && '
                f"printf '%s\\n' {payload} > \"$HOME/.pi/agent/models.json\""
            ),
        )

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        agent_dir = EnvironmentPaths.agent_dir
        session_path = agent_dir / self._SESSION_FILENAME
        html_path = agent_dir / self._SESSION_HTML_FILENAME
        export_log_path = agent_dir / self._SESSION_EXPORT_LOG_FILENAME
        output_path = agent_dir / self._OUTPUT_FILENAME

        try:
            # Clear old artifacts before any fallible current-run setup. Without
            # this ordering, a template or model error could re-export a stale
            # session from an earlier run as if it belonged to this attempt.
            await self.exec_as_agent(
                environment,
                command=(
                    f"mkdir -p {shlex.quote(agent_dir.as_posix())} && "
                    f"rm -f {shlex.quote(session_path.as_posix())} "
                    f"{shlex.quote(html_path.as_posix())} "
                    f"{shlex.quote(export_log_path.as_posix())}"
                ),
            )

            # Prompt rendering stays inside the export boundary and occurs only
            # here; decorating another MRO layer would render it twice.
            instruction = self.render_instruction(instruction)
            provider, model_id = self.model_selection()

            skills_command = self._build_register_skills_command()
            if skills_command:
                await self.exec_as_agent(environment, command=skills_command)

            model_args = (
                f"--provider {shlex.quote(provider)} --model {shlex.quote(model_id)} "
            )
            cli_flags = self.build_cli_flags()
            if cli_flags:
                cli_flags += " "

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
                env=self.provider_runtime_environment(),
            )
        finally:
            # Preserve the transcript even when Pi fails; job indexing happens
            # later, after Harbor finishes every trial.
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
                    'if [ "$status" -ne 0 ]; then '
                    "printf 'Pi session export failed with exit code %s.\\n' "
                    f'"$status" >> {export_log}; '
                    "fi; "
                    "fi; "
                    "exit 0"
                ),
            )
        except Exception as exc:
            self.logger.warning("Failed to export Pi session HTML: %s", exc)
