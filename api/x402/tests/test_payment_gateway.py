"""Tests for UnifiedPaymentGateway."""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import Request

from api.x402.payment_gateway import UnifiedPaymentGateway
from api.x402.payai_facilitator import PayAIFacilitator, VerificationResult, SettlementResult
from api.x402.payment_tracker import PaymentTracker


class TestUnifiedPaymentGateway:
    @pytest.fixture
    def mock_tracker(self):
        tracker = MagicMock(spec=PaymentTracker)
        tracker.create_payment_record = AsyncMock(
            return_value={
                "id": 1,
                "tx_hash": "0xtest",
                "amount_usdc": 0.01,
                "from_address": "0xuser",
                "requests_allocated": 1,
                "requests_remaining": 1,
            }
        )
        return tracker

    @pytest.fixture
    def mock_middleware(self):
        middleware = MagicMock()
        middleware._validate_onchain_payment = AsyncMock(
            return_value={
                "is_valid": True,
                "payment_id": 1,
                "payment_type": "onchain",
                "from_address": "0xnative_user",
            }
        )
        middleware._validate_payment_token = AsyncMock(
            return_value={"is_valid": True, "payment_id": 2, "payment_type": "token"}
        )
        return middleware

    @pytest.fixture
    def gateway(self, mock_tracker, mock_middleware):
        return UnifiedPaymentGateway(
            payment_tracker=mock_tracker,
            middleware=mock_middleware,
            payai_merchant_address="0xmerchant",
        )

    @pytest.mark.asyncio
    async def test_payai_payment_success(self, gateway):
        with patch.object(gateway.payai, "verify_payment") as mock_verify, patch.object(
            gateway.payai, "settle_payment"
        ) as mock_settle:

            mock_verify.return_value = VerificationResult(is_valid=True, payer="0xpayer")
            mock_settle.return_value = SettlementResult(
                success=True, payer="0xpayer", transaction="0xtx", network="base"
            )

            request = MagicMock(spec=Request)
            request.headers.get = MagicMock(
                side_effect=lambda k: {"x-payment": "data"}.get(k)
            )
            request.url.path = "/exploits"

            result = await gateway.verify_payment(request)

            assert result["is_valid"]
            assert result["payment_type"] == "payai_facilitator"
            assert result["payer"] == "0xpayer"

    @pytest.mark.asyncio
    async def test_native_onchain_payment(self, gateway, mock_middleware):
        request = MagicMock(spec=Request)
        request.headers.get = MagicMock(
            side_effect=lambda k: {"x-payment-tx": "0xtx", "x-payment-chain": "base"}.get(k)
        )
        request.url.path = "/exploits"

        result = await gateway.verify_payment(request)

        assert result["is_valid"]
        assert result["payment_type"] == "onchain"
        mock_middleware._validate_onchain_payment.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_payment_provided(self, gateway):
        request = MagicMock(spec=Request)
        request.headers.get = MagicMock(return_value=None)
        request.url.path = "/exploits"

        result = await gateway.verify_payment(request)

        assert not result["is_valid"]
        assert "No valid payment" in result["error"]

    def test_402_response_format(self, gateway):
        request = MagicMock(spec=Request)
        request.url.path = "/exploits"

        response = gateway.create_402_response(
            request=request, endpoint="/exploits", price_usdc=Decimal("0.01")
        )

        assert "payment_options" in response
        assert len(response["payment_options"]) >= 2

        payai = next(o for o in response["payment_options"] if o["provider"] == "PayAI Network")
        assert payai["priority"] == 1
        assert payai["recommended"]

        native = next(o for o in response["payment_options"] if o["provider"] == "KAMIYO Native")
        assert native["priority"] == 2


class TestPayAIFacilitator:
    @pytest.fixture
    def facilitator(self):
        return PayAIFacilitator(
            merchant_address="0xmerchant", facilitator_url="https://test.url"
        )

    def test_create_payment_requirement(self, facilitator):
        req = facilitator.create_payment_requirement(
            endpoint="/exploits",
            price_usdc=Decimal("0.01"),
            description="Test",
            network="base",
        )

        assert req.scheme == "exact"
        assert req.network == "base"
        assert req.max_amount_required == "10000"
        assert req.pay_to == "0xmerchant"

    def test_create_402_response(self, facilitator):
        resp = facilitator.create_402_response(
            endpoint="/exploits",
            price_usdc=Decimal("0.01"),
            description="Test",
            networks=["base", "solana"],
        )

        assert resp["x402Version"] == 1
        assert len(resp["accepts"]) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
