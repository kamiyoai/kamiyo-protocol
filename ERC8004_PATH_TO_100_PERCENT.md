# ERC-8004 Path to 100% Production Readiness
**Agent:** Claude Sonnet 4.5
**Current State:** 71/100 (C+)
**Target State:** 100/100 (A+)
**Estimated Time:** 3-4 days of focused work

---

## Executive Summary

This plan outlines a systematic approach for a Sonnet 4.5 agent to achieve 100% production readiness for the ERC-8004 agent identity system. The work is divided into 4 sequential phases, each building upon the previous, with clear deliverables and verification steps.

**Key Principle:** No stone left unturned. Every component will be strengthened, hardened, and polished to A+ grade.

---

## Phase 1: Critical Infrastructure (Day 1 - 8 hours)
**Goal:** Fix blocking issues that prevent production deployment
**Target Score After Phase 1:** 82/100

### 1.1 Database Transaction Management (2 hours)

**Task:** Implement atomic transactions for all multi-step operations

**Deliverables:**
```python
# website/api/erc8004/database.py

from contextlib import asynccontextmanager
import logging

logger = logging.getLogger(__name__)

class DatabaseTransactionManager:
    """Production-grade transaction management with rollback"""

    def __init__(self, db):
        self.db = db
        self.transaction_depth = 0

    @asynccontextmanager
    async def transaction(self, isolation_level='READ COMMITTED'):
        """
        Transaction context manager with proper error handling

        Usage:
            async with db_manager.transaction():
                await db.execute("INSERT ...")
                await db.execute("UPDATE ...")
                # Auto-commit on success, rollback on error
        """
        self.transaction_depth += 1
        transaction_id = f"txn_{self.transaction_depth}_{id(self)}"

        try:
            if self.transaction_depth == 1:
                await self.db.execute(f"BEGIN ISOLATION LEVEL {isolation_level}")
                logger.debug(f"Transaction started: {transaction_id}")
            else:
                await self.db.execute(f"SAVEPOINT {transaction_id}")
                logger.debug(f"Savepoint created: {transaction_id}")

            yield

            if self.transaction_depth == 1:
                await self.db.execute("COMMIT")
                logger.debug(f"Transaction committed: {transaction_id}")
            else:
                await self.db.execute(f"RELEASE SAVEPOINT {transaction_id}")
                logger.debug(f"Savepoint released: {transaction_id}")

        except Exception as e:
            if self.transaction_depth == 1:
                await self.db.execute("ROLLBACK")
                logger.error(f"Transaction rolled back: {transaction_id}", exc_info=True)
            else:
                await self.db.execute(f"ROLLBACK TO SAVEPOINT {transaction_id}")
                logger.error(f"Rolled back to savepoint: {transaction_id}", exc_info=True)
            raise
        finally:
            self.transaction_depth -= 1

# Update routes.py to use transactions
@router.post("/register", response_model=AgentResponse, status_code=201)
async def register_agent(request: RegisterAgentRequest):
    db_manager = DatabaseTransactionManager(get_db())

    async with db_manager.transaction():
        # Step 1: Insert agent
        agent_uuid = await _insert_agent(request)

        # Step 2: Insert metadata (will rollback if fails)
        await _insert_metadata(agent_uuid, request.metadata)

        # Step 3: Emit event (will rollback if fails)
        await _emit_registration_event(agent_uuid)

    return agent_uuid
```

**Verification:**
- Test transaction rollback on step 2 failure
- Test nested transaction handling
- Verify no partial writes in database
- Load test with concurrent transactions

**Points Gained:** +8 (API Layer: 75→83)

---

### 1.2 Rate Limiting Implementation (3 hours)

**Task:** Implement comprehensive rate limiting with Redis backend

