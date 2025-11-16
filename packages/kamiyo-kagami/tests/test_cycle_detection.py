"""
ERC-8004 Payment Cycle Detection Tests
Game theory enforcement for circular dependencies
"""

import pytest
import asyncio
from datetime import datetime
import uuid

from api.erc8004.cycle_detection import PaymentCycleDetector
from api.erc8004.routes import router
from fastapi.testclient import TestClient
from fastapi import FastAPI


app = FastAPI()
app.include_router(router)
client = TestClient(app)


class TestCycleDetection:
    """Test payment cycle detection logic"""

    @pytest.mark.asyncio
    async def test_simple_cycle_detection(self, test_db, test_agent):
        """Should detect A -> B -> A cycle"""
        tx_hash = "0x" + "a" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        await test_db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address
            ) VALUES ($1, $2, $3, $4, $5)
        """, agent_b, 2, "base", "0x" + "b" * 40, "0x" + "c" * 40)

        await PaymentCycleDetector.record_forward(tx_hash, agent_a, agent_b, 1)
        result = await PaymentCycleDetector.record_forward(tx_hash, agent_b, agent_a, 2)

        assert result['cycle_detected'] is True
        assert result['cycle_depth'] == 2
        assert len(result['cycle_agents']) == 2

    @pytest.mark.asyncio
    async def test_three_node_cycle(self, test_db, test_agent):
        """Should detect A -> B -> C -> A cycle"""
        tx_hash = "0x" + "b" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())
        agent_c = str(uuid.uuid4())

        for i, agent_id in enumerate([agent_b, agent_c], start=2):
            await test_db.execute("""
                INSERT INTO erc8004_agents (
                    id, agent_id, chain, registry_address, owner_address
                ) VALUES ($1, $2, $3, $4, $5)
            """, agent_id, i, "base", f"0x{i:040x}", f"0x{i+100:040x}")

        await PaymentCycleDetector.record_forward(tx_hash, agent_a, agent_b, 1)
        await PaymentCycleDetector.record_forward(tx_hash, agent_b, agent_c, 2)
        result = await PaymentCycleDetector.record_forward(tx_hash, agent_c, agent_a, 3)

        assert result['cycle_detected'] is True
        assert result['cycle_depth'] == 3

    @pytest.mark.asyncio
    async def test_verify_forward_safe(self, test_db, test_agent):
        """Should prevent cycle before it happens"""
        tx_hash = "0x" + "c" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        await test_db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address
            ) VALUES ($1, $2, $3, $4, $5)
        """, agent_b, 2, "base", "0x" + "b" * 40, "0x" + "c" * 40)

        await PaymentCycleDetector.record_forward(tx_hash, agent_a, agent_b, 1)

        result = await PaymentCycleDetector.verify_forward_safe(
            tx_hash, agent_b, agent_a
        )

        assert result['safe'] is False
        assert result['reason'] == 'would_create_cycle'

    @pytest.mark.asyncio
    async def test_verify_self_forward_blocked(self, test_agent):
        """Should block agent forwarding to itself"""
        tx_hash = "0x" + "d" * 64

        result = await PaymentCycleDetector.verify_forward_safe(
            tx_hash, test_agent, test_agent
        )

        assert result['safe'] is False
        assert result['reason'] == 'self_forward'

    @pytest.mark.asyncio
    async def test_penalty_application(self, test_db, test_agent):
        """Should apply penalties to cycle participants"""
        tx_hash = "0x" + "e" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        await test_db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address
            ) VALUES ($1, $2, $3, $4, $5)
        """, agent_b, 2, "base", "0x" + "b" * 40, "0x" + "c" * 40)

        cycle_agents = [agent_a, agent_b]
        cycle_depth = 2

        result = await PaymentCycleDetector.apply_cycle_penalties(
            tx_hash, cycle_agents, cycle_depth
        )

        assert result['penalties_applied'] == 2
        assert result['cycle_depth'] == 2

        violations_a = await PaymentCycleDetector.get_agent_cycle_violations(agent_a)
        violations_b = await PaymentCycleDetector.get_agent_cycle_violations(agent_b)

        assert violations_a == 1
        assert violations_b == 1

        penalty_a = result['details'][0]
        penalty_b = result['details'][1]
        assert penalty_a['is_root_initiator'] is True
        assert penalty_b['is_root_initiator'] is False
        assert penalty_a['penalty_points'] > penalty_b['penalty_points']

    @pytest.mark.asyncio
    async def test_trust_level_downgrade(self, test_db, test_agent):
        """Should downgrade trust level to 'untrusted' on cycle violation"""
        tx_hash = "0x" + "f" * 64
        agent_a = test_agent

        await PaymentCycleDetector.apply_cycle_penalties(tx_hash, [agent_a], 1)

        result = await test_db.fetchrow("""
            SELECT trust_level FROM v_erc8004_agent_stats
            WHERE agent_uuid = $1
        """, agent_a)

        assert result['trust_level'] == 'untrusted'

    @pytest.mark.asyncio
    async def test_no_false_positive_linear_chain(self, test_db, test_agent):
        """Should allow linear forwarding without false cycle detection"""
        tx_hash = "0x" + "1" * 64
        agents = [test_agent]

        for i in range(3):
            agent_id = str(uuid.uuid4())
            await test_db.execute("""
                INSERT INTO erc8004_agents (
                    id, agent_id, chain, registry_address, owner_address
                ) VALUES ($1, $2, $3, $4, $5)
            """, agent_id, i + 2, "base", f"0x{i+10:040x}", f"0x{i+20:040x}")
            agents.append(agent_id)

        for i in range(len(agents) - 1):
            result = await PaymentCycleDetector.record_forward(
                tx_hash, agents[i], agents[i+1], i+1
            )
            assert result['cycle_detected'] is False

    @pytest.mark.asyncio
    async def test_cycle_history_retrieval(self, test_db, test_agent):
        """Should retrieve cycle history correctly"""
        tx_hash = "0x" + "2" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        await test_db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address
            ) VALUES ($1, $2, $3, $4, $5)
        """, agent_b, 2, "base", "0x" + "b" * 40, "0x" + "c" * 40)

        await PaymentCycleDetector.record_forward(tx_hash, agent_a, agent_b, 1)
        await PaymentCycleDetector.record_forward(tx_hash, agent_b, agent_a, 2)

        history = await PaymentCycleDetector.get_cycle_history(root_tx_hash=tx_hash)

        assert len(history) == 2
        assert history[0]['detected_cycle'] is True or history[1]['detected_cycle'] is True


