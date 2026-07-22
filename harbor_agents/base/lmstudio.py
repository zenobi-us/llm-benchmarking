"""Harness-neutral connection details for a local LM Studio server."""

from __future__ import annotations

import socket
from typing import Any

from .provider import AgentProviderBase, AgentProviderSpec


def _discover_host_ip() -> str:
    """Return the IPv4 address used by the host's default route."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("1.1.1.1", 80))
            return str(connection.getsockname()[0])
    except OSError as exc:
        raise RuntimeError("Could not discover host IPv4 address") from exc


class LmStudioAgentProvider(AgentProviderBase):
    """Prepare any compatible harness to use a local LM Studio server."""

    PROVIDER_NAME = "lmstudio"
    DEFAULT_MODEL_ID = "google/gemma-4-26b-a4b-qat"
    LOCAL_PROVIDER = True

    def __init__(
        self,
        *args: Any,
        lmstudio_base_url: str | None = None,
        lmstudio_model: str | None = None,
        lmstudio_api_key: str = "lm-studio",
        **kwargs: Any,
    ) -> None:
        self._lmstudio_base_url = (
            lmstudio_base_url or f"http://{_discover_host_ip()}:1234/v1"
        ).rstrip("/")
        self._lmstudio_api_key = lmstudio_api_key

        super().__init__(
            *args,
            provider_model=lmstudio_model,
            **kwargs,
        )

    def provider_spec(self) -> AgentProviderSpec:
        return AgentProviderSpec(
            name=self.provider_name,
            model_id=self.configured_model_id,
            base_url=self._lmstudio_base_url,
            api_protocol="openai-completions",
            api_key=self._lmstudio_api_key,
            model_inputs=("text", "image"),
            supports_developer_role=False,
            supports_reasoning_effort=False,
            local=self.LOCAL_PROVIDER,
        )