**Deliverables:**
```python
# website/api/erc8004/rate_limiter.py

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
import redis.asyncio as redis
import os

# Redis connection for distributed rate limiting
redis_client = redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379'),
    encoding="utf-8",
    decode_responses=True
)

# Custom key function that considers API key + IP
async def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on API key or IP address
    Authenticated users get higher limits
    """
    # Check for API key
    auth_header = request.headers.get('authorization', '')
    if auth_header.startswith('Bearer '):
        api_key = auth_header[7:]
        return f"api_key:{api_key}"

    # Fall back to IP address for anonymous users
    return f"ip:{get_remote_address(request)}"

# Initialize limiter with Redis storage
limiter = Limiter(
    key_func=get_rate_limit_key,
    storage_uri=os.getenv('REDIS_URL', 'redis://localhost:6379'),
    strategy="fixed-window",
    headers_enabled=True
)

# Rate limit tiers
class RateLimits:
    # Agent operations (expensive)
    REGISTER_AGENT = "10/hour"  # Max 10 agent registrations per hour
    UPDATE_AGENT = "100/hour"   # Max 100 updates per hour

    # Feedback operations (moderate)
    SUBMIT_FEEDBACK = "100/hour"  # Max 100 feedback submissions per hour

    # Read operations (light)
    GET_AGENT = "1000/hour"  # Max 1000 agent lookups per hour
    SEARCH_AGENTS = "500/hour"  # Max 500 searches per hour

    # Payment linking (moderate)
    LINK_PAYMENT = "200/hour"  # Max 200 payment links per hour

# Apply to routes
@router.post("/register")
@limiter.limit(RateLimits.REGISTER_AGENT)
async def register_agent(request: Request, data: RegisterAgentRequest):
    ...

@router.post("/feedback")
@limiter.limit(RateLimits.SUBMIT_FEEDBACK)
async def submit_feedback(request: Request, data: ReputationFeedbackRequest):
    ...

@router.get("/{agent_uuid}")
@limiter.limit(RateLimits.GET_AGENT)
async def get_agent(request: Request, agent_uuid: str):
    ...

@router.get("/")
@limiter.limit(RateLimits.SEARCH_AGENTS)
async def search_agents(request: Request, ...):
    ...

# Custom rate limit exceeded handler
@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": f"Rate limit exceeded: {exc.detail}",
                "retry_after": exc.headers.get("Retry-After"),
                "limit": exc.headers.get("X-RateLimit-Limit"),
                "remaining": exc.headers.get("X-RateLimit-Remaining")
            }
        },
        headers=exc.headers
    )
```

**Verification:**
- Test rate limit enforcement at each tier
- Test rate limit reset after time window
- Test distributed rate limiting across multiple instances
- Test authenticated vs anonymous limits

**Points Gained:** +10 (API Layer: 83→93, Security: 80→85)

---

### 1.3 Comprehensive Logging & Monitoring (3 hours)

**Task:** Implement structured logging with Sentry integration

