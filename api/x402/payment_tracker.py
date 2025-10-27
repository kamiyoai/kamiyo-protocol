#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KAMIYO Payment Tracker
Track and manage x402 payment records and usage
"""

import logging
import secrets
import hashlib
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class PaymentRecord:
    """Payment record for tracking x402 payments"""
    id: int
    tx_hash: str
    chain: str
    amount_usdc: float
    from_address: str
    status: str  # pending, verified, expired, used
    risk_score: float
    created_at: datetime
    verified_at: Optional[datetime]
    expires_at: datetime
    requests_remaining: int

@dataclass
class PaymentToken:
    """Payment access token"""
    token_hash: str
    payment_id: int
    created_at: datetime
    expires_at: datetime
    requests_remaining: int

class PaymentTracker:
    """
    Track x402 payments and manage payment tokens
    
    In production, this would use a database. For now, we use in-memory storage.
    """
    
    def __init__(self):
        self.payments: Dict[int, PaymentRecord] = {}
        self.tokens: Dict[str, PaymentToken] = {}
        self.next_payment_id = 1
        self.token_expiry_hours = 24  # Tokens expire after 24 hours
        self.requests_per_payment = 100  # 100 API calls per $0.10 payment
    
    async def create_payment_record(
        self,
        tx_hash: str,
        chain: str,
        amount_usdc: float,
        from_address: str,
        risk_score: float = 0.1
    ) -> Dict[str, any]:
        """Create a new payment record from verified transaction"""
        
        # Check if payment already exists
        existing_payment = await self._find_payment_by_tx_hash(tx_hash)
        if existing_payment:
            return self._payment_to_dict(existing_payment)
        
        # Calculate requests based on payment amount
        # $0.10 = 100 requests, scaled linearly
        base_requests = int((amount_usdc / 0.10) * self.requests_per_payment)
        
        # Create payment record
        payment = PaymentRecord(
            id=self.next_payment_id,
            tx_hash=tx_hash,
            chain=chain,
            amount_usdc=amount_usdc,
            from_address=from_address,
            status='verified',
            risk_score=risk_score,
            created_at=self.get_current_time(),
            verified_at=self.get_current_time(),
            expires_at=self.get_current_time() + timedelta(hours=self.token_expiry_hours),
            requests_remaining=base_requests
        )
        
        self.payments[payment.id] = payment
        self.next_payment_id += 1
        
        logger.info(f"Created payment record: {payment.id} for {amount_usdc} USDC")
        
        return self._payment_to_dict(payment)
    
    async def generate_payment_token(self, payment_id: int) -> str:
        """Generate a payment access token for a verified payment"""
        
        payment = self.payments.get(payment_id)
        if not payment:
            raise ValueError(f"Payment not found: {payment_id}")
        
        if payment.status != 'verified':
            raise ValueError(f"Payment not verified: {payment_id}")
        
        # Generate secure random token
        raw_token = secrets.token_urlsafe(32)
        token_hash = self._hash_token(raw_token)
        
        # Create token record
        token = PaymentToken(
            token_hash=token_hash,
            payment_id=payment_id,
            created_at=self.get_current_time(),
            expires_at=payment.expires_at,
            requests_remaining=payment.requests_remaining
        )
        
        self.tokens[token_hash] = token
        
        logger.info(f"Generated payment token for payment {payment_id}")
        
        return raw_token
    
    async def get_payment_by_token(self, token: str) -> Optional[Dict[str, any]]:
        """Get payment record by token"""
        
        token_hash = self._hash_token(token)
        token_record = self.tokens.get(token_hash)
        
        if not token_record:
            return None
        
        # Check if token is expired
        if token_record.expires_at < self.get_current_time():
            await self._expire_token(token_hash)
            return None
        
        # Get payment record
        payment = self.payments.get(token_record.payment_id)
        if not payment:
            return None
        
        # Update token with current requests remaining from payment
        token_record.requests_remaining = payment.requests_remaining
        
        return {
            'id': payment.id,
            'tx_hash': payment.tx_hash,
            'chain': payment.chain,
            'amount_usdc': payment.amount_usdc,
            'from_address': payment.from_address,
            'status': payment.status,
            'risk_score': payment.risk_score,
            'created_at': payment.created_at,
            'expires_at': payment.expires_at,
            'requests_remaining': payment.requests_remaining,
            'token_expires_at': token_record.expires_at
        }
    
    async def record_usage(self, payment_id: int, endpoint: str, cost: float):
        """Record API usage for a payment"""
        
        payment = self.payments.get(payment_id)
        if not payment:
            raise ValueError(f"Payment not found: {payment_id}")
        
        # Convert cost to requests (simplified)
        requests_used = 1  # Each API call uses 1 request
        
        if payment.requests_remaining < requests_used:
            raise ValueError(f"Insufficient requests remaining: {payment.requests_remaining}")
        
        # Deduct requests
        payment.requests_remaining -= requests_used
        
        logger.info(f"Recorded usage for payment {payment_id}: {endpoint} (remaining: {payment.requests_remaining})")
        
        # If no requests remaining, mark as used
        if payment.requests_remaining <= 0:
            payment.status = 'used'
            logger.info(f"Payment {payment_id} fully used")
    
    async def get_payment_stats(self, from_address: str = None) -> Dict[str, any]:
        """Get payment statistics"""
        
        payments = list(self.payments.values())
        
        if from_address:
            payments = [p for p in payments if p.from_address.lower() == from_address.lower()]
        
        total_payments = len(payments)
        total_amount = sum(p.amount_usdc for p in payments)
        active_payments = len([p for p in payments if p.status == 'verified' and p.requests_remaining > 0])
        
        return {
            'total_payments': total_payments,
            'total_amount_usdc': total_amount,
            'active_payments': active_payments,
            'average_payment': total_amount / total_payments if total_payments > 0 else 0,
            'total_requests_used': sum((p.amount_usdc / 0.10 * self.requests_per_payment) - p.requests_remaining for p in payments)
        }
    
    async def cleanup_expired_payments(self):
        """Clean up expired payments and tokens"""
        
        current_time = self.get_current_time()
        expired_count = 0
        
        # Expire old payments
        for payment_id, payment in list(self.payments.items()):
            if payment.expires_at < current_time and payment.status == 'verified':
                payment.status = 'expired'
                expired_count += 1
        
        # Remove expired tokens
        for token_hash, token in list(self.tokens.items()):
            if token.expires_at < current_time:
                del self.tokens[token_hash]
        
        if expired_count > 0:
            logger.info(f"Cleaned up {expired_count} expired payments")
    
    def get_current_time(self) -> datetime:
        """Get current time (mockable for testing)"""
        return datetime.now()
    
    def _hash_token(self, token: str) -> str:
        """Hash token for secure storage"""
        return hashlib.sha256(token.encode()).hexdigest()
    
    async def _find_payment_by_tx_hash(self, tx_hash: str) -> Optional[PaymentRecord]:
        """Find payment by transaction hash"""
        for payment in self.payments.values():
            if payment.tx_hash == tx_hash:
                return payment
        return None
    
    async def _expire_token(self, token_hash: str):
        """Expire a token"""
        if token_hash in self.tokens:
            del self.tokens[token_hash]
    
    def _payment_to_dict(self, payment: PaymentRecord) -> Dict[str, any]:
        """Convert payment record to dictionary"""
        return {
            'id': payment.id,
            'tx_hash': payment.tx_hash,
            'chain': payment.chain,
            'amount_usdc': payment.amount_usdc,
            'from_address': payment.from_address,
            'status': payment.status,
            'risk_score': payment.risk_score,
            'created_at': payment.created_at,
            'verified_at': payment.verified_at,
            'expires_at': payment.expires_at,
            'requests_remaining': payment.requests_remaining
        }

# Global instance for easy access
payment_tracker = PaymentTracker()