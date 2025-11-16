"""
ERC-8004 Integration with x402 Payment System
Automatic reputation tracking for agent payments
"""

import logging
from typing import Optional
from decimal import Decimal
from datetime import datetime

from database import get_db

logger = logging.getLogger(__name__)


class AgentReputationTracker:
    """
    Tracks agent payment reliability and submits reputation feedback
    """

    def __init__(self):
        self.db = get_db()

    async def record_payment_success(
        self,
        agent_uuid: str,
        tx_hash: str,
        chain: str,
        amount_usdc: Decimal,
        endpoint: str
    ) -> bool:
        """
        Record successful payment and update agent reputation

        Args:
            agent_uuid: Agent UUID
            tx_hash: Transaction hash
            chain: Blockchain network
            amount_usdc: Payment amount
            endpoint: API endpoint accessed

        Returns:
            bool: Success status
        """
        try:
            # Link payment to agent
            self.db.execute("""
                UPDATE x402_payments
                SET agent_id = %s
                WHERE tx_hash = %s AND chain = %s
            """, (agent_uuid, tx_hash, chain))

            # Record in agent payments table
            self.db.execute("""
                INSERT INTO erc8004_agent_payments (
                    agent_uuid, tx_hash, chain, amount_usdc,
                    status, endpoint, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tx_hash) DO NOTHING
            """, (
                agent_uuid,
                tx_hash,
                chain,
                amount_usdc,
                "verified",
                endpoint,
                datetime.utcnow()
            ))

            # Auto-submit positive reputation feedback
            await self._submit_auto_feedback(
                agent_uuid=agent_uuid,
                score=95,  # High score for successful payment
                tag1="payment_success",
                tag2=chain
            )

            logger.info(f"Recorded successful payment for agent {agent_uuid}")
            return True

        except Exception as e:
            logger.error(f"Error recording payment success: {e}")
            return False

    async def record_payment_failure(
        self,
        agent_uuid: str,
        tx_hash: str,
        chain: str,
        reason: str
    ) -> bool:
        """
        Record failed payment and update agent reputation

        Args:
            agent_uuid: Agent UUID
            tx_hash: Transaction hash
            chain: Blockchain network
            reason: Failure reason

        Returns:
            bool: Success status
        """
        try:
            # Record in agent payments table
            self.db.execute("""
                INSERT INTO erc8004_agent_payments (
                    agent_uuid, tx_hash, chain, amount_usdc,
                    status, endpoint, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tx_hash) DO NOTHING
            """, (
                agent_uuid,
                tx_hash,
                chain,
                Decimal("0"),
                "failed",
                reason,
                datetime.utcnow()
            ))

            # Submit negative reputation feedback
            await self._submit_auto_feedback(
                agent_uuid=agent_uuid,
                score=30,  # Low score for failed payment
                tag1="payment_failure",
                tag2=chain,
                file_uri=f"failure_reason:{reason}"
            )

            logger.info(f"Recorded failed payment for agent {agent_uuid}")
            return True

        except Exception as e:
            logger.error(f"Error recording payment failure: {e}")
            return False

    async def _submit_auto_feedback(
        self,
        agent_uuid: str,
        score: int,
        tag1: str,
        tag2: Optional[str] = None,
        file_uri: Optional[str] = None
    ) -> None:
        """
        Submit automatic reputation feedback

        Args:
            agent_uuid: Agent UUID
            score: Reputation score (0-100)
            tag1: Primary tag
            tag2: Secondary tag
            file_uri: Optional file URI
        """
        try:
            # Use KAMIYO system address as client
            system_address = "0x0000000000000000000000000000000000000001"

            self.db.execute("""
                INSERT INTO erc8004_reputation (
                    agent_uuid, client_address, score, tag1, tag2,
                    file_uri, is_revoked, chain, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                agent_uuid,
                system_address,
                score,
                tag1,
                tag2,
                file_uri,
                False,
                "base",
                datetime.utcnow()
            ))

            logger.debug(f"Auto-feedback submitted for agent {agent_uuid}: score={score}")

        except Exception as e:
            logger.error(f"Error submitting auto-feedback: {e}")

    async def get_agent_trust_score(self, agent_uuid: str) -> Optional[float]:
        """
        Calculate composite trust score for an agent

        Combines reputation score and payment success rate
        Returns: 0-100 composite score
        """
        try:
            result = self.db.fetch_one("""
                SELECT reputation_score, payment_success_rate
                FROM v_erc8004_agent_stats
                WHERE agent_uuid = %s
            """, (agent_uuid,))

            if not result:
                return None

            reputation_score = float(result[0] or 0)
            success_rate = float(result[1] or 0)

            # Weighted composite: 60% reputation, 40% success rate
            trust_score = (reputation_score * 0.6) + (success_rate * 0.4)

            return round(trust_score, 2)

        except Exception as e:
            logger.error(f"Error calculating trust score: {e}")
            return None

    async def is_agent_trusted(
        self,
        agent_uuid: str,
        min_trust_score: float = 70.0
    ) -> bool:
        """
        Check if agent meets minimum trust threshold

        Args:
            agent_uuid: Agent UUID
            min_trust_score: Minimum required trust score (default 70)

        Returns:
            bool: True if agent is trusted
        """
        trust_score = await self.get_agent_trust_score(agent_uuid)
        if trust_score is None:
            return False

        return trust_score >= min_trust_score


# Singleton instance
_reputation_tracker: Optional[AgentReputationTracker] = None


def get_reputation_tracker() -> AgentReputationTracker:
    """Get singleton reputation tracker instance"""
    global _reputation_tracker
    if _reputation_tracker is None:
        _reputation_tracker = AgentReputationTracker()
    return _reputation_tracker
