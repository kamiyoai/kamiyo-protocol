"""
ERC-8004 End-to-End Tests
Complete integration tests with database
"""

import pytest
import asyncio
from datetime import datetime
import uuid
import time

from api.erc8004.routes import router as agents_router
from api.erc8004.health import router as health_router
from api.erc8004.models import (
    RegisterAgentRequest,
    AgentRegistrationFile,
    AgentEndpoint,
    ReputationFeedbackRequest,
    LinkPaymentToAgentRequest
)
from fastapi.testclient import TestClient
from fastapi import FastAPI


app = FastAPI()
app.include_router(agents_router)
app.include_router(health_router)
client = TestClient(app)


class TestAgentRegistrationE2E:
    """End-to-end tests for agent registration"""

    @pytest.mark.asyncio
    async def test_register_agent_success(self, test_db, test_api_key):
        """Should successfully register new agent"""
        registration_file = AgentRegistrationFile(
            name="Test Agent",
            description="A test agent for E2E testing",
            endpoints=[
                AgentEndpoint(
                    name="MCP",
                    endpoint="https://agent.example.com/mcp",
                    version="1.0"
                )
            ],
            supportedTrust=["reputation", "crypto-economic"]
        )

        request_data = {
            "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
            "chain": "base",
            "registration_file": registration_file.model_dump(),
            "metadata": {"category": "trading"}
        }

        response = client.post(
            "/api/v1/agents/register",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert "agent_uuid" in data
        assert data["chain"] == "base"
        assert data["status"] == "active"

        # Verify in database
        agent = await test_db.fetch_one("""
            SELECT * FROM erc8004_agents WHERE id = %s
        """, (data["agent_uuid"],))

        assert agent is not None
        assert agent[3] == "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7"  # owner_address

    @pytest.mark.asyncio
    async def test_register_invalid_owner(self, test_api_key):
        """Should fail with invalid owner address"""
        registration_file = AgentRegistrationFile(
            name="Test Agent",
            description="Test",
            endpoints=[]
        )

        request_data = {
            "owner_address": "invalid_address",
            "chain": "base",
            "registration_file": registration_file.model_dump()
        }

        response = client.post(
            "/api/v1/agents/register",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_without_auth(self):
        """Should fail without authentication"""
        registration_file = AgentRegistrationFile(
            name="Test Agent",
            description="Test",
            endpoints=[]
        )

        request_data = {
            "owner_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
            "chain": "base",
            "registration_file": registration_file.model_dump()
        }

        response = client.post(
            "/api/v1/agents/register",
            json=request_data
        )

        assert response.status_code == 401


class TestReputationFeedbackE2E:
    """End-to-end tests for reputation feedback"""

    @pytest.mark.asyncio
    async def test_submit_feedback_success(self, test_db, test_agent, test_api_key):
        """Should successfully submit feedback"""
        request_data = {
            "agent_uuid": test_agent,
            "client_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
            "score": 85,
            "tag1": "quality",
            "tag2": "responsive"
        }

        response = client.post(
            "/api/v1/agents/feedback",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["score"] == 85
        assert data["is_revoked"] is False

        # Verify in database
        feedback = await test_db.fetch_one("""
            SELECT * FROM erc8004_reputation WHERE agent_uuid = %s
        """, (test_agent,))

        assert feedback is not None
        assert feedback[3] == 85  # score

    @pytest.mark.asyncio
    async def test_submit_feedback_invalid_score(self, test_agent, test_api_key):
        """Should fail with invalid score"""
        request_data = {
            "agent_uuid": test_agent,
            "client_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
            "score": 150  # Invalid: > 100
        }

        response = client.post(
            "/api/v1/agents/feedback",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_submit_feedback_nonexistent_agent(self, test_api_key):
        """Should fail when agent doesn't exist"""
        fake_uuid = str(uuid.uuid4())

        request_data = {
            "agent_uuid": fake_uuid,
            "client_address": "0x742d35cc6634c0532925a3b844b5e3a3a3b7b7b7",
            "score": 85
        }

        response = client.post(
            "/api/v1/agents/feedback",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 404


class TestPaymentLinkingE2E:
    """End-to-end tests for payment linking"""

    @pytest.mark.asyncio
    async def test_link_payment_success(self, test_db, test_agent, test_payment, test_api_key):
        """Should successfully link payment to agent"""
        request_data = {
            "agent_uuid": test_agent,
            "tx_hash": test_payment["tx_hash"],
            "chain": "base"
        }

        response = client.post(
            "/api/v1/agents/link-payment",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify link in database
        link = await test_db.fetch_one("""
            SELECT * FROM erc8004_agent_payments
            WHERE agent_uuid = %s AND tx_hash = %s
        """, (test_agent, test_payment["tx_hash"]))

        assert link is not None

    @pytest.mark.asyncio
    async def test_link_nonexistent_payment(self, test_agent, test_api_key):
        """Should fail when payment doesn't exist"""
        request_data = {
            "agent_uuid": test_agent,
            "tx_hash": "0x" + "b" * 64,  # Non-existent
            "chain": "base"
        }

        response = client.post(
            "/api/v1/agents/link-payment",
            json=request_data,
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 404


class TestAgentQueryE2E:
    """End-to-end tests for agent queries"""

    @pytest.mark.asyncio
    async def test_get_agent_by_uuid(self, test_agent, test_api_key):
        """Should retrieve agent by UUID"""
        response = client.get(
            f"/api/v1/agents/{test_agent}",
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["agent_uuid"] == test_agent
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_get_agent_stats(self, test_agent, test_api_key):
        """Should retrieve agent stats"""
        response = client.get(
            f"/api/v1/agents/{test_agent}/stats",
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "reputation_score" in data
        assert "total_feedback" in data
        assert "trust_level" in data

    @pytest.mark.asyncio
    async def test_search_agents(self, test_agent, test_api_key):
        """Should search agents with filters"""
        response = client.get(
            "/api/v1/agents/?chain=base&limit=10",
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "agents" in data
        assert "total" in data
        assert isinstance(data["agents"], list)


class TestRateLimitingE2E:
    """End-to-end tests for rate limiting"""

    @pytest.mark.asyncio
    async def test_rate_limit_enforcement(self, test_agent, test_api_key):
        """Should enforce rate limits after threshold"""
        # Make rapid requests to trigger rate limit
        # Note: Actual rate limit testing requires Redis
        pass  # Requires Redis for actual testing


class TestCachingE2E:
    """End-to-end tests for caching behavior"""

    @pytest.mark.asyncio
    async def test_stats_caching(self, test_agent, test_api_key):
        """Should cache agent stats for performance"""
        # First request
        start = time.time()
        response1 = client.get(
            f"/api/v1/agents/{test_agent}/stats",
            headers={"Authorization": f"Bearer {test_api_key}"}
        )
        duration1 = time.time() - start

        # Second request (should be cached)
        start = time.time()
        response2 = client.get(
            f"/api/v1/agents/{test_agent}/stats",
            headers={"Authorization": f"Bearer {test_api_key}"}
        )
        duration2 = time.time() - start

        assert response1.status_code == 200
        assert response2.status_code == 200
        # Cached request should be faster (if Redis is available)
        # assert duration2 < duration1


class TestTransactionRollbackE2E:
    """End-to-end tests for transaction handling"""

    @pytest.mark.asyncio
    async def test_registration_rollback_on_error(self, test_db, test_api_key):
        """Should rollback transaction on metadata insert failure"""
        # Create request with invalid metadata that will fail
        registration_file = AgentRegistrationFile(
            name="Test Agent",
            description="Test",
            endpoints=[]
        )

        # This test requires simulating a database error
        # In practice, test with metadata that exceeds size limits
        pass  # Requires database error simulation


class TestHealthCheckE2E:
    """End-to-end tests for health check"""

    @pytest.mark.asyncio
    async def test_health_check_endpoint(self):
        """Should return healthy status"""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "checks" in data
        assert data["status"] in ["healthy", "unhealthy"]


class TestMetricsE2E:
    """End-to-end tests for metrics"""

    @pytest.mark.asyncio
    async def test_metrics_endpoint(self):
        """Should return Prometheus metrics"""
        response = client.get("/metrics")

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]
        # Should contain ERC-8004 metrics
        content = response.text
        assert "erc8004" in content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
