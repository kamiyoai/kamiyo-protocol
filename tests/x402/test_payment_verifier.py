#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests for KAMIYO x402 Payment Verifier
"""

import pytest
import asyncio
from decimal import Decimal
from unittest.mock import Mock, patch, AsyncMock

from api.x402.payment_verifier import PaymentVerifier, PaymentVerification, ChainConfig


class TestPaymentVerifier:
    """Test payment verification functionality"""

    def setup_method(self):
        """Set up test fixtures"""
        self.verifier = PaymentVerifier()
        
    def test_initialization(self):
        """Test that payment verifier initializes correctly"""
        assert 'base' in self.verifier.chains
        assert 'ethereum' in self.verifier.chains
        assert 'solana' in self.verifier.chains
        
        base_config = self.verifier.chains['base']
        assert base_config.name == 'base'
        assert base_config.required_confirmations == 6
        assert base_config.usdc_decimals == 6
        
    def test_get_supported_chains(self):
        """Test getting list of supported chains"""
        chains = self.verifier.get_supported_chains()
        assert isinstance(chains, list)
        assert 'base' in chains
        assert 'ethereum' in chains
        assert 'solana' in chains
        
    def test_get_payment_address(self):
        """Test getting payment addresses for chains"""
        base_address = self.verifier.get_payment_address('base')
        assert isinstance(base_address, str)
        assert len(base_address) > 0

        eth_address = self.verifier.get_payment_address('ethereum')
        assert isinstance(eth_address, str)
        assert len(eth_address) > 0

        # Test unsupported chain (returns empty string)
        unsupported_address = self.verifier.get_payment_address('unsupported')
        assert unsupported_address == ""
            
    @pytest.mark.asyncio
    async def test_verify_payment_unsupported_chain(self):
        """Test payment verification for unsupported chain"""
        result = await self.verifier.verify_payment(
            '0x123', 
            'unsupported_chain'
        )
        
        assert result.is_valid == False
        assert 'Unsupported chain' in result.error_message
        assert result.risk_score == 1.0
        
    @pytest.mark.asyncio
    async def test_verify_payment_solana_invalid_signature(self):
        """Test Solana payment verification with invalid signature"""
        result = await self.verifier.verify_payment(
            'invalid_signature',
            'solana'
        )

        assert result.is_valid == False
        assert 'Invalid Solana signature format' in result.error_message or 'not found' in result.error_message.lower()
        
    # NOTE: Comprehensive EVM payment tests are in test_evm_payment_verifier.py
        
    def test_calculate_risk_score(self):
        """Test risk score calculation"""
        # Mock the async method
        async def mock_calculate():
            return await self.verifier._calculate_risk_score(
                '0xtest', 'base', '0xsender'
            )
            
        # Run the async function
        risk_score = asyncio.run(mock_calculate())
        
        assert isinstance(risk_score, float)
        assert 0.0 <= risk_score <= 1.0
        
    def test_payment_verification_dataclass(self):
        """Test PaymentVerification dataclass"""
        verification = PaymentVerification(
            is_valid=True,
            tx_hash='0x123',
            chain='base',
            amount_usdc=Decimal('0.10'),
            from_address='0xsender',
            to_address='0xrecipient',
            block_number=1000,
            confirmations=10,
            risk_score=0.1
        )
        
        assert verification.is_valid == True
        assert verification.tx_hash == '0x123'
        assert verification.amount_usdc == Decimal('0.10')
        assert verification.risk_score == 0.1
        assert verification.error_message is None
        
    def test_chain_config_dataclass(self):
        """Test ChainConfig dataclass"""
        config = ChainConfig(
            name='test',
            rpc_url='https://test.rpc',
            usdc_contract_address='0xtest',
            required_confirmations=10,
            usdc_decimals=6,
            chain_id=1
        )
        
        assert config.name == 'test'
        assert config.rpc_url == 'https://test.rpc'
        assert config.required_confirmations == 10
        assert config.usdc_decimals == 6


if __name__ == '__main__':
    pytest.main([__file__, '-v'])