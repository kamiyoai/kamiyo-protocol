"""
ERC-8004 Custom Exceptions
Production-grade error handling for agent identity system
"""

from typing import Optional, Dict, Any


class ERC8004Exception(Exception):
    """Base exception for ERC-8004 operations"""

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "ERC8004_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to API response format"""
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "details": self.details
            }
        }


class AgentNotFoundException(ERC8004Exception):
    """Agent not found in registry"""

    def __init__(self, agent_uuid: str):
        super().__init__(
            message=f"Agent {agent_uuid} not found",
            status_code=404,
            error_code="AGENT_NOT_FOUND",
            details={"agent_uuid": agent_uuid}
        )


class AgentAlreadyExistsException(ERC8004Exception):
    """Agent already registered"""

    def __init__(self, chain: str, agent_id: int):
        super().__init__(
            message=f"Agent {agent_id} already exists on chain {chain}",
            status_code=409,
            error_code="AGENT_ALREADY_EXISTS",
            details={"chain": chain, "agent_id": agent_id}
        )


class InvalidAddressException(ERC8004Exception):
    """Invalid Ethereum address format"""

    def __init__(self, address: str, field: str = "address"):
        super().__init__(
            message=f"Invalid Ethereum address format: {address}",
            status_code=400,
            error_code="INVALID_ADDRESS",
            details={"address": address, "field": field}
        )


class InvalidScoreException(ERC8004Exception):
    """Invalid reputation score"""

    def __init__(self, score: int):
        super().__init__(
            message=f"Score must be between 0 and 100, got {score}",
            status_code=400,
            error_code="INVALID_SCORE",
            details={"score": score, "min": 0, "max": 100}
        )


class PaymentNotFoundException(ERC8004Exception):
    """Payment not found in x402 system"""

    def __init__(self, tx_hash: str, chain: str):
        super().__init__(
            message=f"Payment not found: {tx_hash} on {chain}",
            status_code=404,
            error_code="PAYMENT_NOT_FOUND",
            details={"tx_hash": tx_hash, "chain": chain}
        )


class PaymentAlreadyLinkedException(ERC8004Exception):
    """Payment already linked to another agent"""

    def __init__(self, tx_hash: str, existing_agent_uuid: str):
        super().__init__(
            message=f"Payment {tx_hash} already linked to agent {existing_agent_uuid}",
            status_code=409,
            error_code="PAYMENT_ALREADY_LINKED",
            details={"tx_hash": tx_hash, "existing_agent_uuid": existing_agent_uuid}
        )


class AgentSuspendedException(ERC8004Exception):
    """Agent is suspended"""

    def __init__(self, agent_uuid: str):
        super().__init__(
            message=f"Agent {agent_uuid} is suspended",
            status_code=403,
            error_code="AGENT_SUSPENDED",
            details={"agent_uuid": agent_uuid}
        )


class UnauthorizedOperationException(ERC8004Exception):
    """Unauthorized operation on agent"""

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
    """Rate limit exceeded"""

    def __init__(self, limit: int, window: str):
        super().__init__(
            message=f"Rate limit exceeded: {limit} requests per {window}",
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            details={"limit": limit, "window": window}
        )


class DatabaseException(ERC8004Exception):
    """Database operation failed"""

    def __init__(self, operation: str, original_error: Optional[str] = None):
        super().__init__(
            message=f"Database {operation} failed",
            status_code=500,
            error_code="DATABASE_ERROR",
            details={"operation": operation, "original_error": original_error}
        )


class ValidationException(ERC8004Exception):
    """Input validation failed"""

    def __init__(self, field: str, message: str):
        super().__init__(
            message=f"Validation failed for {field}: {message}",
            status_code=400,
            error_code="VALIDATION_ERROR",
            details={"field": field, "validation_message": message}
        )


class ChainNotSupportedException(ERC8004Exception):
    """Blockchain chain not supported"""

    def __init__(self, chain: str, supported_chains: list):
        super().__init__(
            message=f"Chain '{chain}' not supported",
            status_code=400,
            error_code="CHAIN_NOT_SUPPORTED",
            details={"chain": chain, "supported_chains": supported_chains}
        )


class RegistrationFileInvalidException(ERC8004Exception):
    """Invalid ERC-8004 registration file format"""

    def __init__(self, errors: list):
        super().__init__(
            message="Invalid ERC-8004 registration file format",
            status_code=400,
            error_code="INVALID_REGISTRATION_FILE",
            details={"validation_errors": errors}
        )
