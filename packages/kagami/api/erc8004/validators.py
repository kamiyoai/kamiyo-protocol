import re
from typing import Optional, List, Dict, Any
from decimal import Decimal, InvalidOperation
from .exceptions import (
    ValidationException,
    InvalidAddressException,
    InvalidScoreException,
    ChainNotSupportedException,
    RegistrationFileInvalidException
)
# Supported blockchain networks
SUPPORTED_CHAINS = {
    "base", "ethereum", "polygon", "arbitrum", "optimism",
    "avalanche", "bnb", "celo", "gnosis", "moonbeam",
    "aurora", "sepolia", "base-sepolia"
}
# Address validation regex
ETH_ADDRESS_REGEX = re.compile(r'^0x[a-fA-F0-9]{40}$')
TX_HASH_REGEX = re.compile(r'^0x[a-fA-F0-9]{64}$')
CHAIN_REGEX = re.compile(r'^[a-z0-9-]+$')
TAG_REGEX = re.compile(r'^[a-z0-9_-]+$')
KEY_REGEX = re.compile(r'^[a-zA-Z0-9_-]+$')
# Size limits
MAX_NAME_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
MAX_URI_LENGTH = 2048
MAX_TAG_LENGTH = 64
MAX_KEY_LENGTH = 100
MAX_ENDPOINTS = 20
MAX_REGISTRATIONS = 10
def validate_ethereum_address(address: str, field: str = "address") -> str:
    if not address or not isinstance(address, str):
        raise InvalidAddressException(address or "", field)
    address = address.strip()
    if not ETH_ADDRESS_REGEX.match(address):
        raise InvalidAddressException(address, field)
    # Return lowercase for consistent storage
    return address.lower()
def validate_tx_hash(tx_hash: str, field: str = "tx_hash") -> str:
    if not tx_hash or not isinstance(tx_hash, str):
        raise ValidationException(field, "Transaction hash required")
    tx_hash = tx_hash.strip()
    if not TX_HASH_REGEX.match(tx_hash):
        raise ValidationException(field, "Invalid transaction hash format")
    return tx_hash.lower()
def validate_chain(chain: str) -> str:
    if not chain or not isinstance(chain, str):
        raise ChainNotSupportedException(
            chain or "",
            list(SUPPORTED_CHAINS)
        )
    chain = chain.strip().lower()
    if not CHAIN_REGEX.match(chain):
        raise ValidationException("chain", "Invalid chain format")
    if chain not in SUPPORTED_CHAINS:
        raise ChainNotSupportedException(chain, list(SUPPORTED_CHAINS))
    return chain
def validate_score(score: int) -> int:
    if not isinstance(score, int):
        raise InvalidScoreException(score)
    if score < 0 or score > 100:
        raise InvalidScoreException(score)
    return score
def validate_tag(tag: Optional[str], field: str = "tag") -> Optional[str]:
    if tag is None or tag == "":
        return None
    if not isinstance(tag, str):
        raise ValidationException(field, "Tag must be a string")
    tag = tag.strip().lower()
    if len(tag) > MAX_TAG_LENGTH:
        raise ValidationException(
            field,
            f"Tag too long (max {MAX_TAG_LENGTH} characters)"
        )
    if not TAG_REGEX.match(tag):
        raise ValidationException(
            field,
            "Tag must contain only lowercase letters, numbers, underscores, and hyphens"
        )
    return tag
def validate_uri(uri: Optional[str], field: str = "uri") -> Optional[str]:
    if uri is None or uri == "":
        return None
    if not isinstance(uri, str):
        raise ValidationException(field, "URI must be a string")
    uri = uri.strip()
    if len(uri) > MAX_URI_LENGTH:
        raise ValidationException(
            field,
            f"URI too long (max {MAX_URI_LENGTH} characters)"
        )
    # Basic URI validation
    if not (uri.startswith("http://") or uri.startswith("https://") or
            uri.startswith("ipfs://") or uri.startswith("ar://")):
        raise ValidationException(
            field,
            "URI must start with http://, https://, ipfs://, or ar://"
        )
    return uri
def validate_metadata_key(key: str) -> str:
    if not key or not isinstance(key, str):
        raise ValidationException("key", "Metadata key required")
    key = key.strip()
    if len(key) > MAX_KEY_LENGTH:
        raise ValidationException(
            "key",
            f"Key too long (max {MAX_KEY_LENGTH} characters)"
        )
    if not KEY_REGEX.match(key):
        raise ValidationException(
            "key",
            "Key must contain only letters, numbers, underscores, and hyphens"
        )
    return key