**Deliverables:**
```python
# website/api/erc8004/monitoring.py

import structlog
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from prometheus_client import Counter, Histogram, Gauge
import os

# Initialize Sentry
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.1,  # 10% of transactions for performance monitoring
    profiles_sample_rate=0.1,  # 10% for profiling
    integrations=[
        FastApiIntegration(),
        AsyncioIntegration()
    ],
    before_send=lambda event, hint: event if event.get('level') != 'debug' else None
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True
)

logger = structlog.get_logger()

# Prometheus Metrics
agent_registrations_total = Counter(
    'erc8004_agent_registrations_total',
    'Total agent registrations',
    ['chain', 'status']
)

agent_registration_duration = Histogram(
    'erc8004_agent_registration_duration_seconds',
    'Agent registration duration',
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

feedback_submissions_total = Counter(
    'erc8004_feedback_submissions_total',
    'Total feedback submissions',
    ['status']
)

payment_links_total = Counter(
    'erc8004_payment_links_total',
    'Total payment links',
    ['chain', 'status']
)

agent_search_duration = Histogram(
    'erc8004_agent_search_duration_seconds',
    'Agent search query duration',
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0]
)

active_agents_gauge = Gauge(
    'erc8004_active_agents_total',
    'Total active agents',
    ['chain']
)

# Logging middleware
from fastapi import Request
import time

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Log all requests with timing and context"""
    request_id = str(uuid.uuid4())

    # Bind request context
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host
    )

    start_time = time.time()

    logger.info("request_started",
                query_params=dict(request.query_params))

    try:
        response = await call_next(request)

        duration = time.time() - start_time

        logger.info("request_completed",
                    status_code=response.status_code,
                    duration_seconds=duration)

        return response

    except Exception as e:
        duration = time.time() - start_time

        logger.error("request_failed",
                     error=str(e),
                     duration_seconds=duration,
                     exc_info=True)

        # Send to Sentry
        sentry_sdk.capture_exception(e)
        raise

# Update routes to use structured logging
@router.post("/register")
async def register_agent(request: RegisterAgentRequest):
    with agent_registration_duration.time():
        try:
            logger.info("agent_registration_started",
                       owner=request.owner_address,
                       chain=request.chain)

            result = await _register_agent(request)

            agent_registrations_total.labels(
                chain=request.chain,
                status='success'
            ).inc()

            logger.info("agent_registration_success",
                       agent_id=result.agent_id,
                       agent_uuid=result.agent_uuid)

            return result

        except Exception as e:
            agent_registrations_total.labels(
                chain=request.chain,
                status='error'
            ).inc()

            logger.error("agent_registration_failed",
                        owner=request.owner_address,
                        error=str(e),
                        exc_info=True)

            sentry_sdk.capture_exception(e)
            raise

# Health check endpoint
@router.get("/health")
async def health_check():
    """Comprehensive health check"""
    checks = {}
    overall_healthy = True

    # Database check
    try:
        await db.execute("SELECT 1")
        checks['database'] = {'status': 'healthy'}
    except Exception as e:
        checks['database'] = {'status': 'unhealthy', 'error': str(e)}
        overall_healthy = False

    # Redis check
    try:
        await redis_client.ping()
        checks['redis'] = {'status': 'healthy'}
    except Exception as e:
        checks['redis'] = {'status': 'unhealthy', 'error': str(e)}
        overall_healthy = False

    # Materialized view freshness check
    try:
        result = await db.fetch_one("""
            SELECT EXTRACT(EPOCH FROM (NOW() - MAX(last_feedback_at)))::int as age_seconds
            FROM mv_erc8004_agent_reputation
        """)
        age_seconds = result[0] if result else 0

        if age_seconds > 3600:  # Stale if > 1 hour
            checks['materialized_views'] = {
                'status': 'degraded',
                'age_seconds': age_seconds,
                'message': 'Views need refresh'
            }
        else:
            checks['materialized_views'] = {'status': 'healthy'}
    except Exception as e:
        checks['materialized_views'] = {'status': 'unknown', 'error': str(e)}

    return {
        'status': 'healthy' if overall_healthy else 'unhealthy',
        'checks': checks,
        'version': '1.0.0'
    }

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    from prometheus_client import generate_latest
    return Response(
        content=generate_latest(),
        media_type="text/plain"
    )
```

**Verification:**
- Test Sentry error capture
- Test Prometheus metrics collection
- Test structured log output
- Test health check responses
- Verify request tracing with request_id

**Points Gained:** +20 (Monitoring: 40→60, API Layer: 93→95)

---

## Phase 2: Smart Contract Hardening (Day 2 - 6 hours)
**Goal:** Secure smart contracts to production standards
**Target Score After Phase 2:** 92/100

### 2.1 Contract Security Features (4 hours)

**Task:** Add reentrancy guards, pausable, and access control

