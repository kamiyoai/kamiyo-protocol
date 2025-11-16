from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
class AgentEndpoint(BaseModel):
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
    id: str
    agent_uuid: str
    client_address: str
    score: int
    tag1: Optional[str]
    tag2: Optional[str]
    is_revoked: bool
    created_at: datetime
class AgentReputationSummary(BaseModel):
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
    agents: List[AgentStatsResponse]
    total: int
    limit: int
    offset: int
