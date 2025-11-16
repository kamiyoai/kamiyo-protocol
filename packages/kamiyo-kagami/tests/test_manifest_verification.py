"""Production-grade tests for manifest verification"""

import pytest
from datetime import datetime, timedelta
from decimal import Decimal
from eth_account import Account

from api.erc8004.signature_verification import SignatureVerifier
from api.erc8004.manifest_verification import ManifestVerifier
from api.erc8004.exceptions import (
    ValidationException,
    AgentNotFoundException,
    CircularDependencyException
)


@pytest.fixture
def test_account():
    """Generate test Ethereum account"""
    return Account.create()


@pytest.fixture
def test_manifest_data(test_account):
    """Test manifest data"""
    return {
        "agent_uuid": "123e4567-e89b-12d3-a456-426614174000",
        "endpoint_uri": "https://agent.example.com/forward",
        "pubkey": test_account.key.hex(),
        "nonce": 1,
        "valid_from": datetime.utcnow(),
        "valid_until": datetime.utcnow() + timedelta(hours=24)
    }


class TestSignatureVerifier:
    """Test cryptographic signature verification"""

    def test_manifest_hash_computation(self, test_manifest_data):
        """Test deterministic hash computation"""
        hash1 = SignatureVerifier.compute_manifest_hash(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri=test_manifest_data["endpoint_uri"],
            pubkey=test_manifest_data["pubkey"],
            nonce=test_manifest_data["nonce"],
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat()
        )

        hash2 = SignatureVerifier.compute_manifest_hash(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri=test_manifest_data["endpoint_uri"],
            pubkey=test_manifest_data["pubkey"],
            nonce=test_manifest_data["nonce"],
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat()
        )

        assert hash1 == hash2
        assert hash1.startswith("0x")
        assert len(hash1) == 66

    def test_receipt_hash_computation(self):
        """Test receipt hash determinism"""
        hash1 = SignatureVerifier.compute_receipt_hash(
            root_tx_hash="0x" + "a" * 64,
            hop=1,
            source_agent_uuid="123e4567-e89b-12d3-a456-426614174000",
            dest_agent_uuid="223e4567-e89b-12d3-a456-426614174000",
            next_hop_hash="0x" + "b" * 64,
            receipt_nonce=100
        )

        hash2 = SignatureVerifier.compute_receipt_hash(
            root_tx_hash="0x" + "a" * 64,
            hop=1,
            source_agent_uuid="123e4567-e89b-12d3-a456-426614174000",
            dest_agent_uuid="223e4567-e89b-12d3-a456-426614174000",
            next_hop_hash="0x" + "b" * 64,
            receipt_nonce=100
        )

        assert hash1 == hash2

    def test_manifest_signature_verification_valid(self, test_account, test_manifest_data):
        """Test valid signature verification"""
        from eth_account.messages import encode_defunct

        message = f"{test_manifest_data['agent_uuid']}{test_manifest_data['endpoint_uri']}{test_manifest_data['pubkey']}{test_manifest_data['nonce']}{test_manifest_data['valid_from'].isoformat()}{test_manifest_data['valid_until'].isoformat()}"
        message_hash = encode_defunct(text=message)
        signed = test_account.sign_message(message_hash)

        is_valid = SignatureVerifier.verify_manifest_signature(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri=test_manifest_data["endpoint_uri"],
            pubkey=test_manifest_data["pubkey"],
            nonce=test_manifest_data["nonce"],
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat(),
            signature=signed.signature.hex(),
            expected_signer=test_account.address
        )

        assert is_valid is True

    def test_manifest_signature_verification_invalid_signer(self, test_account, test_manifest_data):
        """Test invalid signer detection"""
        from eth_account.messages import encode_defunct

        message = f"{test_manifest_data['agent_uuid']}{test_manifest_data['endpoint_uri']}{test_manifest_data['pubkey']}{test_manifest_data['nonce']}{test_manifest_data['valid_from'].isoformat()}{test_manifest_data['valid_until'].isoformat()}"
        message_hash = encode_defunct(text=message)
        signed = test_account.sign_message(message_hash)

        wrong_account = Account.create()

        is_valid = SignatureVerifier.verify_manifest_signature(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri=test_manifest_data["endpoint_uri"],
            pubkey=test_manifest_data["pubkey"],
            nonce=test_manifest_data["nonce"],
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat(),
            signature=signed.signature.hex(),
            expected_signer=wrong_account.address
        )

        assert is_valid is False

    def test_routing_hash_computation(self):
        """Test routing path hash"""
        routing_path = ["0xaaa", "0xbbb", "0xccc"]
        hash1 = SignatureVerifier.compute_routing_hash(routing_path)
        hash2 = SignatureVerifier.compute_routing_hash(routing_path)

        assert hash1 == hash2
        assert hash1.startswith("0x")


class TestManifestVerifier:
    """Test manifest verification business logic"""

    def test_high_value_threshold(self):
        """Verify high-value threshold constant"""
        assert ManifestVerifier.HIGH_VALUE_THRESHOLD_USDC == Decimal("10000.00")

    def test_commitment_timelock(self):
        """Verify timelock constant"""
        assert ManifestVerifier.COMMITMENT_TIMELOCK_SECONDS == 300


class TestSecurityProperties:
    """Test security properties"""

    def test_nonce_prevents_replay(self, test_account, test_manifest_data):
        """Nonce must prevent signature replay"""
        from eth_account.messages import encode_defunct

        # Sign with nonce 1
        message1 = f"{test_manifest_data['agent_uuid']}{test_manifest_data['endpoint_uri']}{test_manifest_data['pubkey']}{1}{test_manifest_data['valid_from'].isoformat()}{test_manifest_data['valid_until'].isoformat()}"
        message_hash1 = encode_defunct(text=message1)
        signed1 = test_account.sign_message(message_hash1)

        # Same signature shouldn't work with nonce 2
        is_valid = SignatureVerifier.verify_manifest_signature(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri=test_manifest_data["endpoint_uri"],
            pubkey=test_manifest_data["pubkey"],
            nonce=2,
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat(),
            signature=signed1.signature.hex(),
            expected_signer=test_account.address
        )

        assert is_valid is False

    def test_endpoint_change_invalidates_signature(self, test_account, test_manifest_data):
        """Changing endpoint must invalidate signature"""
        from eth_account.messages import encode_defunct

        message = f"{test_manifest_data['agent_uuid']}{test_manifest_data['endpoint_uri']}{test_manifest_data['pubkey']}{test_manifest_data['nonce']}{test_manifest_data['valid_from'].isoformat()}{test_manifest_data['valid_until'].isoformat()}"
        message_hash = encode_defunct(text=message)
        signed = test_account.sign_message(message_hash)

        # Verify with different endpoint
        is_valid = SignatureVerifier.verify_manifest_signature(
            agent_uuid=test_manifest_data["agent_uuid"],
            endpoint_uri="https://different.com/forward",
            pubkey=test_manifest_data["pubkey"],
            nonce=test_manifest_data["nonce"],
            valid_from_iso=test_manifest_data["valid_from"].isoformat(),
            valid_until_iso=test_manifest_data["valid_until"].isoformat(),
            signature=signed.signature.hex(),
            expected_signer=test_account.address
        )

        assert is_valid is False
