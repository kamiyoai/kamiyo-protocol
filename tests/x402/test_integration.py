#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Integration tests for KAMIYO x402 Payment System
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

from api.main import app
from api.x402.payment_verifier import payment_verifier
from api.x402.payment_tracker import payment_tracker


class TestX402Integration:
    """Integration tests for x402 payment system"""

    def setup_method(self):
        """Set up test fixtures"""
        self.client = TestClient(app)
        
        # Clear any existing test data
        payment_tracker.payments.clear()
        payment_tracker.tokens.clear()
        payment_tracker.next_payment_id = 1
        
    def test_get_supported_chains(self):
        """Test getting supported chains endpoint"""
        response = self.client.get("/x402/supported-chains")
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'supported_chains' in data
        assert 'payment_addresses' in data
        assert 'min_payment_amount' in data
        
        chains = data['supported_chains']
        assert 'base' in chains
        assert 'ethereum' in chains
        assert 'solana' in chains
        
    def test_get_pricing_info(self):
        """Test getting pricing information"""
        response = self.client.get("/x402/pricing")
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'pricing_tiers' in data
        assert 'payment_methods' in data
        
        pay_per_use = data['pricing_tiers']['pay_per_use']
        assert pay_per_use['price_per_call'] == 0.10
        assert pay_per_use['min_payment'] == 1.00
        
    @pytest.mark.asyncio
    async def test_verify_payment_endpoint_success(self):
        """Test payment verification endpoint with successful payment"""
        # Mock successful payment verification
        with patch.object(payment_verifier, 'verify_payment') as mock_verify:
            mock_verify.return_value = Mock(
                is_valid=True,
                tx_hash='0x123',
                chain='base',
                amount_usdc=1.0,
                from_address='0xsender',
                to_address='0xrecipient',
                block_number=1000,
                confirmations=10,
                risk_score=0.1,
                error_message=None
            )
            
            response = self.client.post(
                "/x402/verify-payment",
                json={
                    "tx_hash": "0x123",
                    "chain": "base"
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['is_valid'] == True
            assert data['payment_id'] == 1
            assert data['amount_usdc'] == 1.0
            assert data['risk_score'] == 0.1
            
    @pytest.mark.asyncio
    async def test_verify_payment_endpoint_failure(self):
        """Test payment verification endpoint with failed payment"""
        # Mock failed payment verification
        with patch.object(payment_verifier, 'verify_payment') as mock_verify:
            mock_verify.return_value = Mock(
                is_valid=False,
                tx_hash='0x123',
                chain='base',
                amount_usdc=0.0,
                from_address='',
                to_address='',
                block_number=0,
                confirmations=0,
                risk_score=1.0,
                error_message="Transaction not found"
            )
            
            response = self.client.post(
                "/x402/verify-payment",
                json={
                    "tx_hash": "0x123",
                    "chain": "base"
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            
            assert data['is_valid'] == False
            assert 'Transaction not found' in data['error_message']
            assert 'payment_id' not in data
            
    @pytest.mark.asyncio
    async def test_generate_payment_token_success(self):
        """Test generating payment token endpoint"""
        # Create a payment record first
        payment = await payment_tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        response = self.client.post(f"/x402/generate-token/{payment['id']}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'payment_token' in data
        assert data['payment_id'] == payment['id']
        assert data['requests_remaining'] == 1000
        assert 'expires_at' in data
        
    def test_generate_payment_token_invalid_payment(self):
        """Test generating token for invalid payment"""
        response = self.client.post("/x402/generate-token/999")
        
        assert response.status_code == 404
        data = response.json()
        assert 'detail' in data
        
    @pytest.mark.asyncio
    async def test_get_payment_status(self):
        """Test getting payment status endpoint"""
        # Create a payment record
        payment = await payment_tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender'
        )
        
        response = self.client.get(f"/x402/payment/{payment['id']}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['payment_id'] == payment['id']
        assert data['tx_hash'] == '0x123'
        assert data['amount_usdc'] == 1.0
        assert data['status'] == 'verified'
        assert data['requests_remaining'] == 1000
        
    def test_get_payment_status_invalid(self):
        """Test getting status for invalid payment"""
        response = self.client.get("/x402/payment/999")
        
        assert response.status_code == 404
        
    @pytest.mark.asyncio
    async def test_get_payment_stats(self):
        """Test getting payment statistics endpoint"""
        # Create some payments
        await payment_tracker.create_payment_record(
            tx_hash='0x123',
            chain='base',
            amount_usdc=1.0,
            from_address='0xsender1'
        )
        
        await payment_tracker.create_payment_record(
            tx_hash='0x456',
            chain='ethereum',
            amount_usdc=2.0,
            from_address='0xsender2'
        )
        
        response = self.client.get("/x402/stats")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['total_payments'] == 2
        assert data['total_amount_usdc'] == 3.0
        assert data['active_payments'] == 2
        assert data['average_payment'] == 1.5
        
    def test_cleanup_expired_payments_admin(self):
        """Test cleanup endpoint with admin key"""
        response = self.client.post(
            "/x402/cleanup",
            headers={"x-admin-key": "test-admin-key"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
    def test_cleanup_expired_payments_unauthorized(self):
        """Test cleanup endpoint without admin key"""
        response = self.client.post("/x402/cleanup")
        
        assert response.status_code == 403
        
    def test_x402_middleware_payment_required(self):
        """Test x402 middleware returns payment required"""
        # Access paid endpoint without payment
        response = self.client.get("/exploits")
        
        assert response.status_code == 402
        data = response.json()
        
        assert data['payment_required'] == True
        assert data['amount_usdc'] == 0.10
        assert 'payment_methods' in data
        assert 'endpoint' in data
        
    def test_x402_middleware_with_payment_token(self):
        """Test x402 middleware with valid payment token"""
        # Mock payment tracker to return valid payment
        with patch.object(payment_tracker, 'get_payment_by_token') as mock_get:
            mock_get.return_value = {
                'id': 1,
                'requests_remaining': 100,
                'expires_at': '2025-12-31T23:59:59'
            }
            
            response = self.client.get(
                "/exploits",
                headers={"x-payment-token": "valid_token"}
            )
            
            # Should not return 402 (payment accepted)
            assert response.status_code != 402
            
    def test_x402_middleware_with_onchain_payment(self):
        """Test x402 middleware with on-chain payment headers"""
        # Mock payment verification and tracking
        with patch.object(payment_verifier, 'verify_payment') as mock_verify, \
             patch.object(payment_tracker, 'create_payment_record') as mock_create:
            
            mock_verify.return_value = Mock(
                is_valid=True,
                amount_usdc=1.0,
                from_address='0xsender',
                risk_score=0.1
            )
            
            mock_create.return_value = {
                'id': 1,
                'requests_remaining': 1000
            }
            
            response = self.client.get(
                "/exploits",
                headers={
                    "x-payment-tx": "0x123",
                    "x-payment-chain": "base"
                }
            )
            
            # Should not return 402 (payment accepted)
            assert response.status_code != 402
            
    def test_x402_middleware_skip_paths(self):
        """Test x402 middleware skips certain paths"""
        # Health endpoint should not require payment
        response = self.client.get("/health")
        assert response.status_code != 402
        
        # Docs endpoint should not require payment
        response = self.client.get("/docs")
        assert response.status_code != 402
        
        # Ready endpoint should not require payment
        response = self.client.get("/ready")
        assert response.status_code != 402
        
    def test_full_payment_flow_integration(self):
        """Test complete payment flow integration"""
        # Step 1: Get payment information
        response = self.client.get("/x402/supported-chains")
        assert response.status_code == 200
        
        # Step 2: Verify payment (mocked)
        with patch.object(payment_verifier, 'verify_payment') as mock_verify:
            mock_verify.return_value = Mock(
                is_valid=True,
                tx_hash='0x123',
                chain='base',
                amount_usdc=1.0,
                from_address='0xsender',
                to_address='0xrecipient',
                block_number=1000,
                confirmations=10,
                risk_score=0.1,
                error_message=None
            )
            
            response = self.client.post(
                "/x402/verify-payment",
                json={
                    "tx_hash": "0x123",
                    "chain": "base"
                }
            )
            assert response.status_code == 200
            
            payment_data = response.json()
            payment_id = payment_data['payment_id']
            
            # Step 3: Generate payment token
            response = self.client.post(f"/x402/generate-token/{payment_id}")
            assert response.status_code == 200
            
            token_data = response.json()
            payment_token = token_data['payment_token']
            
            # Step 4: Access paid endpoint with token
            with patch.object(payment_tracker, 'get_payment_by_token') as mock_get:
                mock_get.return_value = {
                    'id': payment_id,
                    'requests_remaining': 100,
                    'expires_at': '2025-12-31T23:59:59'
                }
                
                response = self.client.get(
                    "/exploits",
                    headers={"x-payment-token": payment_token}
                )
                
                # Should succeed (not 402)
                assert response.status_code != 402


if __name__ == '__main__':
    pytest.main([__file__, '-v'])