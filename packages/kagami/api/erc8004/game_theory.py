"""
Game Theory Mechanisms for ERC-8004
Nash equilibrium enforcement, staking, rewards, and Sybil resistance
"""

from typing import Dict, Optional
from decimal import Decimal
from datetime import datetime, timedelta

from config.database_pool import get_db
from .monitoring import logger


class GameTheoryEngine:
    """
    Implements game-theoretic mechanisms for agent network stability

    Core mechanisms:
    1. Nash Equilibrium: Stake-weighted penalties make defection costly
    2. Cooperation Rewards: Honest behavior economically rational
    3. Sybil Resistance: Network topology analysis
    4. Reputation Decay: Encourages continued participation
    """

    @staticmethod
    async def stake_agent(
        agent_uuid: str,
        amount_usdc: Decimal,
        lock_duration_days: int = 30
    ) -> Dict:
        """
        Stake USDC to increase trust level and reduce penalties

        Higher stake = higher trust tier = access to premium features
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            locked_until = datetime.utcnow() + timedelta(days=lock_duration_days)

            existing = await conn.fetchrow("""
                SELECT staked_amount_usdc FROM erc8004_agent_stakes
                WHERE agent_uuid = $1
            """, agent_uuid)

            if existing:
                new_total = existing['staked_amount_usdc'] + amount_usdc
                await conn.execute("""
                    UPDATE erc8004_agent_stakes
                    SET staked_amount_usdc = $2,
                        stake_tier = calculate_stake_tier($2),
                        locked_until = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE agent_uuid = $1
                """, agent_uuid, new_total, locked_until)
            else:
                await conn.execute("""
                    INSERT INTO erc8004_agent_stakes (
                        agent_uuid, staked_amount_usdc, stake_tier, locked_until
                    ) VALUES ($1, $2, calculate_stake_tier($2), $3)
                """, agent_uuid, amount_usdc, locked_until)
                new_total = amount_usdc

            tier_result = await conn.fetchrow("""
                SELECT calculate_stake_tier($1) as tier
            """, new_total)

            logger.info(
                "agent_staked",
                agent_uuid=agent_uuid,
                amount=float(amount_usdc),
                new_total=float(new_total),
                tier=tier_result['tier']
            )

            return {
                "staked": True,
                "total_stake_usdc": float(new_total),
                "stake_tier": tier_result['tier'],
                "locked_until": locked_until.isoformat()
            }

    @staticmethod
    async def unstake_agent(
        agent_uuid: str,
        amount_usdc: Decimal
    ) -> Dict:
        """
        Unstake USDC (only if lock period expired)

        Slashed amounts cannot be unstaked (Nash equilibrium enforcement)
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            stake = await conn.fetchrow("""
                SELECT staked_amount_usdc, slashed_amount_usdc, locked_until
                FROM erc8004_agent_stakes
                WHERE agent_uuid = $1
            """, agent_uuid)

            if not stake:
                return {"unstaked": False, "reason": "no_stake"}

            if stake['locked_until'] and stake['locked_until'] > datetime.utcnow():
                return {
                    "unstaked": False,
                    "reason": "still_locked",
                    "locked_until": stake['locked_until'].isoformat()
                }

            available = stake['staked_amount_usdc'] - stake['slashed_amount_usdc']

            if amount_usdc > available:
                return {
                    "unstaked": False,
                    "reason": "insufficient_available",
                    "available_usdc": float(available)
                }

            new_total = stake['staked_amount_usdc'] - amount_usdc

            await conn.execute("""
                UPDATE erc8004_agent_stakes
                SET staked_amount_usdc = $2,
                    stake_tier = calculate_stake_tier($2),
                    updated_at = CURRENT_TIMESTAMP
                WHERE agent_uuid = $1
            """, agent_uuid, new_total)

            logger.info(
                "agent_unstaked",
                agent_uuid=agent_uuid,
                amount=float(amount_usdc),
                remaining=float(new_total)
            )

            return {
                "unstaked": True,
                "amount_usdc": float(amount_usdc),
                "remaining_stake_usdc": float(new_total)
            }

    @staticmethod
    async def get_sybil_score(agent_uuid: str) -> Dict:
        """
        Calculate Sybil resistance score based on network topology

        Score components:
        - Unique counterparties (40%): More diverse = less Sybil risk
        - Time span (30%): Longer history = more legitimate
        - Transaction amounts (30%): Higher value = more legitimate
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT calculate_sybil_resistance_score($1) as score
            """, agent_uuid)

            score = float(result['score']) if result else 0

            interpretation = (
                "high_risk" if score < 20 else
                "medium_risk" if score < 40 else
                "low_risk" if score < 70 else
                "trusted"
            )

            return {
                "agent_uuid": agent_uuid,
                "sybil_resistance_score": score,
                "risk_level": interpretation
            }

    @staticmethod
    async def apply_decay_and_recovery(agent_uuid: str) -> Dict:
        """
        Apply reputation decay for inactive agents

        Mechanism: Agents lose reputation if inactive >30 days
        Recovery: New positive feedback restores reputation over time
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            agent = await conn.fetchrow("""
                SELECT last_activity_at FROM erc8004_agents
                WHERE id = $1
            """, agent_uuid)

            if not agent:
                return {"applied": False, "reason": "agent_not_found"}

            days_inactive = (datetime.utcnow() - agent['last_activity_at']).days

            if days_inactive < 30:
                return {
                    "applied": False,
                    "reason": "still_active",
                    "days_inactive": days_inactive
                }

            await conn.execute("""
                SELECT apply_reputation_decay()
            """)

            logger.info(
                "reputation_decay_applied",
                agent_uuid=agent_uuid,
                days_inactive=days_inactive
            )

            return {
                "applied": True,
                "days_inactive": days_inactive,
                "reason": "inactivity_threshold_exceeded"
            }

    @staticmethod
    async def get_cooperation_rewards(agent_uuid: str) -> Dict:
        """Get total cooperation rewards for agent"""
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT
                    SUM(reward_points) as total_points,
                    SUM(reward_amount_usdc) as total_usdc,
                    COUNT(*) as reward_count,
                    COUNT(DISTINCT reward_type) as unique_reward_types
                FROM erc8004_cooperation_rewards
                WHERE agent_uuid = $1
            """, agent_uuid)

            return {
                "agent_uuid": agent_uuid,
                "total_reward_points": int(result['total_points'] or 0),
                "total_reward_usdc": float(result['total_usdc'] or 0),
                "reward_count": int(result['reward_count'] or 0),
                "unique_reward_types": int(result['unique_reward_types'] or 0)
            }

    @staticmethod
    async def get_game_theory_metrics(agent_uuid: str) -> Dict:
        """
        Get comprehensive game theory metrics for agent

        Returns full economic profile for decision-making
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT
                    staked_amount,
                    slashed_amount,
                    stake_tier,
                    cooperation_score,
                    sybil_resistance_score,
                    cycle_violations,
                    trust_level
                FROM v_erc8004_agent_stats
                WHERE agent_uuid = $1
            """, agent_uuid)

            if not result:
                return {"found": False}

            return {
                "agent_uuid": agent_uuid,
                "stake": {
                    "total_usdc": float(result['staked_amount'] or 0),
                    "slashed_usdc": float(result['slashed_amount'] or 0),
                    "tier": result['stake_tier']
                },
                "reputation": {
                    "trust_level": result['trust_level'],
                    "cycle_violations": int(result['cycle_violations'] or 0)
                },
                "cooperation": {
                    "score": int(result['cooperation_score'] or 0)
                },
                "sybil_resistance": {
                    "score": float(result['sybil_resistance_score'] or 0),
                    "risk_level": (
                        "high_risk" if result['sybil_resistance_score'] < 20 else
                        "medium_risk" if result['sybil_resistance_score'] < 40 else
                        "low_risk" if result['sybil_resistance_score'] < 70 else
                        "trusted"
                    )
                }
            }
