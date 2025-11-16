"""Cryptographic signature verification for manifests and receipts"""

from typing import Dict, Optional
import hashlib
from eth_account import Account
from eth_account.messages import encode_defunct
from hexbytes import HexBytes

from .exceptions import ValidationException
from .monitoring import logger


class SignatureVerifier:
    """Production-grade signature verification"""

    @staticmethod
    def verify_manifest_signature(
        agent_uuid: str,
        endpoint_uri: str,
        pubkey: str,
        nonce: int,
        valid_from_iso: str,
        valid_until_iso: str,
        signature: str,
        expected_signer: str
    ) -> bool:
        """
        Verify manifest signature against expected signer

        Uses EIP-191 personal_sign format for web3 compatibility
        """
        try:
            message = f"{agent_uuid}{endpoint_uri}{pubkey}{nonce}{valid_from_iso}{valid_until_iso}"
            message_hash = encode_defunct(text=message)

            recovered_address = Account.recover_message(
                message_hash,
                signature=HexBytes(signature)
            )

            is_valid = recovered_address.lower() == expected_signer.lower()

            if not is_valid:
                logger.warning(
                    "manifest_signature_invalid",
                    expected=expected_signer,
                    recovered=recovered_address,
                    agent_uuid=agent_uuid
                )

            return is_valid

        except Exception as e:
            logger.error("signature_verification_failed", error=str(e))
            return False

    @staticmethod
    def verify_receipt_signature(
        root_tx_hash: str,
        hop: int,
        source_agent_uuid: str,
        dest_agent_uuid: str,
        next_hop_hash: Optional[str],
        receipt_nonce: int,
        signature: str,
        expected_signer: str
    ) -> bool:
        """Verify receipt signature"""
        try:
            message = f"{root_tx_hash}{hop}{source_agent_uuid}{dest_agent_uuid}{next_hop_hash or ''}{receipt_nonce}"
            message_hash = encode_defunct(text=message)

            recovered_address = Account.recover_message(
                message_hash,
                signature=HexBytes(signature)
            )

            is_valid = recovered_address.lower() == expected_signer.lower()

            if not is_valid:
                logger.warning(
                    "receipt_signature_invalid",
                    expected=expected_signer,
                    recovered=recovered_address,
                    root_tx=root_tx_hash
                )

            return is_valid

        except Exception as e:
            logger.error("receipt_verification_failed", error=str(e))
            return False

    @staticmethod
    def compute_manifest_hash(
        agent_uuid: str,
        endpoint_uri: str,
        pubkey: str,
        nonce: int,
        valid_from_iso: str,
        valid_until_iso: str
    ) -> str:
        """Deterministic manifest hash computation"""
        data = f"{agent_uuid}{endpoint_uri}{pubkey}{nonce}{valid_from_iso}{valid_until_iso}"
        return "0x" + hashlib.sha256(data.encode()).hexdigest()

    @staticmethod
    def compute_receipt_hash(
        root_tx_hash: str,
        hop: int,
        source_agent_uuid: str,
        dest_agent_uuid: str,
        next_hop_hash: Optional[str],
        receipt_nonce: int
    ) -> str:
        """Deterministic receipt hash computation"""
        data = f"{root_tx_hash}{hop}{source_agent_uuid}{dest_agent_uuid}{next_hop_hash or ''}{receipt_nonce}"
        return "0x" + hashlib.sha256(data.encode()).hexdigest()

    @staticmethod
    def compute_routing_hash(routing_path: list) -> str:
        """Compute hash of routing path for commitments"""
        path_str = "→".join(routing_path)
        return "0x" + hashlib.sha256(path_str.encode()).hexdigest()
