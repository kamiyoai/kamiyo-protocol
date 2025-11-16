from typing import Optional, Dict, Any
class ERC8004Exception(Exception):
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "details": self.details
            }
        }
class AgentNotFoundException(ERC8004Exception):
    def __init__(self, chain: str, agent_id: int):
        super().__init__(
            message=f"Agent {agent_id} already exists on chain {chain}",
            status_code=409,
            error_code="AGENT_ALREADY_EXISTS",
            details={"chain": chain, "agent_id": agent_id}
        )
class InvalidAddressException(ERC8004Exception):
    def __init__(self, score: int):
        super().__init__(
            message=f"Score must be between 0 and 100, got {score}",
            status_code=400,
            error_code="INVALID_SCORE",
            details={"score": score, "min": 0, "max": 100}
        )
class PaymentNotFoundException(ERC8004Exception):
    def __init__(self, tx_hash: str, existing_agent_uuid: str):
        super().__init__(
            message=f"Payment {tx_hash} already linked to agent {existing_agent_uuid}",
            status_code=409,
            error_code="PAYMENT_ALREADY_LINKED",
            details={"tx_hash": tx_hash, "existing_agent_uuid": existing_agent_uuid}
        )
class AgentSuspendedException(ERC8004Exception):
    def __init__(self, operation: str, agent_uuid: str, address: str):
        super().__init__(
            message=f"Address {address} not authorized to {operation} on agent {agent_uuid}",
            status_code=403,
            error_code="UNAUTHORIZED_OPERATION",
            details={
                "operation": operation,
                "agent_uuid": agent_uuid,
                "address": address
            }
        )
class RateLimitExceededException(ERC8004Exception):
    def __init__(self, operation: str, original_error: Optional[str] = None):
        super().__init__(
            message=f"Database {operation} failed",
            status_code=500,
            error_code="DATABASE_ERROR",
            details={"operation": operation, "original_error": original_error}
        )
class ValidationException(ERC8004Exception):
    def __init__(self, chain: str, supported_chains: list):
        super().__init__(
            message=f"Chain '{chain}' not supported",
            status_code=400,
            error_code="CHAIN_NOT_SUPPORTED",
            details={"chain": chain, "supported_chains": supported_chains}
        )
class RegistrationFileInvalidException(ERC8004Exception):
