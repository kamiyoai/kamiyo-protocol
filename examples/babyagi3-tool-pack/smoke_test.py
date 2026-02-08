"""Local smoke test for the BabyAGI3 KAMIYO tool scaffold."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path


MODULE_PATH = Path(__file__).parent / "tools" / "optional" / "kamiyo.py"


def load_module():
    spec = importlib.util.spec_from_file_location("kamiyo_tools", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to load module spec")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    os.environ["KAMIYO_ENABLED"] = "1"
    os.environ.setdefault("KAMIYO_MODE", "mock")

    mod = load_module()

    mode = os.environ.get("KAMIYO_MODE", "mock").lower()
    provider_id = os.environ.get("KAMIYO_PROVIDER_ID", "provider-alpha")
    currency = os.environ.get("KAMIYO_CURRENCY")
    test_url = (
        os.environ.get("KAMIYO_TEST_URL", "https://example.com")
        if mode == "live"
        else "https://example-good"
    )

    create_kwargs = {
        "provider_id": provider_id,
        "amount": 1.25,
        "transaction_id": "demo-1",
        "idempotency_key": "create-demo-1",
    }
    if currency:
        create_kwargs["currency"] = currency

    created = mod.kamiyo_create_escrow_call(**create_kwargs)
    assert created["ok"] is True, created

    executed = mod.kamiyo_execute_paid_call(
        escrow_id=created["escrow_id"],
        url=test_url,
    )
    assert executed["ok"] is True, executed

    assessed = mod.kamiyo_assess_quality(
        escrow_id=created["escrow_id"],
        response=executed["response"],
        expected_fields=["data.result"],
        max_latency_ms=1000,
    )
    assert assessed["ok"] is True, assessed

    settled = mod.kamiyo_settle_or_dispute(
        escrow_id=created["escrow_id"],
        quality_score=assessed["quality_score"],
        idempotency_key="settle-demo-1",
    )
    assert settled["ok"] is True, settled

    rep = mod.kamiyo_get_provider_reputation(provider_id=provider_id)
    assert rep["ok"] is True, rep

    print("Smoke test passed")


if __name__ == "__main__":
    main()
