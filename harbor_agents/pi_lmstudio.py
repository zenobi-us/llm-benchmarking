"""Harbor's Pi agent configured for the local LM Studio server."""

from __future__ import annotations

from .base import AgentBase, LmStudioAgentProvider, PiMonoAgentBase
from .base.lmstudio import _discover_host_ip, socket


class PiLmStudio(AgentBase, LmStudioAgentProvider, PiMonoAgentBase):
    """Compose job indexing, LM Studio configuration, and the Pi harness.

    The base order is intentional. ``AgentBase`` wraps the complete run so it
    indexes failures, the provider configures the already-installed harness,
    and ``PiMonoAgentBase`` owns the actual command and session export.
    """

    @staticmethod
    def name() -> str:
        return "pi-lmstudio"


__all__ = ["PiLmStudio"]
