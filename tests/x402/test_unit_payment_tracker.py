#!/usr/bin/env python3
"""
Unit tests for PaymentTracker
"""

import pytest
import asyncio
from datetime import datetime, timedelta

# Import directly to avoid path issues
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from api.x402.payment_tracker import payment_tracker


class TestPaymentTrackerUnit:
    """Unit tests for PaymentTracker"""

    def setup_method(self):
        """Set up test fixtures"""
        # Clear any existing test data
        payment_tracker.payments.clear()
        payment_tracker.tokens.clear()
        payment_tracker.next_payment_id = 1

    @pytest.mark.asyncio
    async def test_create_payment_record_new(self):
        """Test creating a new payment record"""
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        assert payment['id'] == 1
        assert payment['tx_hash'] == "0x1234567890abcdef"
        assert payment['chain'] == "base"
        assert payment['amount_usdc'] == 1.0
        assert payment['from_address'] == "0xsender123"
        assert payment['status'] == "verified"
        assert payment['requests_remaining'] == 1000  # 1.0 / 0.10 * 100

    @pytest.mark.asyncio
    async def test_create_payment_record_duplicate(self):
        """Test creating duplicate payment record"""
        # Create first payment
        payment1 = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        # Try to create duplicate
        payment2 = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        # Should return same payment
        assert payment1['id'] == payment2['id']
        assert payment1['tx_hash'] == payment2['tx_hash']

    @pytest.mark.asyncio
    async def test_generate_payment_token(self):
        """Test generating payment token"""
        # Create payment record
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        # Generate token
        token = await payment_tracker.generate_payment_token(payment['id'])
        
        assert isinstance(token, str)
        assert len(token) > 32  # Should be a secure token

    @pytest.mark.asyncio
    async def test_generate_payment_token_invalid_payment(self):
        """Test generating token for invalid payment"""
        with pytest.raises(ValueError, match="Payment not found"):
            await payment_tracker.generate_payment_token(999)

    @pytest.mark.asyncio
    async def test_get_payment_by_token_valid(self):
        """Test getting payment by valid token"""
        # Create payment and token
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        token = await payment_tracker.generate_payment_token(payment['id'])
        
        # Get payment by token
        payment_info = await payment_tracker.get_payment_by_token(token)
        
        assert payment_info is not None
        assert payment_info['id'] == payment['id']
        assert payment_info['requests_remaining'] == 1000

    @pytest.mark.asyncio
    async def test_get_payment_by_token_invalid(self):
        """Test getting payment by invalid token"""
        payment_info = await payment_tracker.get_payment_by_token("invalid_token")
        assert payment_info is None

    @pytest.mark.asyncio
    async def test_record_usage_success(self):
        """Test recording successful usage"""
        # Create payment and token
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        # Record usage
        await payment_tracker.record_usage(payment['id'], "/exploits", 0.10)
        
        # Check requests remaining
        payment_info = payment_tracker.payments[payment['id']]
        assert payment_info.requests_remaining == 999

    @pytest.mark.asyncio
    async def test_record_usage_insufficient_requests(self):
        """Test recording usage with insufficient requests"""
        # Create payment with minimal amount
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=0.10,  # Only 100 requests
            from_address="0xsender123"
        )
        
        # Use all requests
        for _ in range(100):
            await payment_tracker.record_usage(payment['id'], "/exploits", 0.10)
        
        # Try to use one more
        with pytest.raises(ValueError, match="Insufficient requests remaining"):
            await payment_tracker.record_usage(payment['id'], "/exploits", 0.10)

    @pytest.mark.asyncio
    async def test_get_payment_stats(self):
        """Test getting payment statistics"""
        # Create some payments
        await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender1"
        )
        
        await payment_tracker.create_payment_record(
            tx_hash="0xabcdef1234567890",
            chain="ethereum",
            amount_usdc=2.0,
            from_address="0xsender2"
        )
        
        stats = await payment_tracker.get_payment_stats()
        
        assert stats['total_payments'] == 2
        assert stats['total_amount_usdc'] == 3.0
        assert stats['active_payments'] == 2
        assert stats['average_payment'] == 1.5

    @pytest.mark.asyncio
    async def test_cleanup_expired_payments(self):
        """Test cleaning up expired payments"""
        # Create payment
        payment = await payment_tracker.create_payment_record(
            tx_hash="0x1234567890abcdef",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender123"
        )
        
        # Manually set payment to expired
        payment_tracker.payments[payment['id']].expires_at = datetime.now() - timedelta(hours=1)
        
        # Clean up expired payments
        await payment_tracker.cleanup_expired_payments()
        
        # Check payment is expired
        payment_info = payment_tracker.payments[payment['id']]
        assert payment_info.status == "expired"

    def test_hash_token(self):
        """Test token hashing"""
        token = "test_token_123"
        hashed = payment_tracker._hash_token(token)
        
        assert isinstance(hashed, str)
        assert len(hashed) == 64  # SHA-256 hash length
        # Same token should produce same hash
        assert hashed == payment_tracker._hash_token(token)

    def test_payment_record_dataclass(self):
        """Test PaymentRecord dataclass"""
        from api.x402.payment_tracker import PaymentRecord
        
        record = PaymentRecord(
            id=1,
            tx_hash="0x123",
            chain="base",
            amount_usdc=1.0,
            from_address="0xsender",
            status="verified",
            risk_score=0.1,
            created_at=datetime.now(),
            verified_at=datetime.now(),
            expires_at=datetime.now() + timedelta(hours=24),
            requests_remaining=1000
        )
        
        assert record.id == 1
        assert record.tx_hash == "0x123"
        assert record.amount_usdc == 1.0

    def test_payment_token_dataclass(self):
        """Test PaymentToken dataclass"""
        from api.x402.payment_tracker import PaymentToken
        
        token = PaymentToken(
            token_hash="abc123",
            payment_id=1,
            created_at=datetime.now(),
            expires_at=datetime.now() + timedelta(hours=24),
            requests_remaining=100
        )
        
        assert token.token_hash == "abc123"
        assert token.payment_id == 1
        assert token.requests_remaining == 100


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