**Deliverables:**
```solidity
// contracts/AgentIdentityRegistry_Production.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title AgentIdentityRegistry (Production-Hardened)
 * @dev ERC-8004 compliant agent identity registry with security features
 */
contract AgentIdentityRegistry is
    ERC721URIStorage,
    AccessControl,
    ReentrancyGuard,
    Pausable
{
    using Counters for Counters.Counter;
    Counters.Counter private _agentIdCounter;

    // Roles
    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct MetadataEntry {
        string key;
        bytes value;
    }

    // Custom errors (gas optimization)
    error AgentNotFound(uint256 agentId);
    error Unauthorized(address caller, uint256 agentId);
    error InvalidMetadataKey(string key);
    error RegistrationFailed(string reason);
    error MetadataLimitExceeded();

    // Events
    event Registered(
        uint256 indexed agentId,
        string tokenURI,
        address indexed owner,
        uint256 timestamp
    );

    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedKey,
        string key,
        bytes value,
        uint256 timestamp
    );

    event RegistryPaused(address indexed pauser, uint256 timestamp);
    event RegistryUnpaused(address indexed unpauser, uint256 timestamp);

    // State
    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => string[]) private _metadataKeys;

    // Limits
    uint256 public constant MAX_METADATA_KEYS = 50;
    uint256 public constant MAX_METADATA_VALUE_SIZE = 10240; // 10KB

    constructor() ERC721("KAMIYO Agent Identity", "KAMIYO-AGENT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRY_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    /**
     * @dev Register new agent with reentrancy protection
     */
    function register(
        string memory tokenURI,
        MetadataEntry[] memory metadata
    )
        public
        nonReentrant
        whenNotPaused
        returns (uint256 agentId)
    {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, tokenURI);

        // Set metadata with size validation
        for (uint i = 0; i < metadata.length; i++) {
            if (metadata[i].value.length > MAX_METADATA_VALUE_SIZE) {
                revert RegistrationFailed("Metadata value too large");
            }
            _setMetadata(agentId, metadata[i].key, metadata[i].value);
        }

        emit Registered(agentId, tokenURI, msg.sender, block.timestamp);
        return agentId;
    }

    /**
     * @dev Register with URI only
     */
    function register(string memory tokenURI)
        public
        returns (uint256 agentId)
    {
        MetadataEntry[] memory emptyMetadata;
        return register(tokenURI, emptyMetadata);
    }

    /**
     * @dev Auto-generate URI registration
     */
    function register()
        public
        returns (uint256 agentId)
    {
        _agentIdCounter.increment();
        agentId = _agentIdCounter.current();

        _safeMint(msg.sender, agentId);

        string memory autoURI = string(
            abi.encodePacked(
                "https://kamiyo.ai/api/v1/agents/",
                _toString(agentId),
                "/registration"
            )
        );
        _setTokenURI(agentId, autoURI);

        emit Registered(agentId, autoURI, msg.sender, block.timestamp);
        return agentId;
    }

    /**
     * @dev Set metadata with authorization check
     */
    function setMetadata(uint256 agentId, string memory key, bytes memory value)
        public
        nonReentrant
        whenNotPaused
    {
        if (ownerOf(agentId) != msg.sender && !hasRole(REGISTRY_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized(msg.sender, agentId);
        }

        if (value.length > MAX_METADATA_VALUE_SIZE) {
            revert RegistrationFailed("Metadata value too large");
        }

        if (_metadataKeys[agentId].length >= MAX_METADATA_KEYS) {
            revert MetadataLimitExceeded();
        }

        _setMetadata(agentId, key, value);
    }

    /**
     * @dev Get metadata
     */
    function getMetadata(uint256 agentId, string memory key)
        public
        view
        returns (bytes memory value)
    {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentNotFound(agentId);
        }
        return _metadata[agentId][key];
    }

    /**
     * @dev Internal metadata setter
     */
    function _setMetadata(uint256 agentId, string memory key, bytes memory value)
        internal
    {
        if (bytes(key).length == 0) {
            revert InvalidMetadataKey(key);
        }

        // Track new keys
        if (_metadata[agentId][key].length == 0) {
            _metadataKeys[agentId].push(key);
        }

        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value, block.timestamp);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit RegistryPaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit RegistryUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @dev Get total registered agents
     */
    function totalAgents() public view returns (uint256) {
        return _agentIdCounter.current();
    }

    /**
     * @dev Required override for AccessControl + ERC721
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Convert uint to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
```

**Same hardening for AgentReputationRegistry_Production.sol**

**Verification:**
- Test reentrancy attack prevention
- Test pause/unpause functionality
- Test access control on admin functions
- Test custom error gas savings
- Test metadata size limits
- Gas optimization verification

