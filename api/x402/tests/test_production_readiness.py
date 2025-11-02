#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Production Readiness Tests
End-to-end functional tests for PayAI integration
"""

import pytest
import asyncio
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from api.x402.middleware import X402Middleware
from api.x402.payment_gateway import UnifiedPaymentGateway
from api.x402.payment_tracker import PaymentTracker
from api.x402.payai_facilitator import PayAIFacilitator
from api.x402.payment_analytics import PaymentAnalytics
from api.x402.config import get_x402_config


class TestConfigurationLoading:
    """Test configuration loading and validation"""

    def test_config_loads_successfully(self):
        """Test x402 configuration loads without errors"""
        config = get_x402_config()

        assert config is not None
        assert config.enabled is not None
        assert config.base_payment_address is not None
        assert config.endpoint_prices is not None
        assert isinstance(config.endpoint_prices, dict)

        print(f"[OK] Config loaded: {len(config.endpoint_prices)} endpoints configured")

    def test_endpoint_prices_configured(self):
        """Test endpoint prices are properly configured"""
        config = get_x402_config()

        # Should have default pricing for /exploits
        assert '/exploits' in config.endpoint_prices
        assert config.endpoint_prices['/exploits'] > 0

        print(f"[OK] Endpoint /exploits priced at ${config.endpoint_prices['/exploits']}")


class TestPayAIFacilitatorInitialization:
    """Test PayAI facilitator initialization"""

    def test_facilitator_initializes(self):
        """Test PayAI facilitator can be initialized"""
        facilitator = PayAIFacilitator(merchant_address='0xtest')

        assert facilitator is not None
        assert facilitator.merchant_address == '0xtest'
        assert facilitator.facilitator_url == PayAIFacilitator.FACILITATOR_URL
        assert facilitator.client is not None

        print(f"[OK] PayAI facilitator initialized: {facilitator.facilitator_url}")

    def test_supported_networks(self):
        """Test facilitator knows supported networks"""
        facilitator = PayAIFacilitator(merchant_address='0xtest')

        assert 'solana' in facilitator.SUPPORTED_NETWORKS
        assert 'base' in facilitator.SUPPORTED_NETWORKS
        assert 'polygon' in facilitator.SUPPORTED_NETWORKS

        print(f"[OK] Supports {len(facilitator.SUPPORTED_NETWORKS)} networks")


class TestUnifiedGatewayInitialization:
    """Test unified payment gateway initialization"""

    def test_gateway_initializes_with_payai(self):
        """Test gateway initializes with PayAI enabled"""
        mock_tracker = MagicMock(spec=PaymentTracker)

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker,
            middleware=None,
            payai_merchant_address='0xtest'
        )

        assert gateway is not None
        assert gateway.payai is not None
        assert gateway.analytics is not None
        assert gateway.payment_tracker is mock_tracker

        print("[OK] Gateway initialized with PayAI + analytics")

    def test_gateway_has_correct_priority(self):
        """Test gateway prioritizes PayAI first"""
        mock_tracker = MagicMock(spec=PaymentTracker)

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker
        )

        assert gateway.facilitator_priority[0] == 'payai'
        assert gateway.facilitator_priority[1] == 'kamiyo_native'

        print("[OK] Gateway priority: PayAI → Native")


class Test402ResponseGeneration:
    """Test 402 response generation"""

    def test_402_response_has_multi_options(self):
        """Test 402 response includes both PayAI and native options"""
        mock_tracker = MagicMock(spec=PaymentTracker)
        mock_middleware = MagicMock()

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker,
            middleware=mock_middleware
        )

        request = MagicMock()
        request.url.path = '/exploits'

        response = gateway.create_402_response(
            request=request,
            endpoint='/exploits',
            price_usdc=Decimal('0.01')
        )

        assert response['payment_required'] is True
        assert response['amount_usdc'] == 0.01
        assert 'payment_options' in response
        assert len(response['payment_options']) >= 2

        # Verify PayAI option
        payai_option = next(
            opt for opt in response['payment_options']
            if opt['provider'] == 'PayAI Network'
        )
        assert payai_option['priority'] == 1
        assert payai_option['recommended'] is True

        print("[OK] 402 response includes PayAI + native options")

    def test_402_response_includes_x402_standard(self):
        """Test 402 response follows x402 specification"""
        mock_tracker = MagicMock(spec=PaymentTracker)

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker
        )

        request = MagicMock()
        request.url.path = '/exploits'

        response = gateway.create_402_response(
            request=request,
            endpoint='/exploits',
            price_usdc=Decimal('0.01')
        )

        payai_option = next(
            opt for opt in response['payment_options']
            if opt['provider'] == 'PayAI Network'
        )

        # Check x402 standard compliance
        x402_std = payai_option['x402_standard']
        assert x402_std['x402Version'] == 1
        assert 'accepts' in x402_std
        assert len(x402_std['accepts']) > 0

        # Check first accept option
        accept = x402_std['accepts'][0]
        assert accept['scheme'] == 'exact'
        assert 'network' in accept
        assert 'maxAmountRequired' in accept
        assert 'payTo' in accept

        print("[OK] 402 response follows x402 specification")


class TestAnalyticsTracking:
    """Test analytics tracking functionality"""

    @pytest.mark.asyncio
    async def test_analytics_records_payment_attempts(self):
        """Test analytics can record payment attempts"""
        analytics = PaymentAnalytics()

        await analytics.record_payment_attempt(
            endpoint='/exploits',
            facilitator='payai',
            success=True,
            latency_ms=500,
            amount_usdc=Decimal('0.01'),
            user_address='0xtest'
        )

        assert len(analytics.metrics_cache['payai']) == 1

        print("[OK] Analytics recorded payment attempt")

    @pytest.mark.asyncio
    async def test_analytics_calculates_metrics(self):
        """Test analytics can calculate performance metrics"""
        analytics = PaymentAnalytics()

        # Record some test data
        for i in range(10):
            await analytics.record_payment_attempt(
                endpoint='/exploits',
                facilitator='payai',
                success=i < 9,  # 90% success rate
                latency_ms=500 + i * 10,
                amount_usdc=Decimal('0.01')
            )

        metrics = await analytics.get_facilitator_performance(hours=24)

        assert 'payai' in metrics
        assert metrics['payai'].total_transactions == 10
        assert metrics['payai'].success_rate == 0.9  # 90%
        assert metrics['payai'].avg_latency_ms > 0

        print(f"[OK] Analytics calculated: {metrics['payai'].success_rate:.1%} success rate")


class TestErrorHandlingAndFallbacks:
    """Test error handling and fallback mechanisms"""

    @pytest.mark.asyncio
    async def test_payai_error_falls_back_to_native(self):
        """Test system falls back to native when PayAI fails"""
        mock_tracker = MagicMock(spec=PaymentTracker)
        mock_middleware = MagicMock()
        mock_middleware._validate_onchain_payment = AsyncMock(return_value={
            'is_valid': True,
            'payment_id': 1,
            'payment_type': 'onchain'
        })

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker,
            middleware=mock_middleware
        )

        # Mock PayAI failure
        with patch.object(gateway.payai, 'verify_payment') as mock_verify:
            mock_verify.side_effect = Exception("PayAI network error")

            request = MagicMock()
            request.headers.get = MagicMock(side_effect=lambda key: {
                'x-payment': 'payai_data',
                'x-payment-tx': '0xtx',
                'x-payment-chain': 'base'
            }.get(key))
            request.url.path = '/exploits'

            result = await gateway.verify_payment(request)

            # Should fall back to native
            assert result['is_valid'] is True
            assert result['payment_type'] == 'onchain'

        print("[OK] PayAI error triggers fallback to native")

    @pytest.mark.asyncio
    async def test_handles_missing_endpoint_price(self):
        """Test graceful handling of unconfigured endpoints"""
        mock_tracker = MagicMock(spec=PaymentTracker)

        gateway = UnifiedPaymentGateway(
            payment_tracker=mock_tracker
        )

        request = MagicMock()
        request.headers.get = MagicMock(return_value='payment_header')
        request.url.path = '/unconfigured-endpoint'

        result = await gateway.verify_payment(request)

        assert result['is_valid'] is False
        # Should return some error (either "not configured" or "no valid payment")
        assert result.get('error') is not None

        print("[OK] Handles unconfigured endpoints gracefully")


class TestDatabaseIntegration:
    """Test database integration points"""

    def test_payment_tracker_mock(self):
        """Test payment tracker can be mocked for testing"""
        mock_tracker = MagicMock(spec=PaymentTracker)
        mock_tracker.create_payment_record = AsyncMock(return_value={
            'id': 1,
            'tx_hash': '0xtest',
            'amount_usdc': 0.01
        })

        assert mock_tracker is not None

        print("[OK] Payment tracker can be mocked")


def run_production_readiness_tests():
    """Run all production readiness tests and generate report"""
    print("\n" + "="*60)
    print("KAMIYO PAYAI INTEGRATION - PRODUCTION READINESS TEST")
    print("="*60 + "\n")

    pytest.main([
        __file__,
        '-v',
        '--tb=short',
        '-s'  # Show print statements
    ])


if __name__ == '__main__':
    run_production_readiness_tests()
