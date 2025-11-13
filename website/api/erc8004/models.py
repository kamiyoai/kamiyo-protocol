"""
ERC-8004 Agent Identity Models
Pydantic models for agent registration and reputation
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal


class AgentEndpoint(BaseModel):
    """Agent endpoint definition (MCP, A2A, wallet, etc.)"""
    name: str = Field(..., description="Endpoint type: MCP, A2A, ENS, DID, agentWallet")
    endpoint: str = Field(..., description="Endpoint URI or address")
    version: Optional[str] = Field(None, description="Endpoint version")


class AgentRegistrationFile(BaseModel):
    """ERC-8004 compliant agent registration file"""
    type: str = Field(
        default="https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        description="Registration file type"
    )
    name: str = Field(..., description="Agent name")
    description: str = Field(..., description="Agent description")
    image: Optional[str] = Field(None, description="Agent image URL")
    endpoints: List[AgentEndpoint] = Field(default_factory=list)
    registrations: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Cross-chain registrations"
    )
    supportedTrust: List[str] = Field(
        default_factory=lambda: ["reputation", "crypto-economic"],
        description="Supported trust mechanisms"
    )


class RegisterAgentRequest(BaseModel):
    """Request to register a new agent"""
    owner_address: str = Field(..., description="Owner wallet address")
    chain: str = Field(default="base", description="Blockchain network")
    registration_file: AgentRegistrationFile
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)

    @field_validator('owner_address')
    @classmethod
    def validate_address(cls, v: str) -> str:
        if not v.startswith('0x') or len(v) != 42:
            raise ValueError('Invalid Ethereum address')
        return v.lower()


class AgentResponse(BaseModel):
    """Agent identity response"""
    agent_uuid: str
    agent_id: int
    chain: str
    registry_address: str
    owner_address: str
    token_uri: Optional[str]
    status: str
    created_at: datetime
    registration_file: Optional[AgentRegistrationFile]


class ReputationFeedbackRequest(BaseModel):
    """Request to submit reputation feedback"""
    agent_uuid: str
    client_address: str
    score: int = Field(..., ge=0, le=100, description="Score 0-100")
    tag1: Optional[str] = Field(None, max_length=64)
    tag2: Optional[str] = Field(None, max_length=64)
    file_uri: Optional[str] = None
    file_hash: Optional[str] = None
    feedback_auth: Optional[str] = None

    @field_validator('client_address')
    @classmethod
    def validate_client_address(cls, v: str) -> str:
        if not v.startswith('0x') or len(v) != 42:
            raise ValueError('Invalid Ethereum address')
        return v.lower()


class ReputationFeedbackResponse(BaseModel):
    """Reputation feedback response"""
    id: str
    agent_uuid: str
    client_address: str
    score: int
    tag1: Optional[str]
    tag2: Optional[str]
    is_revoked: bool
    created_at: datetime


class AgentReputationSummary(BaseModel):
    """Agent reputation summary"""
    agent_uuid: str
    agent_id: int
    total_feedback: int
    average_score: Optional[Decimal]
    positive_feedback: int
    negative_feedback: int
    revoked_feedback: int
    last_feedback_at: Optional[datetime]


class AgentPaymentStats(BaseModel):
    """Agent payment statistics"""
    agent_uuid: str
    agent_id: int
    total_payments: int
    total_amount_usdc: Optional[Decimal]
    successful_payments: int
    failed_payments: int
    avg_payment_amount: Optional[Decimal]
    success_rate: Optional[Decimal]
    last_payment_at: Optional[datetime]


class AgentStatsResponse(BaseModel):
    """Combined agent statistics"""
    agent_uuid: str
    agent_id: int
    chain: str
    registry_address: str
    owner_address: str
    status: str
    registered_at: datetime

    # Reputation metrics
    total_feedback: Optional[int] = 0
    reputation_score: Optional[Decimal] = None
    positive_feedback: Optional[int] = 0
    negative_feedback: Optional[int] = 0

    # Payment metrics
    total_payments: Optional[int] = 0
    total_amount_usdc: Optional[Decimal] = None
    payment_success_rate: Optional[Decimal] = None
    last_payment_at: Optional[datetime] = None

    # Trust level
    trust_level: Optional[str] = "poor"


class LinkPaymentToAgentRequest(BaseModel):
    """Request to link x402 payment to agent"""
    agent_uuid: str
    tx_hash: str
    chain: str

    @field_validator('tx_hash')
    @classmethod
    def validate_tx_hash(cls, v: str) -> str:
        if not v.startswith('0x'):
            raise ValueError('Invalid transaction hash')
        return v.lower()


class AgentSearchRequest(BaseModel):
    """Agent search/filter request"""
    owner_address: Optional[str] = None
    chain: Optional[str] = None
    min_reputation_score: Optional[int] = Field(None, ge=0, le=100)
    min_success_rate: Optional[float] = Field(None, ge=0, le=100)
    trust_level: Optional[str] = None
    status: str = Field(default="active")
    limit: int = Field(default=50, le=100)
    offset: int = Field(default=0, ge=0)


class AgentListResponse(BaseModel):
    """Paginated agent list response"""
    agents: List[AgentStatsResponse]
    total: int
    limit: int
    offset: int
