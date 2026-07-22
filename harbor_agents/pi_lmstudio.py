"""Harbor's Pi agent configured for the local LM Studio server."""

from __future__ import annotations

from .base import LmStudioAgentProvider, PiMonoAgentBase
from .base.lmstudio import _discover_host_ip, socket


class PiLmStudio(LmStudioAgentProvider, PiMonoAgentBase):
    """Compose LM Studio configuration and the Pi harness.

    The provider configures the already-installed harness, and
    ``PiMonoAgentBase`` owns the actual command and session export. Completed
    jobs are indexed by ``harbor_agents.job_index:JobIndexPlugin``.
    """

    @staticmethod
    def name() -> str:
        return "pi-lmstudio"


__all__ = ["PiLmStudio"]
