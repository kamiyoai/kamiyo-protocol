#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tests for KAMIYO x402 Payment Tracker
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch

from api.x402.payment_tracker import PaymentTracker, PaymentRecord, PaymentToken


class TestPaymentTracker:
    """Test payment tracking functionality"""

    def setup_method(self):
        """Set up test fixtures"""
        self.tracker = PaymentTracker()
        
    def test_initialization(self):
        """Test that payment tracker initializes correctly"""
        assert len(self.tracker.payments) == 0
        assert len(self.tracker.tokens) == 0
        assert self.tracker.next_payment_id == 1
        assert self.tracker.token_expiry_hours == 24
        assert self.tracker.requests_per_payment == 100
        
    @pytest.mark.asyncio
    async def test_create_payment_record_new(self):
        """Test creating a new payment record"""
        payment_data = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender',
            risk_score=0.1
        )
        
        assert payment_data['id'] == 1
        assert payment_data['tx_hash'] == '0x123'
        assert payment_data['chain'] == 'base'
        assert payment_data['amount_usdc'] == 1.0
        assert payment_data['from_address'] == '0xsender'
        assert payment_data['status'] == 'verified'
        assert payment_data['risk_score'] == 0.1
        assert payment_data['requests_remaining'] == 1000  # 1.0 / 0.10 * 100
        
        # Verify payment was stored
        assert len(self.tracker.payments) == 1
        assert self.tracker.next_payment_id == 2
        
    @pytest.mark.asyncio
    async def test_create_payment_record_duplicate(self):
        """Test creating payment record for duplicate transaction"""
        # Create first payment
        payment1 = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        # Try to create duplicate
        payment2 = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        # Should return the same payment
        assert payment1['id'] == payment2['id']
        assert len(self.tracker.payments) == 1
        
    @pytest.mark.asyncio
    async def test_generate_payment_token(self):
        """Test generating payment token"""
        # Create payment record first
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        # Generate token
        token = await self.tracker.generate_payment_token(payment['id'])
        
        assert isinstance(token, str)
        assert len(token) > 0
        assert len(self.tracker.tokens) == 1
        
    @pytest.mark.asyncio
    async def test_generate_payment_token_invalid_payment(self):
        """Test generating token for invalid payment"""
        with pytest.raises(ValueError, match="Payment not found"):
            await self.tracker.generate_payment_token(999)
            
    @pytest.mark.asyncio
    async def test_get_payment_by_token_valid(self):
        """Test getting payment by valid token"""
        # Create payment and token
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        token = await self.tracker.generate_payment_token(payment['id'])
        
        # Get payment by token
        payment_data = await self.tracker.get_payment_by_token(token)
        
        assert payment_data is not None
        assert payment_data['id'] == payment['id']
        assert payment_data['tx_hash'] == '0x123'
        assert payment_data['requests_remaining'] == 1000
        
    @pytest.mark.asyncio
    async def test_get_payment_by_token_invalid(self):
        """Test getting payment by invalid token"""
        payment_data = await self.tracker.get_payment_by_token('invalid_token')
        assert payment_data is None
        
    @pytest.mark.asyncio
    async def test_get_payment_by_token_expired(self):
        """Test getting payment by expired token"""
        # Create payment with expired token
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        token = await self.tracker.generate_payment_token(payment['id'])
        
        # Manually expire the payment
        payment_record = self.tracker.payments[payment['id']]
        payment_record.expires_at = datetime.now() - timedelta(hours=25)
        
        # Should return None for expired token
        payment_data = await self.tracker.get_payment_by_token(token)
        assert payment_data is None
        
    @pytest.mark.asyncio
    async def test_record_usage_success(self):
        """Test recording successful API usage"""
        # Create payment
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        initial_requests = payment['requests_remaining']
        
        # Record usage
        await self.tracker.record_usage(
            payment_id=payment['id'],
            endpoint='/exploits',
            cost=0.10
        )
        
        # Check requests decreased
        updated_payment = self.tracker.payments[payment['id']]
        assert updated_payment.requests_remaining == initial_requests - 1
        
    @pytest.mark.asyncio
    async def test_record_usage_insufficient_requests(self):
        """Test recording usage with insufficient requests"""
        # Create payment with minimal requests
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=0.10,  # Only 100 requests
            from_address='0xsender'
        )
        
        # Use up all requests
        payment_record = self.tracker.payments[payment['id']]
        payment_record.requests_remaining = 0
        
        # Should raise error
        with pytest.raises(ValueError, match="Insufficient requests"):
            await self.tracker.record_usage(
                payment_id=payment['id'],
                endpoint='/exploits',
                cost=0.10
            )
            
    @pytest.mark.asyncio
    async def test_record_usage_mark_used(self):
        """Test marking payment as used when requests exhausted"""
        # Create payment with 1 request remaining
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=0.10,
            from_address='0xsender'
        )
        
        payment_record = self.tracker.payments[payment['id']]
        payment_record.requests_remaining = 1
        
        # Use the last request
        await self.tracker.record_usage(
            payment_id=payment['id'],
            endpoint='/exploits',
            cost=0.10
        )
        
        # Should be marked as used
        assert payment_record.requests_remaining == 0
        assert payment_record.status == 'used'
        
    @pytest.mark.asyncio
    async def test_get_payment_stats(self):
        """Test getting payment statistics"""
        # Create multiple payments
        await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender1'
        )
        
        await self.tracker.create_payment_record(
            tx_hash='0x456',
            chain='ethereum',
            amount_usdc=2.0,
            from_address='0xsender2'
        )
        
        # Get stats
        stats = await self.tracker.get_payment_stats()
        
        assert stats['total_payments'] == 2
        assert stats['total_amount_usdc'] == 3.0
        assert stats['active_payments'] == 2
        assert stats['average_payment'] == 1.5
        
    @pytest.mark.asyncio
    async def test_get_payment_stats_filtered(self):
        """Test getting payment statistics filtered by address"""
        # Create payments from different addresses
        await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender1'
        )
        
        await self.tracker.create_payment_record(
            tx_hash='0x456',
            chain='ethereum',
            amount_usdc=2.0,
            from_address='0xsender2'
        )
        
        # Get stats for specific sender
        stats = await self.tracker.get_payment_stats(from_address='0xsender1')
        
        assert stats['total_payments'] == 1
        assert stats['total_amount_usdc'] == 1.0
        assert stats['average_payment'] == 1.0
        
    @pytest.mark.asyncio
    async def test_cleanup_expired_payments(self):
        """Test cleaning up expired payments"""
        # Create payment that will expire
        payment = await self.tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        # Generate token
        token = await self.tracker.generate_payment_token(payment['id'])
        
        # Manually expire the payment
        payment_record = self.tracker.payments[payment['id']]
        payment_record.expires_at = datetime.now() - timedelta(hours=25)
        
        # Clean up expired payments
        await self.tracker.cleanup_expired_payments()
        
        # Payment should be marked as expired
        assert payment_record.status == 'expired'
        # Token should be removed
        token_hash = self.tracker._hash_token(token)
        assert token_hash not in self.tracker.tokens
        
    def test_hash_token(self):
        """Test token hashing"""
        token = 'test_token_123'
        hash1 = self.tracker._hash_token(token)
        hash2 = self.tracker._hash_token(token)
        
        # Same token should produce same hash
        assert hash1 == hash2
        
        # Different tokens should produce different hashes
        hash3 = self.tracker._hash_token('different_token')
        assert hash1 != hash3
        
        # Hash should be hex string
        assert isinstance(hash1, str)
        assert len(hash1) == 64  # SHA-256 hash length
        
    def test_payment_record_dataclass(self):
        """Test PaymentRecord dataclass"""
        now = datetime.now()
        expires = now + timedelta(hours=24)
        
        record = PaymentRecord(
            id=1,
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender',
            status='verified',
            risk_score=0.1,
            created_at=now,
            verified_at=now,
            expires_at=expires,
            requests_remaining=100
        )
        
        assert record.id == 1
        assert record.tx_hash == '0x123'
        assert record.amount_usdc == 1.0
        assert record.status == 'verified'
        assert record.requests_remaining == 100
        
    def test_payment_token_dataclass(self):
        """Test PaymentToken dataclass"""
        now = datetime.now()
        expires = now + timedelta(hours=24)
        
        token = PaymentToken(
            token_hash='abc123',
            payment_id=1,
            created_at=now,
            expires_at=expires,
            requests_remaining=100
        )
        
        assert token.token_hash == 'abc123'
        assert token.payment_id == 1
        assert token.requests_remaining == 100


if __name__ == '__main__':
    pytest.main([__file__, '-v'])