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
        
        # Test unsupported chain
        with pytest.raises(KeyError):
            self.verifier.get_payment_address('unsupported')
            
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
    async def test_verify_payment_solana_not_implemented(self):
        """Test Solana payment verification (not implemented)"""
        result = await self.verifier.verify_payment(
            'solana_tx_hash',
            'solana'
        )
        
        assert result.is_valid == False
        assert 'not implemented' in result.error_message.lower()
        
    @pytest.mark.asyncio
    @patch('api.x402.payment_verifier.Web3')
    async def test_verify_evm_payment_transaction_not_found(self, mock_web3):
        """Test EVM payment verification when transaction not found"""
        # Mock Web3 instance
        mock_web3_instance = Mock()
        mock_web3_instance.eth.get_transaction_receipt.return_value = None
        self.verifier.web3_instances['base'] = mock_web3_instance
        
        result = await self.verifier.verify_payment(
            '0xnonexistent',
            'base'
        )
        
        assert result.is_valid == False
        assert 'Transaction not found' in result.error_message
        
    @pytest.mark.asyncio
    @patch('api.x402.payment_verifier.Web3')
    async def test_verify_evm_payment_failed_transaction(self, mock_web3):
        """Test EVM payment verification for failed transaction"""
        # Mock failed transaction receipt
        mock_receipt = Mock()
        mock_receipt.status = 0  # Failed transaction
        mock_receipt.blockNumber = 1000
        
        mock_web3_instance = Mock()
        mock_web3_instance.eth.get_transaction_receipt.return_value = mock_receipt
        mock_web3_instance.eth.block_number = 1010
        
        self.verifier.web3_instances['base'] = mock_web3_instance
        
        result = await self.verifier.verify_payment(
            '0xfailed',
            'base'
        )
        
        assert result.is_valid == False
        assert 'Transaction failed' in result.error_message
        assert result.block_number == 1000
        
    @pytest.mark.asyncio
    @patch('api.x402.payment_verifier.Web3')
    async def test_verify_evm_payment_insufficient_confirmations(self, mock_web3):
        """Test EVM payment verification with insufficient confirmations"""
        # Mock transaction with only 1 confirmation (needs 6)
        mock_receipt = Mock()
        mock_receipt.status = 1  # Success
        mock_receipt.blockNumber = 1000
        
        mock_tx = Mock()
        mock_tx['from'] = '0xsender'
        mock_tx['to'] = '0xrecipient'
        
        mock_web3_instance = Mock()
        mock_web3_instance.eth.get_transaction_receipt.return_value = mock_receipt
        mock_web3_instance.eth.get_transaction.return_value = mock_tx
        mock_web3_instance.eth.block_number = 1001  # Only 1 confirmation
        
        self.verifier.web3_instances['base'] = mock_web3_instance
        
        result = await self.verifier.verify_payment(
            '0xinsufficient',
            'base'
        )
        
        assert result.is_valid == False
        assert 'Insufficient confirmations' in result.error_message
        assert result.confirmations == 1
        assert result.risk_score == 0.5
        
    @pytest.mark.asyncio
    @patch('api.x402.payment_verifier.Web3')
    async def test_verify_evm_payment_success(self, mock_web3):
        """Test successful EVM payment verification"""
        # Mock successful transaction with sufficient confirmations
        mock_receipt = Mock()
        mock_receipt.status = 1  # Success
        mock_receipt.blockNumber = 1000
        
        mock_tx = Mock()
        mock_tx['from'] = '0xsender'
        mock_tx['to'] = '0xrecipient'
        
        mock_web3_instance = Mock()
        mock_web3_instance.eth.get_transaction_receipt.return_value = mock_receipt
        mock_web3_instance.eth.get_transaction.return_value = mock_tx
        mock_web3_instance.eth.block_number = 1010  # 10 confirmations
        
        self.verifier.web3_instances['base'] = mock_web3_instance
        
        result = await self.verifier.verify_payment(
            '0xsuccess',
            'base'
        )
        
        assert result.is_valid == True
        assert result.tx_hash == '0xsuccess'
        assert result.chain == 'base'
        assert result.from_address == '0xsender'
        assert result.to_address == '0xrecipient'
        assert result.block_number == 1000
        assert result.confirmations == 10
        assert result.risk_score == 0.1  # Base risk score
        
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