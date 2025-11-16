"""
Payment cycle detection and penalty system
Game theory enforcement for circular dependencies
"""

from typing import List, Dict, Optional, Tuple
from uuid import UUID
import logging
from datetime import datetime

from config.database_pool import get_db
from .monitoring import logger


class PaymentCycleDetector:
    """Detects and penalizes circular payment dependencies"""

    @staticmethod
    async def record_forward(
        root_tx_hash: str,
        source_agent: str,
        target_agent: str,
        hop_number: int
    ) -> Dict:
        """Record a payment forward in the chain"""
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                INSERT INTO erc8004_payment_chains (
                    root_tx_hash, agent_uuid, forwarded_to_agent, hop_number
                ) VALUES ($1, $2, $3, $4)
                RETURNING id, detected_cycle, cycle_depth
            """, root_tx_hash, source_agent, target_agent, hop_number)

            cycle_check = await conn.fetchrow("""
                SELECT * FROM detect_payment_cycle($1)
            """, root_tx_hash)

            if cycle_check['has_cycle']:
                await conn.execute("""
                    UPDATE erc8004_payment_chains
                    SET detected_cycle = TRUE, cycle_depth = $2
                    WHERE root_tx_hash = $1
                """, root_tx_hash, cycle_check['cycle_depth'])

                logger.warning(
                    "payment_cycle_detected",
                    root_tx=root_tx_hash,
                    cycle_depth=cycle_check['cycle_depth'],
                    cycle_agents=cycle_check['cycle_agents']
                )

                return {
                    "forward_recorded": True,
                    "cycle_detected": True,
                    "cycle_depth": cycle_check['cycle_depth'],
                    "cycle_agents": cycle_check['cycle_agents']
                }

            return {
                "forward_recorded": True,
                "cycle_detected": False
            }

    @staticmethod
    async def verify_forward_safe(
        root_tx_hash: str,
        source_agent: str,
        target_agent: str
    ) -> Dict:
        """Check if a forward would create a cycle before executing"""
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT * FROM verify_forward_safe($1, $2, $3)
            """, root_tx_hash, source_agent, target_agent)

            return {
                "safe": result['safe'],
                "reason": result['reason'],
                "cycle_agents": result['existing_cycle_agents'] if result['existing_cycle_agents'] else []
            }

    @staticmethod
    async def apply_cycle_penalties(
        root_tx_hash: str,
        cycle_agents: List[str],
        cycle_depth: int
    ) -> Dict:
        """
        Apply game-theoretic penalties to cycle participants

        Nash equilibrium enforcement:
        - Root initiator: 2x reputation penalty + stake slash
        - Participants: 1x reputation penalty + stake slash
        - Stake slash: 10-50% based on violation severity
        """
        pool = await get_db()
        penalties_applied = []

        async with pool.acquire() as conn:
            for i, agent_uuid in enumerate(cycle_agents):
                is_root = i == 0
                multiplier = 2.0 if is_root else 1.0

                base_penalty = min(30, 10 * cycle_depth)
                penalty_points = int(base_penalty * multiplier)
                penalty_score = max(0, 100 - penalty_points)

                # Apply reputation penalty
                await conn.execute("""
                    INSERT INTO erc8004_reputation (
                        agent_uuid, client_address, score,
                        tag1, tag2, chain, tx_hash
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                    agent_uuid,
                    "0x0000000000000000000000000000000000000000",
                    penalty_score,
                    "payment_cycle",
                    "trust_violation",
                    "base",
                    root_tx_hash
                )

                # Apply stake slash (Nash equilibrium enforcement)
                slash_result = await conn.fetchrow("""
                    SELECT slash_stake_for_violation($1, $2) as slashed_amount
                """, agent_uuid, cycle_depth)

                slashed_amount = slash_result['slashed_amount'] if slash_result else 0

                penalties_applied.append({
                    "agent_uuid": agent_uuid,
                    "is_root_initiator": is_root,
                    "penalty_score": penalty_score,
                    "penalty_points": penalty_points,
                    "slashed_stake_usdc": float(slashed_amount) if slashed_amount else 0
                })

                logger.info(
                    "cycle_penalty_applied",
                    agent_uuid=agent_uuid,
                    is_root=is_root,
                    penalty_points=penalty_points,
                    slashed_usdc=slashed_amount,
                    root_tx=root_tx_hash
                )

        return {
            "penalties_applied": len(penalties_applied),
            "cycle_depth": cycle_depth,
            "details": penalties_applied
        }

    @staticmethod
    async def reward_honest_forward(
        agent_uuid: str,
        tx_hash: str,
        amount_usdc: float
    ) -> Dict:
        """
        Reward agents for honest forwarding without creating cycles

        Cooperation incentive: Agents who forward properly get reputation boost
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            reward_points = min(10, int(amount_usdc / 10))

            await conn.execute("""
                INSERT INTO erc8004_cooperation_rewards (
                    agent_uuid, reward_type, reward_points, tx_hash
                ) VALUES ($1, 'honest_forward', $2, $3)
            """, agent_uuid, reward_points, tx_hash)

            logger.info(
                "honest_forward_rewarded",
                agent_uuid=agent_uuid,
                reward_points=reward_points,
                tx=tx_hash
            )

            return {
                "rewarded": True,
                "reward_points": reward_points,
                "agent_uuid": agent_uuid
            }

    @staticmethod
    async def report_cycle_for_reward(
        reporter_uuid: str,
        root_tx_hash: str,
        cycle_agents: List[str]
    ) -> Dict:
        """
        Reward agents who report cycles (mechanism design incentive)

        Encourages whistleblowing and network health monitoring
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            if reporter_uuid in cycle_agents:
                return {"rewarded": False, "reason": "reporter_in_cycle"}

            reward_points = len(cycle_agents) * 15

            await conn.execute("""
                INSERT INTO erc8004_cooperation_rewards (
                    agent_uuid, reward_type, reward_points, tx_hash,
                    metadata
                ) VALUES ($1, 'cycle_report', $2, $3, $4)
            """, reporter_uuid, reward_points, root_tx_hash,
                 f'{{"cycle_depth": {len(cycle_agents)}}}'
            )

            logger.info(
                "cycle_report_rewarded",
                reporter=reporter_uuid,
                reward_points=reward_points,
                cycle_size=len(cycle_agents)
            )

            return {
                "rewarded": True,
                "reward_points": reward_points,
                "reporter_uuid": reporter_uuid
            }

    @staticmethod
    async def get_agent_cycle_violations(agent_uuid: str) -> int:
        """Get count of cycle violations for an agent"""
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT COUNT(*) as violations
                FROM erc8004_reputation
                WHERE agent_uuid = $1
                AND tag1 = 'payment_cycle'
                AND is_revoked = FALSE
            """, agent_uuid)

            return result['violations'] if result else 0

    @staticmethod
    async def get_cycle_history(
        root_tx_hash: Optional[str] = None,
        agent_uuid: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """Get cycle detection history"""
        pool = await get_db()

        async with pool.acquire() as conn:
            if root_tx_hash:
                results = await conn.fetch("""
                    SELECT * FROM erc8004_payment_chains
                    WHERE root_tx_hash = $1
                    ORDER BY hop_number ASC
                """, root_tx_hash)
            elif agent_uuid:
                results = await conn.fetch("""
                    SELECT * FROM erc8004_payment_chains
                    WHERE agent_uuid = $1 OR forwarded_to_agent = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                """, agent_uuid, limit)
            else:
                results = await conn.fetch("""
                    SELECT * FROM erc8004_payment_chains
                    WHERE detected_cycle = TRUE
                    ORDER BY created_at DESC
                    LIMIT $1
                """, limit)

            return [dict(row) for row in results]
