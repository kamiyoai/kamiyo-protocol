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
        self.min_payment_amount = Decimal('0.10')  # $0.10 minimum
        self.setup_chains()
    
    def setup_chains(self):
        """Initialize supported blockchain configurations"""
        # Base Network
        self.chains['base'] = ChainConfig(
            name='base',
            rpc_url='https://mainnet.base.org',  # Replace with actual RPC
            usdc_contract_address='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  # Base USDC
            required_confirmations=6,
            usdc_decimals=6,
            chain_id=8453
        )
        
        # Ethereum Mainnet
        self.chains['ethereum'] = ChainConfig(
            name='ethereum',
            rpc_url='https://mainnet.infura.io/v3/YOUR_PROJECT_ID',  # Replace
            usdc_contract_address='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  # ETH USDC
            required_confirmations=12,
            usdc_decimals=6,
            chain_id=1
        )
        
        # Solana (placeholder - would need Solana-specific implementation)
        self.chains['solana'] = ChainConfig(
            name='solana',
            rpc_url='https://api.mainnet-beta.solana.com',
            usdc_contract_address='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # Solana USDC
            required_confirmations=32,  # Solana finality
            usdc_decimals=6,
            chain_id=-1  # Solana doesn't use chain_id in same way
        )
        
        # Initialize Web3 connections
        for chain_name, config in self.chains.items():
            if chain_name != 'solana':  # Skip Solana for now
                try:
                    self.web3_instances[chain_name] = Web3(Web3.HTTPProvider(config.rpc_url))
                    logger.info(f"Connected to {chain_name} at {config.rpc_url}")
                except Exception as e:
                    logger.error(f"Failed to connect to {chain_name}: {e}")
    
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
        """Verify payment on EVM-compatible chains"""
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
            
            # For USDC transfers, we need to check ERC-20 transfer events
            # This is a simplified version - in production you'd parse Transfer events
            
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
            
            # For now, we'll assume any successful transaction to our address is valid
            # In production, you'd:
            # 1. Parse ERC-20 Transfer events to get actual USDC amount
            # 2. Verify the recipient is our payment address
            # 3. Check the amount matches expected
            
            # Placeholder implementation
            amount_usdc = Decimal('0.10')  # Default amount for testing
            
            # Calculate risk score based on various factors
            risk_score = await self._calculate_risk_score(tx_hash, chain, tx['from'])
            
            return PaymentVerification(
                is_valid=True,
                tx_hash=tx_hash,
                chain=chain,
                amount_usdc=amount_usdc,
                from_address=tx['from'],
                to_address=tx['to'] or '',
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
            logger.error(f"Error verifying payment on {chain}: {e}")
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
                error_message=str(e)
            )
    
    async def _verify_solana_payment(
        self, 
        tx_hash: str, 
        config: ChainConfig,
        expected_amount: Optional[Decimal]
    ) -> PaymentVerification:
        """Verify payment on Solana (placeholder implementation)"""
        # Solana implementation would require:
        # - solana-py or similar library
        # - RPC connection to Solana mainnet
        # - Parsing of token transfer instructions
        
        logger.warning("Solana payment verification not yet implemented")
        
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
            error_message="Solana verification not implemented"
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
        """Get payment address for specified chain"""
        # In production, you'd have different addresses per chain
        # For now, return a placeholder
        if chain == 'base':
            return "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7"
        elif chain == 'ethereum':
            return "0x742d35Cc6634C0532925a3b8D4B5e3A3A3b7b7b7"
        elif chain == 'solana':
            return "7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x7x"
        else:
            return ""

# Global instance for easy access
payment_verifier = PaymentVerifier()