**Points Gained:** +20 (Smart Contracts: 70→90)

---

### 2.2 Contract Testing Suite (2 hours)

**Task:** Comprehensive Hardhat tests

**Deliverables:**
```javascript
// contracts/test/AgentIdentityRegistry.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentIdentityRegistry Production Tests", function () {
    let registry;
    let owner, user1, user2, pauser;

    beforeEach(async function () {
        [owner, user1, user2, pauser] = await ethers.getSigners();

        const Registry = await ethers.getContractFactory("AgentIdentityRegistry");
        registry = await Registry.deploy();
        await registry.deployed();

        // Grant pauser role
        const PAUSER_ROLE = await registry.PAUSER_ROLE();
        await registry.grantRole(PAUSER_ROLE, pauser.address);
    });

    describe("Registration", function () {
        it("Should register agent successfully", async function () {
            const tx = await registry.connect(user1).register(
                "https://example.com/agent/1",
                []
            );

            const receipt = await tx.wait();
            const event = receipt.events.find(e => e.event === "Registered");

            expect(event.args.agentId).to.equal(1);
            expect(event.args.owner).to.equal(user1.address);
        });

        it("Should auto-generate URI", async function () {
            await registry.connect(user1).register();

            const uri = await registry.tokenURI(1);
            expect(uri).to.include("kamiyo.ai/api/v1/agents/1");
        });

        it("Should fail when paused", async function () {
            await registry.connect(pauser).pause();

            await expect(
                registry.connect(user1).register()
            ).to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Metadata", function () {
        beforeEach(async function () {
            await registry.connect(user1).register();
        });

        it("Should set metadata as owner", async function () {
            await registry.connect(user1).setMetadata(
                1,
                "test_key",
                ethers.utils.toUtf8Bytes("test_value")
            );

            const value = await registry.getMetadata(1, "test_key");
            expect(ethers.utils.toUtf8String(value)).to.equal("test_value");
        });

        it("Should reject metadata from non-owner", async function () {
            await expect(
                registry.connect(user2).setMetadata(
                    1,
                    "test_key",
                    ethers.utils.toUtf8Bytes("test_value")
                )
            ).to.be.revertedWithCustomError(registry, "Unauthorized");
        });

        it("Should enforce metadata size limit", async function () {
            const largeValue = new Uint8Array(11000); // > 10KB

            await expect(
                registry.connect(user1).setMetadata(1, "large", largeValue)
            ).to.be.revertedWithCustomError(registry, "RegistrationFailed");
        });

        it("Should enforce metadata key limit", async function () {
            // Add 50 keys (max)
            for (let i = 0; i < 50; i++) {
                await registry.connect(user1).setMetadata(
                    1,
                    `key_${i}`,
                    ethers.utils.toUtf8Bytes("value")
                );
            }

            // 51st should fail
            await expect(
                registry.connect(user1).setMetadata(
                    1,
                    "key_51",
                    ethers.utils.toUtf8Bytes("value")
                )
            ).to.be.revertedWithCustomError(registry, "MetadataLimitExceeded");
        });
    });

    describe("Security", function () {
        it("Should prevent reentrancy", async function () {
            // Reentrancy test with malicious contract
            // Implementation depends on attack vector
        });

        it("Should pause/unpause with correct role", async function () {
            await registry.connect(pauser).pause();
            expect(await registry.paused()).to.be.true;

            await registry.connect(pauser).unpause();
            expect(await registry.paused()).to.be.false;
        });

        it("Should reject pause from non-pauser", async function () {
            await expect(
                registry.connect(user1).pause()
            ).to.be.reverted;
        });
    });

    describe("Gas Optimization", function () {
        it("Should use custom errors efficiently", async function () {
            const tx = registry.connect(user2).setMetadata(
                999,
                "key",
                ethers.utils.toUtf8Bytes("value")
            );

            await expect(tx).to.be.revertedWithCustomError(
                registry,
                "Unauthorized"
            );
        });
    });
});
```

**Points Gained:** Included in contract hardening

---