def validate_agent_id(agent_id: int) -> int:
    if not isinstance(agent_id, int):
        raise ValidationException("agent_id", "Agent ID must be an integer")
    if agent_id <= 0:
        raise ValidationException("agent_id", "Agent ID must be positive")
    if agent_id > 2**63 - 1:
        raise ValidationException("agent_id", "Agent ID too large")
    return agent_id
def validate_registration_file(registration_file: Dict[str, Any]) -> Dict[str, Any]:
    errors = []
    # Check required fields
    if "name" not in registration_file:
        errors.append("Missing required field: name")
    elif not isinstance(registration_file["name"], str):
        errors.append("Field 'name' must be a string")
    elif len(registration_file["name"].strip()) == 0:
        errors.append("Field 'name' cannot be empty")
    elif len(registration_file["name"]) > MAX_NAME_LENGTH:
        errors.append(f"Field 'name' too long (max {MAX_NAME_LENGTH} characters)")
    if "description" not in registration_file:
        errors.append("Missing required field: description")
    elif not isinstance(registration_file["description"], str):
        errors.append("Field 'description' must be a string")
    elif len(registration_file["description"].strip()) == 0:
        errors.append("Field 'description' cannot be empty")
    elif len(registration_file["description"]) > MAX_DESCRIPTION_LENGTH:
        errors.append(f"Field 'description' too long (max {MAX_DESCRIPTION_LENGTH} characters)")
    # Validate type if present
    if "type" in registration_file:
        expected_type = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
        if registration_file["type"] != expected_type:
            errors.append(f"Invalid type, expected: {expected_type}")
    # Validate image if present
    if "image" in registration_file:
        try:
            validate_uri(registration_file["image"], "image")
        except ValidationException as e:
            errors.append(str(e))
    # Validate endpoints
    if "endpoints" not in registration_file:
        errors.append("Missing required field: endpoints")
    elif not isinstance(registration_file["endpoints"], list):
        errors.append("Field 'endpoints' must be an array")
    else:
        endpoints = registration_file["endpoints"]
        if len(endpoints) > MAX_ENDPOINTS:
            errors.append(f"Too many endpoints (max {MAX_ENDPOINTS})")
        for i, endpoint in enumerate(endpoints):
            if not isinstance(endpoint, dict):
                errors.append(f"Endpoint {i} must be an object")
                continue
            if "name" not in endpoint:
                errors.append(f"Endpoint {i} missing 'name'")
            elif endpoint["name"] not in [
                "MCP", "A2A", "OASF", "ENS", "DID", "agentWallet"
            ]:
                errors.append(f"Endpoint {i} has invalid name: {endpoint['name']}")
            if "endpoint" not in endpoint:
                errors.append(f"Endpoint {i} missing 'endpoint'")
            elif not isinstance(endpoint["endpoint"], str):
                errors.append(f"Endpoint {i} 'endpoint' must be a string")
    # Validate registrations if present
    if "registrations" in registration_file:
        if not isinstance(registration_file["registrations"], list):
            errors.append("Field 'registrations' must be an array")
        elif len(registration_file["registrations"]) > MAX_REGISTRATIONS:
            errors.append(f"Too many registrations (max {MAX_REGISTRATIONS})")
    # Validate supportedTrust if present
    if "supportedTrust" in registration_file:
        if not isinstance(registration_file["supportedTrust"], list):
            errors.append("Field 'supportedTrust' must be an array")
        else:
            valid_trust_types = {
                "reputation", "crypto-economic", "tee-attestation", "validation"
            }
            for trust_type in registration_file["supportedTrust"]:
                if trust_type not in valid_trust_types:
                    errors.append(f"Invalid trust type: {trust_type}")
    if errors:
        raise RegistrationFileInvalidException(errors)
    return registration_file
def sanitize_string(value: str, max_length: int) -> str:
    if not isinstance(value, str):
        raise ValidationException("value", "Must be a string")
    # Remove null bytes
    value = value.replace('\x00', '')
    # Strip whitespace
    value = value.strip()
    # Check length
    if len(value) > max_length:
        raise ValidationException(
            "value",
            f"String too long (max {max_length} characters)"
        )
    return value
def validate_pagination(limit: int, offset: int) -> tuple:
    if not isinstance(limit, int) or limit < 1:
        raise ValidationException("limit", "Limit must be a positive integer")
    if not isinstance(offset, int) or offset < 0:
        raise ValidationException("offset", "Offset must be non-negative")
    # Enforce maximum limit
    max_limit = 100
    if limit > max_limit:
        raise ValidationException(
            "limit",
            f"Limit too large (max {max_limit})"
        )
    return limit, offset
