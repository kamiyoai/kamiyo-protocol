"""
ERC-8004 Load Testing Script
Tests system performance under realistic load

Requirements:
pip install locust

Usage:
locust -f load_test.py --host=http://localhost:8000
"""

from locust import HttpUser, task, between
import random
import uuid
import json


class ERC8004User(HttpUser):
    """
    Simulates user interacting with ERC-8004 API

    Wait time between requests: 1-5 seconds
    """
    wait_time = between(1, 5)

    def on_start(self):
        """Setup test data"""
        self.api_key = "test_key_for_load_testing"
        self.test_agents = []
        self.chains = ["base", "ethereum"]

    @task(3)
    def search_agents(self):
        """
        Search for agents (most common operation)

        Target: < 300ms response time
        """
        params = {
            "chain": random.choice(self.chains),
            "limit": 50,
            "status": "active"
        }

        with self.client.get(
            "/api/v1/agents/",
            params=params,
            headers={"Authorization": f"Bearer {self.api_key}"},
            catch_response=True,
            name="/api/v1/agents/ (search)"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if "agents" in data:
                    response.success()
                else:
                    response.failure("Missing agents in response")
            else:
                response.failure(f"Got status code {response.status_code}")

    @task(2)
    def get_agent_stats(self):
        """
        Get agent statistics (common operation)

        Target: < 200ms with cache, < 500ms without
        """
        if not self.test_agents:
            # Use a fixed UUID for testing
            agent_uuid = "00000000-0000-0000-0000-000000000001"
        else:
            agent_uuid = random.choice(self.test_agents)

        with self.client.get(
            f"/api/v1/agents/{agent_uuid}/stats",
            headers={"Authorization": f"Bearer {self.api_key}"},
            catch_response=True,
            name="/api/v1/agents/{uuid}/stats"
        ) as response:
            if response.status_code in [200, 404]:
                # 404 is acceptable for test UUIDs
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")

    @task(1)
    def register_agent(self):
        """
        Register new agent (write operation)

        Target: < 500ms
        """
        agent_uuid = str(uuid.uuid4())

        registration_data = {
            "owner_address": f"0x{random.randbytes(20).hex()}",
            "chain": random.choice(self.chains),
            "registration_file": {
                "name": f"Load Test Agent {agent_uuid[:8]}",
                "description": "Agent created during load testing",
                "endpoints": [
                    {
                        "name": "MCP",
                        "endpoint": f"https://agent-{agent_uuid[:8]}.test.com/mcp",
                        "version": "1.0"
                    }
                ],
                "supportedTrust": ["reputation"]
            },
            "metadata": {
                "test": "load_test",
                "timestamp": "2025-01-14"
            }
        }

        with self.client.post(
            "/api/v1/agents/register",
            json=registration_data,
            headers={"Authorization": f"Bearer {self.api_key}"},
            catch_response=True,
            name="/api/v1/agents/register"
        ) as response:
            if response.status_code == 201:
                data = response.json()
                if "agent_uuid" in data:
                    self.test_agents.append(data["agent_uuid"])
                    response.success()
                else:
                    response.failure("Missing agent_uuid in response")
            elif response.status_code == 400:
                # Contract not configured is acceptable in test
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")

    @task(1)
    def submit_feedback(self):
        """
        Submit reputation feedback

        Target: < 300ms
        """
        if not self.test_agents:
            # Use a fixed UUID for testing
            agent_uuid = "00000000-0000-0000-0000-000000000001"
        else:
            agent_uuid = random.choice(self.test_agents)

        feedback_data = {
            "agent_uuid": agent_uuid,
            "client_address": f"0x{random.randbytes(20).hex()}",
            "score": random.randint(1, 100),
            "tag1": random.choice(["reliable", "fast", "accurate", "responsive"]),
            "tag2": random.choice(["payment", "service", "support", "delivery"])
        }

        with self.client.post(
            "/api/v1/agents/feedback",
            json=feedback_data,
            headers={"Authorization": f"Bearer {self.api_key}"},
            catch_response=True,
            name="/api/v1/agents/feedback"
        ) as response:
            if response.status_code in [201, 404]:
                # 404 is acceptable for test UUIDs
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")

    @task(5)
    def health_check(self):
        """
        Health check endpoint (should not be rate limited)

        Target: < 100ms
        """
        with self.client.get(
            "/api/v1/agents/health",
            catch_response=True,
            name="/api/v1/agents/health"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if "status" in data:
                    response.success()
                else:
                    response.failure("Missing status in response")
            else:
                response.failure(f"Got status code {response.status_code}")


# Performance test scenarios

class BurstTrafficUser(HttpUser):
    """
    Simulates burst traffic (100 users, 5 seconds)

    Tests system under sudden load spike
    """
    wait_time = between(0.1, 1)

    @task
    def burst_search(self):
        self.client.get(
            "/api/v1/agents/",
            params={"chain": "base", "limit": 20},
            name="burst_search"
        )


class SustainedLoadUser(HttpUser):
    """
    Simulates sustained load (500 users, 1 hour)

    Tests system stability over time
    """
    wait_time = between(2, 10)

    @task(5)
    def sustained_search(self):
        self.client.get("/api/v1/agents/", params={"limit": 50})

    @task(1)
    def sustained_register(self):
        self.client.post(
            "/api/v1/agents/register",
            json={
                "owner_address": f"0x{random.randbytes(20).hex()}",
                "chain": "base",
                "registration_file": {
                    "name": "Test Agent",
                    "description": "Test",
                    "endpoints": []
                }
            }
        )