## Phase 3: Testing & Caching (Day 3 - 7 hours)
**Goal:** Implement comprehensive tests and caching layer
**Target Score After Phase 3:** 96/100

### 3.1 Implement Complete Test Suite (4 hours)

**Task:** Convert all test stubs to working tests

**Deliverables:**
```python
# website/tests/erc8004/conftest.py

import pytest
import asyncio
from typing import AsyncGenerator
import uuid

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
async def test_db() -> AsyncGenerator:
    """Test database with transaction rollback"""
    from database import get_db

    db = get_db()
    await db.execute("BEGIN")

    yield db

    await db.execute("ROLLBACK")
    await db.close()

@pytest.fixture
async def test_agent(test_db):
    """Create test agent"""
    agent_uuid = str(uuid.uuid4())

    await test_db.execute("""
        INSERT INTO erc8004_agents (
            id, agent_id, chain, registry_address, owner_address,
            token_uri, status, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
    """, (
        agent_uuid, 1, "base",
        "0x0000000000000000000000000000000000000001",
        "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
        "https://test.com", "active"
    ))

    return agent_uuid

# Implement all 30+ tests from test_production_readiness.py
# Each test must have actual assertions and verification
```

**Run full test suite:**
```bash
pytest website/tests/erc8004/ -v --cov=website/api/erc8004 --cov-report=html
```

**Target:** 90%+ code coverage

**Points Gained:** +25 (Testing: 65→90)

---

### 3.2 Redis Caching Layer (3 hours)

**Task:** Implement Redis caching for expensive queries

**Deliverables:**
```python
# website/api/erc8004/cache.py

from typing import Optional, Any
import redis.asyncio as redis
import json
import hashlib
from functools import wraps
import os

class ERC8004Cache:
    """Production-grade caching with Redis"""

    def __init__(self):
        self.redis = redis.from_url(
            os.getenv('REDIS_URL', 'redis://localhost:6379'),
            encoding="utf-8",
            decode_responses=True
        )
        self.default_ttl = 300  # 5 minutes

    def cache_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate consistent cache key"""
        key_parts = [prefix] + [str(arg) for arg in args]
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}:{v}")

        key_string = ":".join(key_parts)
        return f"erc8004:{hashlib.md5(key_string.encode()).hexdigest()}"

    async def get(self, key: str) -> Optional[Any]:
        """Get cached value"""
        try:
            value = await self.redis.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.error(f"Cache get failed: {e}")
        return None

    async def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set cached value"""
        try:
            await self.redis.setex(
                key,
                ttl or self.default_ttl,
                json.dumps(value, default=str)
            )
            return True
        except Exception as e:
            logger.error(f"Cache set failed: {e}")
            return False

    async def delete(self, pattern: str) -> int:
        """Delete keys matching pattern"""
        try:
            keys = await self.redis.keys(f"erc8004:{pattern}")
            if keys:
                return await self.redis.delete(*keys)
        except Exception as e:
            logger.error(f"Cache delete failed: {e}")
        return 0

    async def invalidate_agent(self, agent_uuid: str):
        """Invalidate all caches for an agent"""
        await self.delete(f"*{agent_uuid}*")

# Cache decorator
def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator for caching function results"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache = ERC8004Cache()

            # Generate cache key
            cache_key = cache.cache_key(
                key_prefix or func.__name__,
                *args,
                **kwargs
            )

            # Try cache first
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value

            # Cache miss - compute value
            logger.debug(f"Cache miss: {cache_key}")
            result = await func(*args, **kwargs)

            # Store in cache
            await cache.set(cache_key, result, ttl)

            return result
        return wrapper
    return decorator

# Apply caching to expensive operations
@router.get("/{agent_uuid}/stats")
@cached(ttl=300, key_prefix="agent_stats")
async def get_agent_stats(agent_uuid: str):
    """Get agent stats with caching"""
    ...

@router.get("/")
@cached(ttl=60, key_prefix="agent_search")
async def search_agents(
    owner_address: Optional[str] = None,
    chain: Optional[str] = None,
    ...
):
    """Search agents with caching"""
    ...

# Cache invalidation on updates
@router.post("/feedback")
async def submit_feedback(request: ReputationFeedbackRequest):
    result = await _submit_feedback(request)

    # Invalidate agent caches
    cache = ERC8004Cache()
    await cache.invalidate_agent(request.agent_uuid)

    return result
```

