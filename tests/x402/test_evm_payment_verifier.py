#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests for KAMIYO x402 EVM Payment Verifier
Comprehensive tests for Base and Ethereum payment verification
"""

import pytest
from decimal import Decimal
from unittest.mock import Mock, MagicMock
from datetime import datetime, timedelta

from api.x402.payment_verifier import PaymentVerifier, PaymentVerification


class MockLog:
    """Mock log entry for ERC-20 Transfer events"""
    def __init__(self, address, topics, data):
        self.address = address
        self.topics = topics
        self.data = data


class MockReceipt:
    """Mock transaction receipt"""
    def __init__(self, status, block_number, logs):
        self.status = status
        self.blockNumber = block_number
        self.logs = logs


class MockTransaction:
    """Mock transaction"""
    def __init__(self, from_addr, to_addr):
        self['from'] = from_addr
        self['to'] = to_addr

    def __getitem__(self, key):
        return getattr(self, f'_{key}')

    def __setitem__(self, key, value):
        setattr(self, f'_{key}', value)


class MockBlock:
    """Mock block"""
    def __init__(self, timestamp):
        self.timestamp = timestamp


class TestEVMPaymentVerifier:
    """Test EVM payment verification functionality"""

    def setup_method(self):
        """Set up test fixtures"""
        self.verifier = PaymentVerifier()

        # Mock Web3 instance
        self.mock_web3 = Mock()
        self.verifier.web3_instances['base'] = self.mock_web3

        # USDC contract address for Base
        self.usdc_address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
        self.payment_address = self.verifier.get_payment_address('base')

        # Transfer event signature: Transfer(address,address,uint256)
        self.transfer_signature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

    def create_transfer_log(self, from_addr, to_addr, amount_raw):
        """Create a mock ERC-20 Transfer log"""
        # Create topics for Transfer event
        topics = [
            MagicMock(hex=lambda: self.transfer_signature),  # Event signature
            MagicMock(hex=lambda: '0x' + '0' * 24 + from_addr[2:]),  # From address (padded)
            MagicMock(hex=lambda: '0x' + '0' * 24 + to_addr[2:])     # To address (padded)
        ]

        # Create data with amount
        data = MagicMock(hex=lambda: hex(amount_raw)[2:].zfill(64))

        return MockLog(
            address=self.usdc_address,
            topics=topics,
            data=data
        )

    @pytest.mark.asyncio
    async def test_verify_evm_payment_success(self):
        """Test successful EVM payment verification with proper USDC transfer"""
        # Setup mock responses
        tx_hash = '0xabc123'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address

        # Amount: 1 USDC = 1,000,000 (6 decimals)
        amount_raw = 1_000_000

        # Create Transfer log
        transfer_log = self.create_transfer_log(from_addr, to_addr, amount_raw)

        # Mock receipt with Transfer event
        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        # Mock transaction
        mock_tx = {'from': from_addr, 'to': self.usdc_address}

        # Mock current block
        self.mock_web3.eth.block_number = 1010  # 10 confirmations

        # Mock block for timestamp
        mock_block = MockBlock(timestamp=int(datetime.utcnow().timestamp()))

        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        # Verify payment
        result = await self.verifier.verify_payment(tx_hash, 'base')

        # Assertions
        assert result.is_valid == True
        assert result.tx_hash == tx_hash
        assert result.chain == 'base'
        assert result.amount_usdc == Decimal('1.0')
        assert result.from_address.lower() == from_addr.lower()
        assert result.to_address.lower() == to_addr.lower()
        assert result.block_number == 1000
        assert result.confirmations == 10
        assert result.error_message is None

    @pytest.mark.asyncio
    async def test_verify_evm_payment_minimum_amount(self):
        """Test payment verification with amount below minimum"""
        tx_hash = '0xabc123'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address

        # Amount: 0.05 USDC = 50,000 (below minimum of 0.10)
        amount_raw = 50_000

        transfer_log = self.create_transfer_log(from_addr, to_addr, amount_raw)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}
        mock_block = MockBlock(timestamp=int(datetime.utcnow().timestamp()))

        self.mock_web3.eth.block_number = 1010
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == False
        assert 'Payment amount too low' in result.error_message
        assert result.amount_usdc == Decimal('0.05')

    @pytest.mark.asyncio
    async def test_verify_evm_payment_no_usdc_transfer(self):
        """Test payment verification when no USDC transfer is found"""
        tx_hash = '0xabc123'
        from_addr = '0x1234567890123456789012345678901234567890'
        wrong_addr = '0x9999999999999999999999999999999999999999'

        # Transfer to wrong address
        amount_raw = 1_000_000
        transfer_log = self.create_transfer_log(from_addr, wrong_addr, amount_raw)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}
        mock_block = MockBlock(timestamp=int(datetime.utcnow().timestamp()))

        self.mock_web3.eth.block_number = 1010
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == False
        assert 'No USDC transfer to payment address found' in result.error_message

    @pytest.mark.asyncio
    async def test_verify_evm_payment_insufficient_confirmations(self):
        """Test payment verification with insufficient confirmations"""
        tx_hash = '0xabc123'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address
        amount_raw = 1_000_000

        transfer_log = self.create_transfer_log(from_addr, to_addr, amount_raw)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}

        # Only 3 confirmations (needs 6)
        self.mock_web3.eth.block_number = 1003
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == False
        assert 'Insufficient confirmations' in result.error_message
        assert result.confirmations == 3

    @pytest.mark.asyncio
    async def test_verify_evm_payment_transaction_failed(self):
        """Test verification of failed transaction"""
        tx_hash = '0xfailed'

        mock_receipt = MockReceipt(
            status=0,  # Failed
            block_number=1000,
            logs=[]
        )

        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == False
        assert 'Transaction failed' in result.error_message

    @pytest.mark.asyncio
    async def test_verify_evm_payment_old_transaction(self):
        """Test rejection of very old transactions (> 7 days)"""
        tx_hash = '0xold'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address
        amount_raw = 1_000_000

        transfer_log = self.create_transfer_log(from_addr, to_addr, amount_raw)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}

        # Block from 10 days ago
        old_timestamp = int((datetime.utcnow() - timedelta(days=10)).timestamp())
        mock_block = MockBlock(timestamp=old_timestamp)

        self.mock_web3.eth.block_number = 1010
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == False
        assert 'Transaction too old' in result.error_message

    @pytest.mark.asyncio
    async def test_verify_evm_payment_large_amount(self):
        """Test payment verification with large USDC amount"""
        tx_hash = '0xlarge'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address

        # Amount: 100 USDC = 100,000,000 (6 decimals)
        amount_raw = 100_000_000

        transfer_log = self.create_transfer_log(from_addr, to_addr, amount_raw)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[transfer_log]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}
        mock_block = MockBlock(timestamp=int(datetime.utcnow().timestamp()))

        self.mock_web3.eth.block_number = 1010
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == True
        assert result.amount_usdc == Decimal('100.0')

    @pytest.mark.asyncio
    async def test_verify_evm_payment_multiple_transfers(self):
        """Test transaction with multiple transfers (should use first match)"""
        tx_hash = '0xmulti'
        from_addr = '0x1234567890123456789012345678901234567890'
        to_addr = self.payment_address
        wrong_addr = '0x9999999999999999999999999999999999999999'

        # First transfer to wrong address
        log1 = self.create_transfer_log(from_addr, wrong_addr, 500_000)
        # Second transfer to our address
        log2 = self.create_transfer_log(from_addr, to_addr, 1_000_000)

        mock_receipt = MockReceipt(
            status=1,
            block_number=1000,
            logs=[log1, log2]
        )

        mock_tx = {'from': from_addr, 'to': self.usdc_address}
        mock_block = MockBlock(timestamp=int(datetime.utcnow().timestamp()))

        self.mock_web3.eth.block_number = 1010
        self.mock_web3.eth.get_transaction_receipt.return_value = mock_receipt
        self.mock_web3.eth.get_transaction.return_value = mock_tx
        self.mock_web3.eth.get_block.return_value = mock_block
        self.mock_web3.keccak.return_value = MagicMock(
            hex=lambda: self.transfer_signature
        )

        result = await self.verifier.verify_payment(tx_hash, 'base')

        assert result.is_valid == True
        assert result.amount_usdc == Decimal('1.0')
        assert result.to_address.lower() == to_addr.lower()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
