from typing import Optional, Dict, Any


class ERC8004Exception(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 400,
        error_code: str = "ERC8004_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": {
                "code": self.error_code,
                "message": self.message,
                "details": self.details
            }
        }


class AgentNotFoundException(ERC8004Exception):
    def __init__(self, agent_uuid: str):
        super().__init__(
            message=f"Agent {agent_uuid} not found",
            status_code=404,
            error_code="AGENT_NOT_FOUND",
            details={"agent_uuid": agent_uuid}
        )


class AgentAlreadyExistsException(ERC8004Exception):
    def __init__(self, chain: str, agent_id: int):
        super().__init__(
            message=f"Agent {agent_id} already exists on chain {chain}",
            status_code=409,
            error_code="AGENT_ALREADY_EXISTS",
            details={"chain": chain, "agent_id": agent_id}
        )


class InvalidAddressException(ERC8004Exception):
    def __init__(self, address: str, field: str = "address"):
        super().__init__(
            message=f"Invalid Ethereum address: {address}",
            status_code=400,
            error_code="INVALID_ADDRESS",
            details={"field": field, "address": address}
        )


class InvalidScoreException(ERC8004Exception):
    def __init__(self, score: int):
        super().__init__(
            message=f"Score must be between 0 and 100, got {score}",
            status_code=400,
            error_code="INVALID_SCORE",
            details={"score": score, "min": 0, "max": 100}
        )


class PaymentNotFoundException(ERC8004Exception):
    def __init__(self, tx_hash: str):
        super().__init__(
            message=f"Payment {tx_hash} not found",
            status_code=404,
            error_code="PAYMENT_NOT_FOUND",
            details={"tx_hash": tx_hash}
        )


class PaymentAlreadyLinkedException(ERC8004Exception):
    def __init__(self, tx_hash: str, existing_agent_uuid: str):
        super().__init__(
            message=f"Payment {tx_hash} already linked to agent {existing_agent_uuid}",
            status_code=409,
            error_code="PAYMENT_ALREADY_LINKED",
            details={"tx_hash": tx_hash, "existing_agent_uuid": existing_agent_uuid}
        )


class AgentSuspendedException(ERC8004Exception):
    def __init__(self, agent_uuid: str, reason: Optional[str] = None):
        super().__init__(
            message=f"Agent {agent_uuid} is suspended",
            status_code=403,
            error_code="AGENT_SUSPENDED",
            details={"agent_uuid": agent_uuid, "reason": reason}
        )


class UnauthorizedOperationException(ERC8004Exception):
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
    def __init__(self, limit: str, retry_after: int):
        super().__init__(
            message=f"Rate limit exceeded for {limit}",
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            details={"limit": limit, "retry_after": retry_after}
        )


class DatabaseException(ERC8004Exception):
    def __init__(self, operation: str, original_error: Optional[str] = None):
        super().__init__(
            message=f"Database {operation} failed",
            status_code=500,
            error_code="DATABASE_ERROR",
            details={"operation": operation, "original_error": original_error}
        )


class ValidationException(ERC8004Exception):
    def __init__(self, field: str, message: str):
        super().__init__(
            message=f"Validation failed for {field}: {message}",
            status_code=400,
            error_code="VALIDATION_ERROR",
            details={"field": field}
        )


class ChainNotSupportedException(ERC8004Exception):
    def __init__(self, chain: str, supported_chains: list):
        super().__init__(
            message=f"Chain '{chain}' not supported",
            status_code=400,
            error_code="CHAIN_NOT_SUPPORTED",
            details={"chain": chain, "supported_chains": supported_chains}
        )


class RegistrationFileInvalidException(ERC8004Exception):
    def __init__(self, errors: list):
        super().__init__(
            message=f"Registration file validation failed: {len(errors)} errors",
            status_code=400,
            error_code="REGISTRATION_FILE_INVALID",
            details={"errors": errors}
        )


class CircularDependencyException(ERC8004Exception):
    def __init__(self, cycle_agents: list, cycle_depth: int):
        super().__init__(
            message=f"Circular dependency detected: {len(cycle_agents)} agents in cycle",
            status_code=409,
            error_code="CIRCULAR_DEPENDENCY",
            details={"cycle_agents": cycle_agents, "cycle_depth": cycle_depth}
        )


class StakeLockedException(ERC8004Exception):
    def __init__(self, agent_uuid: str, locked_until: str):
        super().__init__(
            message=f"Stake for agent {agent_uuid} is locked until {locked_until}",
            status_code=403,
            error_code="STAKE_LOCKED",
            details={"agent_uuid": agent_uuid, "locked_until": locked_until}
        )


class InsufficientStakeException(ERC8004Exception):
    def __init__(self, agent_uuid: str, current: float, required: float):
        super().__init__(
            message=f"Insufficient stake: {current} USDC (required: {required} USDC)",
            status_code=403,
            error_code="INSUFFICIENT_STAKE",
            details={
                "agent_uuid": agent_uuid,
                "current_stake_usdc": current,
                "required_stake_usdc": required
            }
        )