**Points Gained:** +10 (Performance: 70→80, API Layer: 95→98)

---

## Phase 4: Performance & Polish (Day 4 - 5 hours)
**Goal:** Optimize performance and reach 100%
**Target Score After Phase 4:** 100/100

### 4.1 Authentication & Authorization (2 hours)

**Task:** Implement API key authentication

**Deliverables:**
```python
# website/api/erc8004/auth.py

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

security = HTTPBearer()

class AuthenticatedUser:
    def __init__(self, user_id: str, tier: str, api_key: str):
        self.user_id = user_id
        self.tier = tier
        self.api_key = api_key
        self.is_authenticated = True

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> AuthenticatedUser:
    """Verify API key and return user"""
    api_key = credentials.credentials

    user = await db.fetch_one("""
        SELECT u.id, u.tier, k.key
        FROM api_keys k
        JOIN users u ON k.user_id = u.id
        WHERE k.key = %s AND k.status = 'active'
    """, (api_key,))

    if not user:
        raise HTTPException(401, "Invalid API key")

    return AuthenticatedUser(
        user_id=user[0],
        tier=user[1],
        api_key=user[2]
    )

async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security, auto_error=False)
) -> Optional[AuthenticatedUser]:
    """Optional authentication"""
    if not credentials:
        return None
    return await get_current_user(credentials)

# Apply to routes
@router.post("/register")
async def register_agent(
    request: RegisterAgentRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    # Verify user owns the address
    if request.owner_address.lower() != user.wallet_address.lower():
        raise UnauthorizedOperationException(
            "register",
            request.owner_address,
            user.wallet_address
        )
    ...
```

**Points Gained:** +5 (Security: 85→90)

---

### 4.2 Performance Optimization (2 hours)

**Task:** Query optimization and benchmarking

**Deliverables:**
```sql
-- Optimize slow queries with EXPLAIN ANALYZE

-- Before optimization
EXPLAIN ANALYZE
SELECT * FROM v_erc8004_agent_stats
WHERE trust_level = 'excellent'
ORDER BY reputation_score DESC
LIMIT 50;

-- Add covering index
CREATE INDEX idx_erc8004_agents_trust_covering
ON erc8004_agents (status, chain, owner_address)
WHERE status = 'active';

-- Optimize materialized view refresh
CREATE INDEX CONCURRENTLY idx_mv_refresh_timestamp
ON erc8004_reputation (created_at DESC)
WHERE is_revoked = FALSE;

-- Scheduled materialized view refresh
CREATE OR REPLACE FUNCTION schedule_mv_refresh()
RETURNS void AS $$
BEGIN
    -- Only refresh if stale (> 5 minutes)
    IF (SELECT MAX(last_feedback_at) FROM mv_erc8004_agent_reputation) < NOW() - INTERVAL '5 minutes' THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_reputation;
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_erc8004_agent_payment_stats;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Load Testing:**
```python
# scripts/load_test_erc8004.py

import asyncio
import aiohttp
from datetime import datetime

async def test_load():
    """Load test with 1000 concurrent requests"""

    async with aiohttp.ClientSession() as session:
        tasks = []

        for i in range(1000):
            task = session.get(
                "http://localhost:8000/api/v1/agents/",
                params={"limit": 10}
            )
            tasks.append(task)

        start = datetime.now()
        results = await asyncio.gather(*tasks)
        duration = (datetime.now() - start).total_seconds()

        print(f"1000 requests in {duration}s")
        print(f"RPS: {1000/duration:.2f}")

        # Target: >200 RPS
        assert 1000/duration > 200, "Performance below target"

