#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PayAI Facilitator Client
Python wrapper for PayAI Network x402 facilitator API
"""

import httpx
import logging
import base64
import json
from typing import Dict, Optional, List, Any
from decimal import Decimal
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class PaymentRequirement:
    """x402 payment requirement specification"""
    scheme: str
    network: str
    max_amount_required: str
    asset: str
    pay_to: str
    resource: str
    description: str
    mime_type: str = "application/json"
    max_timeout_seconds: int = 60
    extra: Optional[Dict[str, Any]] = None


@dataclass
class PaymentPayload:
    """x402 payment payload from client"""
    x402_version: int
    scheme: str
    network: str
    payload: Dict[str, Any]


@dataclass
class VerificationResult:
    """Payment verification result from facilitator"""
    is_valid: bool
    payer: str
    invalid_reason: Optional[str] = None


@dataclass
class SettlementResult:
    """Payment settlement result from facilitator"""
    success: bool
    payer: str
    transaction: str
    network: str
    error_reason: Optional[str] = None


class PayAIFacilitator:
    """
    Python client for PayAI Network x402 facilitator

    Supports:
    - Payment verification via /verify endpoint
    - Payment settlement via /settle endpoint
    - Multi-chain support (Solana, Base, Polygon, Avalanche, Sei, IoTeX, Peaq)
    - Standard x402 protocol compliance
    """

    FACILITATOR_URL = "https://facilitator.payai.network"

    # Network identifiers
    SUPPORTED_NETWORKS = [
        'solana', 'solana-devnet',
        'base', 'base-sepolia',
        'polygon', 'polygon-amoy',
        'avalanche', 'avalanche-fuji',
        'sei', 'sei-testnet',
        'iotex', 'peaq'
    ]

    def __init__(
        self,
        merchant_address: str,
        facilitator_url: Optional[str] = None,
        timeout: int = 30
    ):
        """
        Initialize PayAI facilitator client

        Args:
            merchant_address: Merchant wallet address for receiving payments
            facilitator_url: Custom facilitator URL (defaults to PayAI production)
            timeout: HTTP request timeout in seconds
        """
        self.merchant_address = merchant_address
        self.facilitator_url = facilitator_url or self.FACILITATOR_URL
        self.client = httpx.AsyncClient(timeout=timeout)

        logger.info(f"Initialized PayAI facilitator client: {self.facilitator_url}")

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

    async def verify_payment(
        self,
        payment_header: str,
        payment_requirements: PaymentRequirement
    ) -> VerificationResult:
        """
        Verify payment authorization via PayAI facilitator

        Args:
            payment_header: Base64-encoded X-PAYMENT header from client
            payment_requirements: Expected payment requirements

        Returns:
            VerificationResult with validation status
        """
        try:
            # Decode payment header
            payment_data = self._decode_payment_header(payment_header)

            # Construct verification request
            verify_request = {
                "paymentPayload": payment_data,
                "paymentRequirements": self._payment_requirement_to_dict(payment_requirements)
            }

            # POST to /verify endpoint
            response = await self.client.post(
                f"{self.facilitator_url}/verify",
                json=verify_request
            )

            if response.status_code == 200:
                data = response.json()
                return VerificationResult(
                    is_valid=data.get('isValid', False),
                    payer=data.get('payer', ''),
                    invalid_reason=data.get('invalidReason')
                )
            else:
                logger.error(f"PayAI verify failed: {response.status_code} {response.text}")
                return VerificationResult(
                    is_valid=False,
                    payer='',
                    invalid_reason=f"HTTP {response.status_code}"
                )

        except Exception as e:
            logger.error(f"PayAI verification error: {e}")
            return VerificationResult(
                is_valid=False,
                payer='',
                invalid_reason=str(e)
            )

    async def settle_payment(
        self,
        payment_header: str,
        payment_requirements: PaymentRequirement
    ) -> SettlementResult:
        """
        Settle payment on blockchain via PayAI facilitator

        Args:
            payment_header: Base64-encoded X-PAYMENT header from client
            payment_requirements: Expected payment requirements

        Returns:
            SettlementResult with settlement details
        """
        try:
            # Decode payment header
            payment_data = self._decode_payment_header(payment_header)

            # Construct settlement request
            settle_request = {
                "paymentPayload": payment_data,
                "paymentRequirements": self._payment_requirement_to_dict(payment_requirements)
            }

            # POST to /settle endpoint
            response = await self.client.post(
                f"{self.facilitator_url}/settle",
                json=settle_request
            )

            data = response.json()

            if response.status_code == 200 and data.get('success'):
                return SettlementResult(
                    success=True,
                    payer=data.get('payer', ''),
                    transaction=data.get('transaction', ''),
                    network=data.get('network', '')
                )
            else:
                return SettlementResult(
                    success=False,
                    payer=data.get('payer', ''),
                    transaction='',
                    network=data.get('network', ''),
                    error_reason=data.get('errorReason', f"HTTP {response.status_code}")
                )

        except Exception as e:
            logger.error(f"PayAI settlement error: {e}")
            return SettlementResult(
                success=False,
                payer='',
                transaction='',
                network='',
                error_reason=str(e)
            )

    async def get_supported_networks(self) -> List[Dict[str, Any]]:
        """
        Query facilitator for supported payment schemes and networks

        Returns:
            List of supported payment kinds
        """
        try:
            response = await self.client.get(f"{self.facilitator_url}/supported")

            if response.status_code == 200:
                data = response.json()
                return data.get('kinds', [])
            else:
                logger.error(f"Failed to get supported networks: {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Error querying supported networks: {e}")
            return []

    def create_payment_requirement(
        self,
        endpoint: str,
        price_usdc: Decimal,
        description: str,
        network: str = 'base',
        asset_address: Optional[str] = None
    ) -> PaymentRequirement:
        """
        Create x402 payment requirement for 402 response

        Args:
            endpoint: Protected endpoint URL
            price_usdc: Price in USDC (e.g., Decimal('0.01'))
            description: Human-readable description
            network: Blockchain network (default: base)
            asset_address: Token contract address (defaults to USDC for network)

        Returns:
            PaymentRequirement object
        """
        # Default USDC contract addresses by network
        usdc_addresses = {
            'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            'polygon': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            'solana': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'avalanche': '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
        }

        asset = asset_address or usdc_addresses.get(network, usdc_addresses['base'])

        # Convert USDC to atomic units (6 decimals)
        amount_atomic = str(int(price_usdc * Decimal(10 ** 6)))

        return PaymentRequirement(
            scheme='exact',  # EIP-3009 payment scheme
            network=network,
            max_amount_required=amount_atomic,
            asset=asset,
            pay_to=self.merchant_address,
            resource=endpoint,
            description=description,
            mime_type='application/json',
            max_timeout_seconds=60,
            extra={'name': 'USDC', 'version': '2'}
        )

    def create_402_response(
        self,
        endpoint: str,
        price_usdc: Decimal,
        description: str,
        networks: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create HTTP 402 Payment Required response body

        Args:
            endpoint: Protected endpoint URL
            price_usdc: Price in USDC
            description: Resource description
            networks: List of supported networks (defaults to ['base', 'solana'])

        Returns:
            402 response body dict
        """
        if networks is None:
            networks = ['base', 'solana']

        accepts = []
        for network in networks:
            requirement = self.create_payment_requirement(
                endpoint, price_usdc, description, network
            )
            accepts.append(self._payment_requirement_to_dict(requirement))

        return {
            'x402Version': 1,
            'error': 'X-PAYMENT header is required',
            'accepts': accepts
        }

    def _decode_payment_header(self, payment_header: str) -> Dict[str, Any]:
        """Decode base64-encoded X-PAYMENT header"""
        try:
            decoded_bytes = base64.b64decode(payment_header)
            return json.loads(decoded_bytes)
        except Exception as e:
            logger.error(f"Failed to decode payment header: {e}")
            raise ValueError(f"Invalid payment header: {e}")

    def _encode_payment_response(self, response_data: Dict[str, Any]) -> str:
        """Encode payment response as base64 for X-PAYMENT-RESPONSE header"""
        json_bytes = json.dumps(response_data).encode('utf-8')
        return base64.b64encode(json_bytes).decode('utf-8')

    def _payment_requirement_to_dict(self, requirement: PaymentRequirement) -> Dict[str, Any]:
        """Convert PaymentRequirement to dict for API"""
        return {
            'scheme': requirement.scheme,
            'network': requirement.network,
            'maxAmountRequired': requirement.max_amount_required,
            'asset': requirement.asset,
            'payTo': requirement.pay_to,
            'resource': requirement.resource,
            'description': requirement.description,
            'mimeType': requirement.mime_type,
            'maxTimeoutSeconds': requirement.max_timeout_seconds,
            'extra': requirement.extra or {}
        }


# Singleton instance for convenience
_facilitator_instance: Optional[PayAIFacilitator] = None


def get_payai_facilitator(merchant_address: str) -> PayAIFacilitator:
    """
    Get or create PayAI facilitator singleton instance

    Args:
        merchant_address: Merchant wallet address

    Returns:
        PayAIFacilitator instance
    """
    global _facilitator_instance

    if _facilitator_instance is None:
        _facilitator_instance = PayAIFacilitator(merchant_address)

    return _facilitator_instance
