"""
Test configuration and fixtures for ERC-8004 tests
"""

import pytest
import asyncio
from typing import AsyncGenerator
import uuid
from datetime import datetime


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_db() -> AsyncGenerator:
    """
    Test database connection (no transaction isolation)

    NOTE: Tests write to real database.
    Use unique UUIDs to avoid conflicts.
    """
    from config.database_pool import get_db

    pool = await get_db()

    async with pool.acquire() as conn:
        yield conn


@pytest.fixture
async def test_agent(test_db):
    """
    Create a test agent for use in tests

    Returns agent_uuid for the created agent.
    """
    agent_uuid = str(uuid.uuid4())
    agent_id = 1

    await test_db.execute("""
        INSERT INTO erc8004_agents (
            id, agent_id, chain, registry_address, owner_address,
            token_uri, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    """,
        agent_uuid,
        agent_id,
        "base",
        "0x" + "0" * 40,
        "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
        f"https://kamiyo.ai/api/v1/agents/{agent_uuid}/registration",
        "active",
        datetime.utcnow(),
        datetime.utcnow()
    )

    return agent_uuid


@pytest.fixture
async def test_api_key(test_db):
    """
    Create a test API key for authentication

    Returns API key string.
    """
    import hashlib

    api_key = f"test_key_{uuid.uuid4()}"
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    key_prefix = api_key[:8] if len(api_key) >= 8 else api_key
    user_id = str(uuid.uuid4())

    # Create test user
    await test_db.execute("""
        INSERT INTO users (id, tier, wallet_address, created_at)
        VALUES ($1, $2, $3, $4)
    """,
        user_id,
        "pro",
        "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
        datetime.utcnow()
    )

    # Create API key
    await test_db.execute("""
        INSERT INTO api_keys (user_id, key_hash, key_prefix, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5)
    """,
        user_id,
        key_hash,
        key_prefix,
        True,
        datetime.utcnow()
    )

    return api_key


@pytest.fixture
async def test_payment(test_db):
    """
    Create a test x402 payment

    Returns payment_id and tx_hash.
    """
    payment_id = str(uuid.uuid4())
    tx_hash = "0x" + "a" * 64

    await test_db.execute("""
        INSERT INTO x402_payments (
            id, tx_hash, chain, amount_usdc, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
    """,
        payment_id,
        tx_hash,
        "base",
        "100.00",
        "completed",
        datetime.utcnow()
    )

    return {"payment_id": payment_id, "tx_hash": tx_hash}
