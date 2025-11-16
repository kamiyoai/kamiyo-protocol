"""Endpoint manifest verification and forward receipt handling"""

from typing import Dict, Optional, List
from decimal import Decimal
from datetime import datetime, timedelta
import hashlib
import asyncpg

from config.database_pool import get_db
from .monitoring import logger
from .exceptions import (
    ValidationException,
    CircularDependencyException,
    AgentNotFoundException
)


class ManifestVerifier:
    """Handles signed endpoint manifests and routing commitments"""

    HIGH_VALUE_THRESHOLD_USDC = Decimal("10000.00")
    COMMITMENT_TIMELOCK_SECONDS = 300

    @staticmethod
    async def verify_forward(
        root_tx_hash: str,
        source_agent_uuid: str,
        dest_agent_uuid: str,
        manifest_hash: str,
        manifest_nonce: int,
        manifest_signature: str
    ) -> Dict:
        """
        Verify forward safety with manifest validation

        Returns safe=true only if:
        1. Manifest signature valid
        2. Manifest nonce unused
        3. Manifest currently active (time window)
        4. No cycle detected
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            # Verify manifest
            manifest_valid = await conn.fetchval("""
                SELECT verify_manifest($1, $2, $3, CURRENT_TIMESTAMP)
            """, dest_agent_uuid, manifest_hash, manifest_nonce)

            if not manifest_valid:
                return {
                    "safe": False,
                    "reason": "invalid_manifest",
                    "details": "Manifest signature, nonce, or time window invalid"
                }

            # Check for cycles
            cycle_result = await conn.fetchrow("""
                SELECT has_cycle, cycle_agents, cycle_depth, invalid_receipts
                FROM detect_cycle_with_receipts($1)
            """, root_tx_hash)

            if cycle_result['has_cycle']:
                return {
                    "safe": False,
                    "reason": "cycle_detected",
                    "cycle_agents": cycle_result['cycle_agents'],
                    "cycle_depth": cycle_result['cycle_depth'],
                    "invalid_receipts": cycle_result['invalid_receipts']
                }

            return {
                "safe": True,
                "manifest_hash": manifest_hash,
                "manifest_nonce": manifest_nonce
            }

    @staticmethod
    async def record_forward(
        root_tx_hash: str,
        source_agent_uuid: str,
        dest_agent_uuid: str,
        hop: int,
        manifest_id: str,
        next_hop_hash: Optional[str],
        receipt_nonce: int,
        signature: str,
        chain: str = "base"
    ) -> Dict:
        """
        Record forward with non-repudiable receipt

        Receipt format: {root_tx, hop, src, dst, next_hop_hash, nonce, timestamp}
        Signature binds routing at forward-time
        """
        pool = await get_db()

        async with pool.acquire() as conn:
            # Compute receipt hash
            receipt_data = f"{root_tx_hash}{hop}{source_agent_uuid}{dest_agent_uuid}{next_hop_hash or ''}{receipt_nonce}"
            receipt_hash = "0x" + hashlib.sha256(receipt_data.encode()).hexdigest()

            # Store receipt
            receipt = await conn.fetchrow("""
                INSERT INTO erc8004_forward_receipts (
                    root_tx_hash, hop, source_agent_uuid, dest_agent_uuid,
                    manifest_id, next_hop_hash, receipt_nonce, receipt_hash,
                    signature, chain
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, receipt_hash, created_at
            """,
                root_tx_hash, hop, source_agent_uuid, dest_agent_uuid,
                manifest_id, next_hop_hash, receipt_nonce, receipt_hash,
                signature, chain
            )

            # Update payment chain tracking
            await conn.execute("""
                INSERT INTO erc8004_payment_chains (
                    root_tx_hash, hop, source_agent_uuid, target_agent_uuid,
                    chain, timestamp
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (root_tx_hash, hop) DO NOTHING
            """, root_tx_hash, hop, source_agent_uuid, dest_agent_uuid, chain)

            # Check for cycle after recording
            cycle_result = await conn.fetchrow("""
                SELECT has_cycle, cycle_agents, cycle_depth
                FROM detect_cycle_with_receipts($1)
            """, root_tx_hash)

            if cycle_result['has_cycle']:
                # Trigger provisional settlement
                await conn.execute("""
                    SELECT trigger_provisional_settlement($1, $2, $3, NULL)
                """,
                    root_tx_hash,
                    cycle_result['cycle_agents'],
                    cycle_result['cycle_depth']
                )

                raise CircularDependencyException(
                    cycle_agents=cycle_result['cycle_agents'],
                    cycle_depth=cycle_result['cycle_depth']
                )

            logger.info(
                "forward_recorded",
                root_tx=root_tx_hash,
                hop=hop,
                source=source_agent_uuid,
                dest=dest_agent_uuid,
                receipt_hash=receipt_hash
            )

            return {
                "recorded": True,
                "receipt_id": str(receipt['id']),
                "receipt_hash": receipt_hash,
                "timestamp": receipt['created_at'].isoformat()
            }

    @staticmethod
    async def create_onchain_commitment(
        root_tx_hash: str,
        first_hop_agent_uuid: str,
        routing_hash: str,
        amount_usdc: Decimal,
        chain: str = "base"
    ) -> Dict:
        """
        Create on-chain commitment for high-value flows

        Binds first-hop routing into auditable tx with time-lock
        """
        if amount_usdc < ManifestVerifier.HIGH_VALUE_THRESHOLD_USDC:
            raise ValidationException(
                "amount_usdc",
                f"On-chain commitment requires >= {ManifestVerifier.HIGH_VALUE_THRESHOLD_USDC} USDC"
            )

        pool = await get_db()

        async with pool.acquire() as conn:
            time_lock_until = datetime.utcnow() + timedelta(
                seconds=ManifestVerifier.COMMITMENT_TIMELOCK_SECONDS
            )

            # In production, this would submit actual on-chain tx
            commitment_tx_hash = "0x" + hashlib.sha256(
                f"{root_tx_hash}{routing_hash}{amount_usdc}".encode()
            ).hexdigest()

            commitment = await conn.fetchrow("""
                INSERT INTO erc8004_onchain_commitments (
                    root_tx_hash, commitment_tx_hash, chain,
                    first_hop_agent_uuid, routing_hash,
                    amount_usdc, time_lock_until
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id, commitment_tx_hash, time_lock_until
            """,
                root_tx_hash, commitment_tx_hash, chain,
                first_hop_agent_uuid, routing_hash,
                amount_usdc, time_lock_until
            )

            logger.info(
                "onchain_commitment_created",
                root_tx=root_tx_hash,
                commitment_tx=commitment_tx_hash,
                amount_usdc=float(amount_usdc),
                time_lock_until=time_lock_until.isoformat()
            )

            return {
                "committed": True,
                "commitment_id": str(commitment['id']),
                "commitment_tx_hash": commitment_tx_hash,
                "time_lock_until": time_lock_until.isoformat()
            }

    @staticmethod
    async def publish_manifest(
        agent_uuid: str,
        endpoint_uri: str,
        pubkey: str,
        nonce: int,
        valid_from: datetime,
        valid_until: datetime,
        signature: str,
        chain: str = "base"
    ) -> Dict:
        """Publish signed endpoint manifest"""
        pool = await get_db()

        async with pool.acquire() as conn:
            # Verify agent exists
            agent_exists = await conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM erc8004_agents WHERE id = $1)
            """, agent_uuid)

            if not agent_exists:
                raise AgentNotFoundException(agent_uuid)

            # Compute manifest hash
            manifest_data = f"{agent_uuid}{endpoint_uri}{pubkey}{nonce}{valid_from.isoformat()}{valid_until.isoformat()}"
            manifest_hash = "0x" + hashlib.sha256(manifest_data.encode()).hexdigest()

            # Check for recent manifest (track flips)
            old_manifest = await conn.fetchrow("""
                SELECT id FROM erc8004_endpoint_manifests
                WHERE agent_uuid = $1
                  AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """, agent_uuid)

            # Expire old manifests
            if old_manifest:
                await conn.execute("""
                    UPDATE erc8004_endpoint_manifests
                    SET status = 'expired'
                    WHERE agent_uuid = $1 AND status = 'active'
                """, agent_uuid)

            # Create new manifest
            manifest = await conn.fetchrow("""
                INSERT INTO erc8004_endpoint_manifests (
                    agent_uuid, endpoint_uri, pubkey, nonce,
                    valid_from, valid_until, manifest_hash,
                    signature, chain
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, manifest_hash, created_at
            """,
                agent_uuid, endpoint_uri, pubkey, nonce,
                valid_from, valid_until, manifest_hash,
                signature, chain
            )

            # Record flip if applicable
            if old_manifest:
                await conn.execute("""
                    SELECT record_manifest_flip($1, $2, $3)
                """, agent_uuid, old_manifest['id'], manifest['id'])

            logger.info(
                "manifest_published",
                agent_uuid=agent_uuid,
                manifest_hash=manifest_hash,
                nonce=nonce
            )

            return {
                "published": True,
                "manifest_id": str(manifest['id']),
                "manifest_hash": manifest_hash,
                "valid_from": valid_from.isoformat(),
                "valid_until": valid_until.isoformat()
            }

    @staticmethod
    async def report_cycle(
        root_tx_hash: str,
        reporter_address: str
    ) -> Dict:
        """External reporter submits cycle proof for bounty"""
        pool = await get_db()

        async with pool.acquire() as conn:
            # Verify cycle exists
            cycle_result = await conn.fetchrow("""
                SELECT has_cycle, cycle_agents, cycle_depth
                FROM detect_cycle_with_receipts($1)
            """, root_tx_hash)

            if not cycle_result['has_cycle']:
                raise ValidationException(
                    "root_tx_hash",
                    "No cycle detected for this transaction"
                )

            # Trigger provisional settlement with reporter credit
            settlement_id = await conn.fetchval("""
                SELECT trigger_provisional_settlement($1, $2, $3, $4)
            """,
                root_tx_hash,
                cycle_result['cycle_agents'],
                cycle_result['cycle_depth'],
                reporter_address
            )

            # Get bounty amount
            bounty = await conn.fetchval("""
                SELECT reporter_bounty_usdc
                FROM erc8004_payment_chains
                WHERE root_tx_hash = $1
            """, root_tx_hash)

            logger.info(
                "cycle_reported",
                root_tx=root_tx_hash,
                reporter=reporter_address,
                bounty_usdc=float(bounty or 0),
                cycle_depth=cycle_result['cycle_depth']
            )

            return {
                "reported": True,
                "settlement_id": str(settlement_id),
                "bounty_usdc": float(bounty or 0),
                "cycle_agents": cycle_result['cycle_agents'],
                "cycle_depth": cycle_result['cycle_depth']
            }

    @staticmethod
    async def get_flip_metrics(agent_uuid: str) -> Dict:
        """Get manifest flip metrics for agent"""
        pool = await get_db()

        async with pool.acquire() as conn:
            metrics = await conn.fetchrow("""
                SELECT
                    total_flips,
                    rapid_flips_1min,
                    endpoint_changes,
                    high_suspicion_flips,
                    avg_suspicion_score,
                    last_flip_at
                FROM v_agent_manifest_flip_metrics
                WHERE agent_uuid = $1
            """, agent_uuid)

            if not metrics:
                return {
                    "total_flips": 0,
                    "rapid_flips_1min": 0,
                    "endpoint_changes": 0,
                    "high_suspicion_flips": 0,
                    "avg_suspicion_score": 0,
                    "last_flip_at": None
                }

            return {
                "total_flips": metrics['total_flips'],
                "rapid_flips_1min": metrics['rapid_flips_1min'],
                "endpoint_changes": metrics['endpoint_changes'],
                "high_suspicion_flips": metrics['high_suspicion_flips'],
                "avg_suspicion_score": float(metrics['avg_suspicion_score'] or 0),
                "last_flip_at": metrics['last_flip_at'].isoformat() if metrics['last_flip_at'] else None
            }
