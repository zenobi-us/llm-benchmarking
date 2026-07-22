"""Model-provider declarations that stay independent of agent harnesses.

Providers describe connection requirements; harnesses translate that description
into their own configuration format. Keeping that boundary here prevents a local
provider such as LM Studio from silently depending on Pi's ``models.json`` schema.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from harbor.environments.base import BaseEnvironment


@dataclass(frozen=True)
class AgentProviderSpec:
    """Harness-neutral description of a model provider connection."""

    name: str
    model_id: str
    base_url: str | None = None
    api_protocol: str | None = None
    api_key: str | None = None
    model_inputs: tuple[str, ...] = ("text",)
    supports_developer_role: bool | None = None
    supports_reasoning_effort: bool | None = None
    local: bool = False


class AgentProviderBase:
    """Cooperative mixin that validates and configures one model provider."""

    PROVIDER_NAME: ClassVar[str] = ""
    DEFAULT_MODEL_ID: ClassVar[str | None] = None
    LOCAL_PROVIDER: ClassVar[bool] = False

    def __init__(
        self,
        *args: Any,
        provider_model: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._provider_model_override = provider_model
        super().__init__(*args, **kwargs)
        self._configured_model_id = (
            provider_model or self._declared_model_id() or self.DEFAULT_MODEL_ID
        )

    @property
    def provider_name(self) -> str:
        if not self.PROVIDER_NAME:
            raise TypeError(f"{type(self).__name__} must declare PROVIDER_NAME")
        return self.PROVIDER_NAME

    @property
    def configured_model_id(self) -> str:
        if not self._configured_model_id:
            raise ValueError(f"{type(self).__name__} requires a model ID")
        return self._configured_model_id

    def _declared_model_id(self) -> str | None:
        if not self.model_name:
            return None

        provider, separator, model_id = self.model_name.partition("/")
        if not separator or not model_id:
            raise ValueError("Model name must use the format provider/<model-id>")
        if provider != self.provider_name:
            raise ValueError(
                f"{type(self).__name__} requires a model name in the format "
                f"{self.provider_name}/<model-id>"
            )
        return model_id

    def model_selection(self) -> tuple[str, str]:
        """Return the provider and model ID passed to the harness CLI."""
        model_id = self._declared_model_id()
        if model_id is None:
            raise ValueError("Model name must use the format provider/<model-id>")
        return self.provider_name, model_id

    def provider_runtime_environment(self) -> dict[str, str]:
        """Return per-execution environment variables required by the provider."""
        return {}

    def provider_spec(self) -> AgentProviderSpec:
        """Describe this provider without assuming a particular harness format."""
        return AgentProviderSpec(
            name=self.provider_name,
            model_id=self.configured_model_id,
        )

    async def install(self, environment: BaseEnvironment) -> None:
        # The harness must exist before it can consume the provider declaration.
        # Calling the next MRO implementation directly keeps the provider generic:
        # Pi, OpenCode, and future harnesses can each translate the same spec.
        await super().install(environment)
        await super().configure_model_provider(environment, self.provider_spec())