asyncio.run(test_load())
```

**Points Gained:** +10 (Performance: 80→90)

---

### 4.3 Final Polish & Documentation (1 hour)

**Task:** Complete remaining documentation and error handling

**Deliverables:**

1. **API Error Reference:**
```markdown
# ERC-8004 API Error Codes

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| AGENT_NOT_FOUND | 404 | Agent UUID not found | Verify agent UUID |
| INVALID_ADDRESS | 400 | Invalid Ethereum address | Use 0x + 40 hex chars |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests | Wait for retry-after |
...
```

2. **Troubleshooting Guide:**
```markdown
# ERC-8004 Troubleshooting

## Slow Query Performance
- Check materialized view freshness
- Run `SELECT refresh_erc8004_stats()`
- Verify indexes with `EXPLAIN ANALYZE`

## Cache Issues
- Clear Redis: `redis-cli FLUSHDB`
- Check Redis connection: `redis-cli PING`
...
```

**Points Gained:** +5 (Documentation: 90→95)

---

## Final Verification (1 hour)

Run comprehensive verification:

```bash
# 1. Run full test suite
pytest website/tests/erc8004/ -v --cov=website/api/erc8004 --cov-report=term-missing
# Target: 95%+ coverage

# 2. Run deployment verification
./scripts/verify_erc8004_deployment.sh
# Target: All checks pass

# 3. Run load tests
python scripts/load_test_erc8004.py
# Target: >200 RPS with <500ms p95

# 4. Run security audit
./scripts/security_scan_erc8004.sh
# Target: 0 critical/high issues

# 5. Contract tests
cd contracts && npx hardhat test
# Target: All tests pass, >90% coverage

# 6. Manual API testing
curl -X POST http://localhost:8000/api/v1/agents/register \
  -H "Authorization: Bearer test_key" \
  -H "Content-Type: application/json" \
  -d '{"owner_address":"0x...","chain":"base",...}'
# Target: 201 Created, <500ms response
```

---

## Final Score Breakdown

| Category | Before | After Phase 1 | After Phase 2 | After Phase 3 | After Phase 4 | Points Gained |
|----------|--------|---------------|---------------|---------------|---------------|---------------|
| Database | 95 | 95 | 95 | 95 | 95 | 0 |
| API Layer | 75 | 95 | 95 | 98 | 100 | +25 |
| Smart Contracts | 70 | 70 | 90 | 90 | 95 | +25 |
| Monitoring | 40 | 60 | 60 | 60 | 95 | +55 |
| Testing | 65 | 65 | 65 | 90 | 100 | +35 |
| Security | 80 | 85 | 85 | 85 | 100 | +20 |
| Documentation | 90 | 90 | 90 | 90 | 100 | +10 |
| Performance | 70 | 70 | 70 | 80 | 100 | +30 |

**Final Overall Score: 98/100 (A+)**

---

## Timeline Summary

| Day | Phase | Hours | Deliverables |
|-----|-------|-------|--------------|
| 1 | Critical Infrastructure | 8 | Transactions, Rate Limiting, Logging |
| 2 | Contract Hardening | 6 | Security features, Test suite |
| 3 | Testing & Caching | 7 | Full test suite, Redis cache |
| 4 | Performance & Polish | 5 | Auth, Optimization, Docs |

**Total: 26 hours over 4 days**

---

## Success Criteria

✅ **All tests pass** with 95%+ coverage
✅ **All deployment checks pass** (14/14)
✅ **Load tests pass** (>200 RPS)
✅ **Security audit** (0 critical issues)
✅ **Contract tests pass** (>90% coverage)
✅ **API response times** (<500ms p95)
✅ **Documentation complete** (API, errors, troubleshooting)
✅ **Monitoring active** (Prometheus + Sentry)

---

## Post-100% Maintenance

To maintain 100% score:

1. **Weekly:** Run full test suite + deployment verification
2. **Monthly:** Security audit + dependency updates
3. **Quarterly:** Load testing + performance review
4. **Continuous:** Monitor Sentry errors + Prometheus metrics

---

## Conclusion

This plan provides a systematic path from 71/100 to 100/100 in 4 days. Each phase builds upon the previous, with clear deliverables and verification steps. A Sonnet 4.5 agent following this plan will achieve A+ production readiness with no stone left unturned.
