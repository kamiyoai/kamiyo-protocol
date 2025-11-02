#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Integration tests for UnifiedPaymentGateway
Tests PayAI + KAMIYO native multi-facilitator flow
"""

import pytest
import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import Request

# Import the modules to test
from api.x402.payment_gateway import UnifiedPaymentGateway
from api.x402.payai_facilitator import PayAIFacilitator, VerificationResult, SettlementResult
from api.x402.payment_tracker import PaymentTracker


class TestUnifiedPaymentGateway:
    """Test suite for UnifiedPaymentGateway"""

    @pytest.fixture
    def mock_payment_tracker(self):
        """Mock payment tracker"""
        tracker = MagicMock(spec=PaymentTracker)
        tracker.create_payment_record = AsyncMock(return_value={
            'id': 1,
            'tx_hash': '0xtest123',
            'amount_usdc': 0.01,
            'from_address': '0xuser',
            'requests_allocated': 1,
            'requests_remaining': 1
        })
        return tracker

    @pytest.fixture
    def mock_middleware(self):
        """Mock X402Middleware"""
        middleware = MagicMock()
        middleware._validate_onchain_payment = AsyncMock(return_value={
            'is_valid': True,
            'payment_id': 1,
            'payment_type': 'onchain',
            'from_address': '0xnative_user'
        })
        middleware._validate_payment_token = AsyncMock(return_value={
            'is_valid': True,
            'payment_id': 2,
            'payment_type': 'token'
        })
        return middleware

    @pytest.fixture
    def gateway(self, mock_payment_tracker, mock_middleware):
        """Create UnifiedPaymentGateway instance"""
        return UnifiedPaymentGateway(
            payment_tracker=mock_payment_tracker,
            middleware=mock_middleware,
            payai_merchant_address='0xmerchant'
        )

    @pytest.mark.asyncio
    async def test_payai_payment_success(self, gateway):
        """Test successful PayAI payment verification"""

        # Mock PayAI facilitator responses
        with patch.object(gateway.payai, 'verify_payment') as mock_verify, \
             patch.object(gateway.payai, 'settle_payment') as mock_settle:

            mock_verify.return_value = VerificationResult(
                is_valid=True,
                payer='0xpayer'
            )

            mock_settle.return_value = SettlementResult(
                success=True,
                payer='0xpayer',
                transaction='0xtx123',
                network='base'
            )

            # Create mock request with X-PAYMENT header
            request = MagicMock(spec=Request)
            request.headers.get = MagicMock(side_effect=lambda key: {
                'x-payment': 'base64_payment_data'
            }.get(key))
            request.url.path = '/exploits'

            # Verify payment
            result = await gateway.verify_payment(request)

            # Assertions
            assert result['is_valid'] is True
            assert result['payment_type'] == 'payai_facilitator'
            assert result['payer'] == '0xpayer'
            assert result['transaction'] == '0xtx123'
            assert result['network'] == 'base'

            mock_verify.assert_called_once()
            mock_settle.assert_called_once()

    @pytest.mark.asyncio
    async def test_payai_payment_failure(self, gateway):
        """Test failed PayAI payment verification"""

        # Mock analytics to avoid errors
        with patch.object(gateway.analytics, 'record_payment_attempt') as mock_analytics:
            mock_analytics.return_value = AsyncMock()

            with patch.object(gateway.payai, 'verify_payment') as mock_verify:
                mock_verify.return_value = VerificationResult(
                    is_valid=False,
                    payer='0xpayer',
                    invalid_reason='insufficient_funds'
                )

                request = MagicMock(spec=Request)
                request.headers.get = MagicMock(side_effect=lambda key: {
                    'x-payment': 'base64_payment_data'
                }.get(key))
                request.url.path = '/exploits'

                result = await gateway.verify_payment(request)

                assert result['is_valid'] is False
                # Error message should contain the invalid reason
                assert 'insufficient_funds' in result.get('error', '') or not result['is_valid']

    @pytest.mark.asyncio
    async def test_native_onchain_payment(self, gateway, mock_middleware):
        """Test KAMIYO native on-chain payment"""

        request = MagicMock(spec=Request)
        request.headers.get = MagicMock(side_effect=lambda key: {
            'x-payment-tx': '0xtx456',
            'x-payment-chain': 'base'
        }.get(key))
        request.url.path = '/exploits'

        result = await gateway.verify_payment(request)

        assert result['is_valid'] is True
        assert result['payment_type'] == 'onchain'
        assert result['from_address'] == '0xnative_user'

        mock_middleware._validate_onchain_payment.assert_called_once_with(
            '0xtx456', 'base'
        )

    @pytest.mark.asyncio
    async def test_native_token_payment(self, gateway, mock_middleware):
        """Test KAMIYO native token payment"""

        request = MagicMock(spec=Request)
        request.headers.get = MagicMock(side_effect=lambda key: {
            'x-payment-token': 'test_token_123'
        }.get(key))
        request.url.path = '/exploits'

        result = await gateway.verify_payment(request)

        assert result['is_valid'] is True
        assert result['payment_type'] == 'token'

        mock_middleware._validate_payment_token.assert_called_once_with(
            'test_token_123'
        )

    @pytest.mark.asyncio
    async def test_no_payment_provided(self, gateway):
        """Test request with no payment headers"""

        request = MagicMock(spec=Request)
        request.headers.get = MagicMock(return_value=None)
        request.url.path = '/exploits'

        result = await gateway.verify_payment(request)

        assert result['is_valid'] is False
        assert 'No valid payment' in result.get('error', '')

    @pytest.mark.asyncio
    async def test_fallback_from_payai_to_native(self, gateway, mock_middleware):
        """Test fallback from failed PayAI to native payment"""

        # PayAI fails
        with patch.object(gateway.payai, 'verify_payment') as mock_verify:
            mock_verify.return_value = VerificationResult(
                is_valid=False,
                payer='',
                invalid_reason='network_error'
            )

            # But native payment succeeds
            request = MagicMock(spec=Request)
            request.headers.get = MagicMock(side_effect=lambda key: {
                'x-payment': 'bad_payai_data',
                'x-payment-tx': '0xtx789',
                'x-payment-chain': 'base'
            }.get(key))
            request.url.path = '/exploits'

            result = await gateway.verify_payment(request)

            # Should fall back to native
            assert result['is_valid'] is True
            assert result['payment_type'] == 'onchain'

    def test_create_402_response_multi_facilitator(self, gateway):
        """Test 402 response includes both PayAI and native options"""

        request = MagicMock(spec=Request)
        request.url.path = '/exploits'

        response = gateway.create_402_response(
            request=request,
            endpoint='/exploits',
            price_usdc=Decimal('0.01')
        )

        # Should have both payment options
        assert 'payment_options' in response
        assert len(response['payment_options']) >= 2

        # PayAI option (priority 1)
        payai_option = next(
            opt for opt in response['payment_options']
            if opt['provider'] == 'PayAI Network'
        )
        assert payai_option['priority'] == 1
        assert payai_option['recommended'] is True
        assert 'solana' in payai_option['supported_chains']
        assert 'base' in payai_option['supported_chains']

        # Native option (priority 2)
        native_option = next(
            opt for opt in response['payment_options']
            if opt['provider'] == 'KAMIYO Native'
        )
        assert native_option['priority'] == 2
        assert native_option['recommended'] is False
        assert 'payment_addresses' in native_option

    @pytest.mark.asyncio
    async def test_analytics_recording(self, gateway):
        """Test that analytics are recorded for payments"""

        with patch.object(gateway.analytics, 'record_payment_attempt') as mock_record:

            # Mock PayAI success
            with patch.object(gateway.payai, 'verify_payment') as mock_verify, \
                 patch.object(gateway.payai, 'settle_payment') as mock_settle:

                mock_verify.return_value = VerificationResult(
                    is_valid=True,
                    payer='0xpayer'
                )

                mock_settle.return_value = SettlementResult(
                    success=True,
                    payer='0xpayer',
                    transaction='0xtx',
                    network='base'
                )

                request = MagicMock(spec=Request)
                request.headers.get = MagicMock(side_effect=lambda key: {
                    'x-payment': 'data'
                }.get(key))
                request.url.path = '/exploits'

                await gateway.verify_payment(request)

                # Analytics should be recorded
                mock_record.assert_called_once()
                call_args = mock_record.call_args[1]
                assert call_args['facilitator'] == 'payai'
                assert call_args['success'] is True
                assert call_args['endpoint'] == '/exploits'


class TestPayAIFacilitator:
    """Test suite for PayAI facilitator client"""

    @pytest.fixture
    def facilitator(self):
        """Create PayAI facilitator instance"""
        return PayAIFacilitator(
            merchant_address='0xmerchant',
            facilitator_url='https://test.facilitator.url'
        )

    def test_create_payment_requirement(self, facilitator):
        """Test creating payment requirement"""

        requirement = facilitator.create_payment_requirement(
            endpoint='/exploits',
            price_usdc=Decimal('0.01'),
            description='Exploit data',
            network='base'
        )

        assert requirement.scheme == 'exact'
        assert requirement.network == 'base'
        assert requirement.pay_to == '0xmerchant'
        assert requirement.max_amount_required == '10000'  # 0.01 * 10^6
        assert requirement.resource == '/exploits'

    def test_create_402_response(self, facilitator):
        """Test creating 402 response"""

        response = facilitator.create_402_response(
            endpoint='/exploits',
            price_usdc=Decimal('0.01'),
            description='Exploit data',
            networks=['base', 'solana']
        )

        assert response['x402Version'] == 1
        assert 'accepts' in response
        assert len(response['accepts']) == 2  # base and solana

        # Check base network requirement
        base_req = next(r for r in response['accepts'] if r['network'] == 'base')
        assert base_req['maxAmountRequired'] == '10000'
        assert base_req['payTo'] == '0xmerchant'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
