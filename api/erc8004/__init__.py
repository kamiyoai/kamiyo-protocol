"""
ERC-8004 Agent Identity Module
Implements agent identity and reputation system
"""

from .routes import router
from .models import (
    RegisterAgentRequest,
    AgentResponse,
    ReputationFeedbackRequest,
    AgentStatsResponse
)

__all__ = [
    "router",
    "RegisterAgentRequest",
    "AgentResponse",
    "ReputationFeedbackRequest",
    "AgentStatsResponse"
]
