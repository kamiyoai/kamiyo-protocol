#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO x402 Payment Verifier
Multi-chain USDC payment verification for HTTP 402 payments
"""

import asyncio
import logging
from typing import Dict, Optional, List
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timedelta

# Web3 imports for blockchain interaction
from web3 import Web3
from web3.exceptions import TransactionNotFound

# Solana imports
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solders.pubkey import Pubkey
from solders.signature import Signature

# Import x402 configuration
from .config import get_x402_config

logger = logging.getLogger(__name__)

@dataclass
class PaymentVerification:
    """Payment verification result"""
    is_valid: bool
    tx_hash: str
    chain: str
    amount_usdc: Decimal
    from_address: str
    to_address: str
    block_number: int
    confirmations: int
    risk_score: float
    error_message: Optional[str] = None

@dataclass
class ChainConfig:
    """Blockchain configuration for payment verification"""
    name: str
    rpc_url: str
    usdc_contract_address: str
    required_confirmations: int
    usdc_decimals: int
    chain_id: int

class PaymentVerifier:
    """
    Multi-chain USDC payment verifier for x402 payments
    Supports Base, Solana, and Ethereum networks
    """

    def __init__(self):
        self.chains: Dict[str, ChainConfig] = {}
        self.web3_instances: Dict[str, Web3] = {}
        self.solana_client: Optional[AsyncClient] = None
        self.config = get_x402_config()
        self.min_payment_amount = Decimal(str(self.config.min_payment_usd))
        self.setup_chains()

    def setup_chains(self):
        """Initialize supported blockchain configurations using environment-based config"""
        # Base Network
        self.chains['base'] = ChainConfig(
            name='base',
            rpc_url=self.config.base_rpc_url,
            usdc_contract_address='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  # Base USDC
            required_confirmations=self.config.base_confirmations,
            usdc_decimals=6,
            chain_id=8453
        )

        # Ethereum Mainnet
        self.chains['ethereum'] = ChainConfig(
            name='ethereum',
            rpc_url=self.config.ethereum_rpc_url,
            usdc_contract_address='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  # ETH USDC
            required_confirmations=self.config.ethereum_confirmations,
            usdc_decimals=6,
            chain_id=1
        )

        # Solana
        self.chains['solana'] = ChainConfig(
            name='solana',
            rpc_url=self.config.solana_rpc_url,
            usdc_contract_address='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # Solana USDC (SPL)
            required_confirmations=self.config.solana_confirmations,
            usdc_decimals=6,
            chain_id=-1  # Solana doesn't use chain_id in same way
        )

        # Initialize Web3 connections for EVM chains
        for chain_name, config in self.chains.items():
            if chain_name != 'solana':
                try:
                    self.web3_instances[chain_name] = Web3(Web3.HTTPProvider(config.rpc_url))
                    is_connected = self.web3_instances[chain_name].is_connected()
                    if is_connected:
                        logger.info(f"[OK] Connected to {chain_name} at {config.rpc_url}")
                    else:
                        logger.warning(f"[WARNING]  Failed to connect to {chain_name} at {config.rpc_url}")
                except Exception as e:
                    logger.error(f"[FAIL] Error connecting to {chain_name}: {e}")

        # Initialize Solana client
        try:
            solana_config = self.chains.get('solana')
            if solana_config:
                self.solana_client = AsyncClient(solana_config.rpc_url)
                logger.info(f"[OK] Initialized Solana client at {solana_config.rpc_url}")
        except Exception as e:
            logger.warning(f"[SKIP] Solana client initialization skipped (httpx compatibility): {e}")
            logger.info("[INFO] Solana payments will not be available, using EVM chains only")
            self.solana_client = None

    async def verify_payment(
        self,
        tx_hash: str,
        chain: str,
        expected_amount: Optional[Decimal] = None
    ) -> PaymentVerification:
        """
        Verify USDC payment on specified chain

        Args:
            tx_hash: Transaction hash to verify
            chain: Blockchain network ('base', 'ethereum', 'solana')
            expected_amount: Expected payment amount in USDC

        Returns:
            PaymentVerification with verification results
        """
        if chain not in self.chains:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message=f"Unsupported chain: {chain}"
            )

        config = self.chains[chain]

        # Special handling for Solana (would need Solana-specific implementation)
        if chain == 'solana':
            return await self._verify_solana_payment(tx_hash, config, expected_amount)

        # Ethereum-compatible chains (Base, Ethereum)
        return await self._verify_evm_payment(tx_hash, chain, config, expected_amount)

    async def _verify_evm_payment(
        self,
        tx_hash: str,
        chain: str,
        config: ChainConfig,
        expected_amount: Optional[Decimal]
    ) -> PaymentVerification:
        """
        Verify payment on EVM-compatible chains (Base, Ethereum)

        This method:
        1. Fetches transaction receipt from RPC
        2. Parses ERC-20 Transfer events from logs
        3. Validates recipient address matches our payment address
        4. Extracts actual USDC amount (6 decimals)
        5. Validates minimum payment amount
        6. Calculates allocated API requests based on amount
        """
        try:
            web3 = self.web3_instances[chain]

            # Get transaction receipt
            tx_receipt = web3.eth.get_transaction_receipt(tx_hash)
            if not tx_receipt:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=0,
                    confirmations=0,
                    risk_score=1.0,
                    error_message="Transaction not found"
                )

            # Check if transaction was successful
            if tx_receipt.status != 1:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=tx_receipt.blockNumber,
                    confirmations=0,
                    risk_score=1.0,
                    error_message="Transaction failed"
                )

            # Get transaction details
            tx = web3.eth.get_transaction(tx_hash)

            # Calculate confirmations
            current_block = web3.eth.block_number
            confirmations = current_block - tx_receipt.blockNumber

            if confirmations < config.required_confirmations:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=Decimal('0'),
                    from_address=tx['from'],
                    to_address=tx['to'] or '',
                    block_number=tx_receipt.blockNumber,
                    confirmations=confirmations,
                    risk_score=0.5,
                    error_message=f"Insufficient confirmations: {confirmations}/{config.required_confirmations}"
                )

            # Parse ERC-20 Transfer events from transaction logs
            # ERC-20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
            transfer_event_signature = web3.keccak(text="Transfer(address,address,uint256)").hex()

            # Get our payment address for this chain
            our_payment_address = self.get_payment_address(chain)

            # Parse logs to find USDC transfers to our address
            amount_usdc = Decimal('0')
            from_address = ''
            to_address = ''

            for log in tx_receipt.logs:
                # Check if this is a Transfer event from USDC contract
                if (len(log.topics) >= 3 and
                    log.topics[0].hex() == transfer_event_signature and
                    log.address.lower() == config.usdc_contract_address.lower()):

                    # Decode Transfer event
                    # topics[0] = event signature
                    # topics[1] = from address (indexed)
                    # topics[2] = to address (indexed)
                    # data = amount (uint256)

                    event_from = '0x' + log.topics[1].hex()[-40:]  # Last 20 bytes
                    event_to = '0x' + log.topics[2].hex()[-40:]     # Last 20 bytes

                    # Decode amount from data field
                    amount_raw = int(log.data.hex(), 16)

                    # Check if this transfer is to our payment address
                    if event_to.lower() == our_payment_address.lower():
                        # Convert from USDC units (6 decimals) to decimal
                        amount_usdc = Decimal(amount_raw) / Decimal(10 ** config.usdc_decimals)
                        from_address = event_from
                        to_address = event_to

                        logger.info(f"Found USDC transfer: {amount_usdc} USDC from {from_address} to {to_address}")
                        break

            # Verify we found a valid USDC transfer to our address
            if amount_usdc == Decimal('0'):
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=Decimal('0'),
                    from_address=tx['from'],
                    to_address=tx['to'] or '',
                    block_number=tx_receipt.blockNumber,
                    confirmations=confirmations,
                    risk_score=0.8,
                    error_message="No USDC transfer to payment address found in transaction"
                )

            # Check minimum payment amount
            if amount_usdc < self.min_payment_amount:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=amount_usdc,
                    from_address=from_address,
                    to_address=to_address,
                    block_number=tx_receipt.blockNumber,
                    confirmations=confirmations,
                    risk_score=0.3,
                    error_message=f"Payment amount too low: {amount_usdc} < {self.min_payment_amount}"
                )

            # Validate transaction age (reject transactions older than 7 days)
            block = web3.eth.get_block(tx_receipt.blockNumber)
            tx_timestamp = datetime.fromtimestamp(block.timestamp)
            tx_age = datetime.utcnow() - tx_timestamp

            if tx_age > timedelta(days=7):
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain=chain,
                    amount_usdc=amount_usdc,
                    from_address=from_address,
                    to_address=to_address,
                    block_number=tx_receipt.blockNumber,
                    confirmations=confirmations,
                    risk_score=0.7,
                    error_message=f"Transaction too old: {tx_age.days} days (max 7 days)"
                )

            # Calculate risk score based on various factors
            risk_score = await self._calculate_risk_score(tx_hash, chain, from_address)

            # Payment is valid!
            logger.info(f"[OK] Verified {chain} payment: {amount_usdc} USDC from {from_address}")

            return PaymentVerification(
                is_valid=True,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=amount_usdc,
                from_address=from_address,
                to_address=to_address,
                block_number=tx_receipt.blockNumber,
                confirmations=confirmations,
                risk_score=risk_score
            )

        except TransactionNotFound:
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message="Transaction not found on chain"
            )
        except Exception as e:
            logger.error(f"[FAIL] Error verifying payment on {chain}: {e}")
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message=f"Error verifying payment: {str(e)}"
            )

    async def _verify_solana_payment(
        self,
        tx_hash: str,
        config: ChainConfig,
        expected_amount: Optional[Decimal]
    ) -> PaymentVerification:
        """Verify payment on Solana blockchain"""
        try:
            if not self.solana_client:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=0,
                    confirmations=0,
                    risk_score=1.0,
                    error_message="Solana client not initialized"
                )

            # Parse transaction signature
            try:
                signature = Signature.from_string(tx_hash)
            except Exception as e:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=0,
                    confirmations=0,
                    risk_score=1.0,
                    error_message=f"Invalid Solana signature format: {e}"
                )

            # Get transaction details
            response = await self.solana_client.get_transaction(
                signature,
                encoding="jsonParsed",
                commitment=Confirmed,
                max_supported_transaction_version=0
            )

            if not response.value:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=0,
                    confirmations=0,
                    risk_score=1.0,
                    error_message="Transaction not found on Solana"
                )

            tx_data = response.value

            # Check transaction error status
            if tx_data.transaction.meta.err:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=Decimal('0'),
                    from_address='',
                    to_address='',
                    block_number=tx_data.slot if tx_data.slot else 0,
                    confirmations=0,
                    risk_score=1.0,
                    error_message=f"Transaction failed: {tx_data.transaction.meta.err}"
                )

            # Get slot and calculate confirmations
            slot = tx_data.slot if tx_data.slot else 0
            current_slot_response = await self.solana_client.get_slot()
            current_slot = current_slot_response.value if current_slot_response.value else slot
            confirmations = current_slot - slot

            # Parse SPL token transfer from instructions
            amount_usdc = Decimal('0')
            from_address = ''
            to_address = ''

            # Look through instructions for SPL token transfers
            instructions = tx_data.transaction.transaction.message.instructions

            for instruction in instructions:
                # Check if this is a parsed SPL token transfer
                if hasattr(instruction, 'parsed') and instruction.parsed:
                    parsed = instruction.parsed

                    # Check if it's a transfer or transferChecked instruction
                    if isinstance(parsed, dict):
                        info = parsed.get('info', {})
                        instruction_type = parsed.get('type', '')

                        if instruction_type in ['transfer', 'transferChecked']:
                            # Get source, destination, and amount
                            source = info.get('source', '')
                            destination = info.get('destination', '')

                            # For transferChecked, amount is in tokenAmount
                            if instruction_type == 'transferChecked':
                                token_amount = info.get('tokenAmount', {})
                                amount_raw = token_amount.get('amount', '0')
                                decimals = token_amount.get('decimals', 6)
                            else:
                                # For regular transfer
                                amount_raw = info.get('amount', '0')
                                decimals = 6  # USDC has 6 decimals

                            # Convert amount from lamports to USDC
                            amount = Decimal(str(amount_raw)) / Decimal(10 ** decimals)

                            # Check if this is a transfer to our payment address
                            if destination.lower() == self.config.solana_payment_address.lower():
                                amount_usdc = amount
                                to_address = destination
                                from_address = source
                                break

            # Verify we found a valid USDC transfer to our address
            if amount_usdc == Decimal('0'):
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=Decimal('0'),
                    from_address=from_address,
                    to_address=to_address,
                    block_number=slot,
                    confirmations=confirmations,
                    risk_score=0.8,
                    error_message="No USDC transfer to payment address found in transaction"
                )

            # Check confirmations
            if confirmations < config.required_confirmations:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=amount_usdc,
                    from_address=from_address,
                    to_address=to_address,
                    block_number=slot,
                    confirmations=confirmations,
                    risk_score=0.5,
                    error_message=f"Insufficient confirmations: {confirmations}/{config.required_confirmations}"
                )

            # Check minimum payment amount
            if amount_usdc < self.min_payment_amount:
                return PaymentVerification(
                    is_valid=False,
                    tx_hash=tx_hash,
                    chain='solana',
                    amount_usdc=amount_usdc,
                    from_address=from_address,
                    to_address=to_address,
                    block_number=slot,
                    confirmations=confirmations,
                    risk_score=0.3,
                    error_message=f"Payment amount too low: {amount_usdc} < {self.min_payment_amount}"
                )

            # Calculate risk score
            risk_score = await self._calculate_risk_score(tx_hash, 'solana', from_address)

            # Payment is valid!
            logger.info(f"[OK] Verified Solana payment: {amount_usdc} USDC from {from_address}")

            return PaymentVerification(
                is_valid=True,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=amount_usdc,
                from_address=from_address,
                to_address=to_address,
                block_number=slot,
                confirmations=confirmations,
                risk_score=risk_score
            )

        except Exception as e:
            logger.error(f"[FAIL] Error verifying Solana payment: {e}")
            return PaymentVerification(
                is_valid=False,
                tx_hash=tx_hash,
                chain='solana',
                amount_usdc=Decimal('0'),
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message=f"Error verifying Solana payment: {str(e)}"
            )

    async def _calculate_risk_score(
        self,
        tx_hash: str,
        chain: str,
        from_address: str
    ) -> float:
        """
        Calculate risk score for payment

        Factors:
        - Transaction age
        - Sender reputation
        - Payment pattern analysis
        - Exploit correlation
        """
        base_score = 0.1  # Start with low risk

        # TODO: Implement actual risk scoring
        # - Check if sender address is associated with recent exploits
        # - Analyze payment patterns
        # - Check transaction velocity

        return min(base_score, 1.0)  # Ensure score is between 0-1

    def get_supported_chains(self) -> List[str]:
        """Get list of supported blockchain networks"""
        return list(self.chains.keys())

    def get_payment_address(self, chain: str) -> str:
        """Get payment address for specified chain from configuration"""
        if chain == 'base':
            return self.config.base_payment_address
        elif chain == 'ethereum':
            return self.config.ethereum_payment_address
        elif chain == 'solana':
            return self.config.solana_payment_address
        else:
            logger.warning(f"Unknown chain requested: {chain}")
            return ""

# Global instance for easy access
payment_verifier = PaymentVerifier()