class TestCycleDetectionAPI:
    """Test cycle detection API endpoints"""

    @pytest.mark.asyncio
    async def test_verify_forward_endpoint(self, test_agent, test_api_key):
        """Should call verify-forward endpoint successfully"""
        tx_hash = "0x" + "3" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        response = client.post(
            "/api/v1/agents/verify-forward",
            params={
                "root_tx_hash": tx_hash,
                "source_agent": agent_a,
                "target_agent": agent_b
            },
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "safe" in data
        assert "recommendation" in data

    @pytest.mark.asyncio
    async def test_record_forward_endpoint(self, test_db, test_agent, test_api_key):
        """Should record forward via API"""
        tx_hash = "0x" + "4" * 64
        agent_a = test_agent
        agent_b = str(uuid.uuid4())

        await test_db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address
            ) VALUES ($1, $2, $3, $4, $5)
        """, agent_b, 2, "base", "0x" + "b" * 40, "0x" + "c" * 40)

        response = client.post(
            "/api/v1/agents/record-forward",
            params={
                "root_tx_hash": tx_hash,
                "source_agent": agent_a,
                "target_agent": agent_b,
                "hop_number": 1
            },
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data['forward_recorded'] is True

    @pytest.mark.asyncio
    async def test_cycle_history_endpoint(self, test_agent, test_api_key):
        """Should retrieve cycle history via API"""
        response = client.get(
            "/api/v1/agents/cycle-history",
            params={"agent_uuid": test_agent, "limit": 10},
            headers={"Authorization": f"Bearer {test_api_key}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "history" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
