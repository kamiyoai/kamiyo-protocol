"""Endpoint manifest verification and forward receipt handling"""

from typing import Dict, Optional, List
from decimal import Decimal
from datetime import datetime, timedelta
import asyncpg

from config.database_pool import get_db
from .monitoring import logger
from .signature_verification import SignatureVerifier
from .exceptions import (
    ValidationException,
    CircularDependencyException,
    AgentNotFoundException,
    DatabaseException
)


class ManifestVerifier:
    """Handles signed endpoint manifests and routing commitments"""

    HIGH_VALUE_THRESHOLD_USDC = Decimal("10000.00")
    COMMITMENT_TIMELOCK_SECONDS = 300
    MAX_HOP_DEPTH = 10
    MAX_RATIONAL_HOPS = 8
    MANIFEST_ACTIVATION_DELAY_SECONDS = 12  # ~1 block on Base L2

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

        try:
            async with pool.acquire() as conn:
                # Get manifest details for signature verification
                manifest = await conn.fetchrow("""
                    SELECT agent_uuid, endpoint_uri, pubkey, nonce,
                           valid_from, valid_until, manifest_hash, status
                    FROM erc8004_endpoint_manifests
                    WHERE agent_uuid = $1
                      AND manifest_hash = $2
                      AND nonce = $3
                """, dest_agent_uuid, manifest_hash, manifest_nonce)

                if not manifest:
                    return {
                        "safe": False,
                        "reason": "manifest_not_found",
                        "details": "No manifest found with given hash and nonce"
                    }

                # Get agent owner for signature verification
                agent_owner = await conn.fetchval("""
                    SELECT owner_address FROM erc8004_agents WHERE id = $1
                """, dest_agent_uuid)

                if not agent_owner:
                    return {
                        "safe": False,
                        "reason": "agent_not_found",
                        "details": "Destination agent not found"
                    }

                # Verify signature
                sig_valid = SignatureVerifier.verify_manifest_signature(
                    agent_uuid=str(manifest['agent_uuid']),
                    endpoint_uri=manifest['endpoint_uri'],
                    pubkey=manifest['pubkey'],
                    nonce=manifest['nonce'],
                    valid_from_iso=manifest['valid_from'].isoformat(),
                    valid_until_iso=manifest['valid_until'].isoformat(),
                    signature=manifest_signature,
                    expected_signer=agent_owner
                )

                if not sig_valid:
                    return {
                        "safe": False,
                        "reason": "invalid_signature",
                        "details": "Manifest signature verification failed"
                    }

                # Verify manifest status and time window
                manifest_valid = await conn.fetchval("""
                    SELECT verify_manifest($1, $2, $3, CURRENT_TIMESTAMP)
                """, dest_agent_uuid, manifest_hash, manifest_nonce)

                if not manifest_valid:
                    return {
                        "safe": False,
                        "reason": "manifest_expired",
                        "details": "Manifest expired or revoked"
                    }

                # Check for cycles
                cycle_result = await conn.fetchrow("""
                    SELECT has_cycle, cycle_agents, cycle_depth, invalid_receipts
                    FROM detect_cycle_with_receipts($1)
                """, root_tx_hash)

                if cycle_result and cycle_result['has_cycle']:
                    return {
                        "safe": False,
                        "reason": "cycle_detected",
                        "cycle_agents": cycle_result['cycle_agents'],
                        "cycle_depth": cycle_result['cycle_depth'],
                        "invalid_receipts": cycle_result['invalid_receipts']
                    }

                # Check for extraction loops (A→B→C→B)
                loop_result = await conn.fetchrow("""
                    SELECT has_loop, loop_agents, loop_hops, extracted_value_usdc
                    FROM detect_extraction_loop($1)
                """, root_tx_hash)

                if loop_result and loop_result['has_loop']:
                    return {
                        "safe": False,
                        "reason": "extraction_loop_detected",
                        "loop_agents": loop_result['loop_agents'],
                        "loop_hops": loop_result['loop_hops'],
                        "extracted_value_usdc": float(loop_result['extracted_value_usdc'])
                    }

                return {
                    "safe": True,
                    "manifest_hash": manifest_hash,
                    "manifest_nonce": manifest_nonce,
                    "verified_at": datetime.utcnow().isoformat()
                }

        except asyncpg.PostgresError as e:
            logger.error("verify_forward_db_error", error=str(e))
            raise DatabaseException("verify_forward", str(e))
        except Exception as e:
            logger.error("verify_forward_error", error=str(e))
            raise ValidationException("verify_forward", str(e))

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

        try:
            async with pool.acquire() as conn:
                # Compute receipt hash
                receipt_hash = SignatureVerifier.compute_receipt_hash(
                    root_tx_hash=root_tx_hash,
                    hop=hop,
                    source_agent_uuid=source_agent_uuid,
                    dest_agent_uuid=dest_agent_uuid,
                    next_hop_hash=next_hop_hash,
                    receipt_nonce=receipt_nonce
                )

                # Verify receipt signature
                dest_agent_owner = await conn.fetchval("""
                    SELECT owner_address FROM erc8004_agents WHERE id = $1
                """, dest_agent_uuid)

                if not dest_agent_owner:
                    raise AgentNotFoundException(dest_agent_uuid)

                sig_valid = SignatureVerifier.verify_receipt_signature(
                    root_tx_hash=root_tx_hash,
                    hop=hop,
                    source_agent_uuid=source_agent_uuid,
                    dest_agent_uuid=dest_agent_uuid,
                    next_hop_hash=next_hop_hash,
                    receipt_nonce=receipt_nonce,
                    signature=signature,
                    expected_signer=dest_agent_owner
                )

                if not sig_valid:
                    raise ValidationException(
                        "signature",
                        "Receipt signature verification failed"
                    )

                # Enforce hop limit
                if hop > ManifestVerifier.MAX_HOP_DEPTH:
                    raise ValidationException(
                        "hop",
                        f"Hop depth {hop} exceeds maximum {ManifestVerifier.MAX_HOP_DEPTH}"
                    )

                # Check stake availability (prevent amplification)
                stake_available = await conn.fetchval("""
                    SELECT check_stake_amplification($1, $2, $3)
                """, dest_agent_uuid, root_tx_hash, Decimal("100.0"))  # min stake per hop

                if not stake_available:
                    raise ValidationException(
                        "stake",
                        "Insufficient stake available (amplification detected)"
                    )

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

                if cycle_result and cycle_result['has_cycle']:
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

        except CircularDependencyException:
            raise
        except asyncpg.PostgresError as e:
            logger.error("record_forward_db_error", error=str(e))
            raise DatabaseException("record_forward", str(e))
        except Exception as e:
            logger.error("record_forward_error", error=str(e))
            raise

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

            # Compute commitment transaction hash
            commitment_tx_hash = SignatureVerifier.compute_routing_hash([
                root_tx_hash,
                first_hop_agent_uuid,
                routing_hash,
                str(amount_usdc)
            ])

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

        try:
            async with pool.acquire() as conn:
                # Verify agent exists and get owner
                agent_owner = await conn.fetchval("""
                    SELECT owner_address FROM erc8004_agents WHERE id = $1
                """, agent_uuid)

                if not agent_owner:
                    raise AgentNotFoundException(agent_uuid)

                # Compute manifest hash
                manifest_hash = SignatureVerifier.compute_manifest_hash(
                    agent_uuid=agent_uuid,
                    endpoint_uri=endpoint_uri,
                    pubkey=pubkey,
                    nonce=nonce,
                    valid_from_iso=valid_from.isoformat(),
                    valid_until_iso=valid_until.isoformat()
                )

                # Verify signature
                sig_valid = SignatureVerifier.verify_manifest_signature(
                    agent_uuid=agent_uuid,
                    endpoint_uri=endpoint_uri,
                    pubkey=pubkey,
                    nonce=nonce,
                    valid_from_iso=valid_from.isoformat(),
                    valid_until_iso=valid_until.isoformat(),
                    signature=signature,
                    expected_signer=agent_owner
                )

                if not sig_valid:
                    raise ValidationException(
                        "signature",
                        "Manifest signature verification failed"
                    )

                # Enforce activation delay (MEV protection)
                earliest_activation = await conn.fetchval("""
                    SELECT enforce_activation_delay($1, $2)
                """, agent_uuid, ManifestVerifier.MANIFEST_ACTIVATION_DELAY_SECONDS)

                if valid_from < earliest_activation:
                    raise ValidationException(
                        "valid_from",
                        f"Manifest activation too soon. Earliest: {earliest_activation.isoformat()}"
                    )

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

        except asyncpg.PostgresError as e:
            logger.error("publish_manifest_db_error", error=str(e))
            raise DatabaseException("publish_manifest", str(e))
        except (AgentNotFoundException, ValidationException):
            raise
        except Exception as e:
            logger.error("publish_manifest_error", error=str(e))
            raise

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
    async def report_mev_incident(
        root_tx_hash: str,
        attack_type: str,
        attacker_agent_uuid: str,
        victim_agent_uuid: str,
        extracted_value_usdc: Decimal,
        block_number: int,
        tx_index: int,
        evidence_hash: str
    ) -> Dict:
        """Report MEV attack incident"""
        pool = await get_db()

        valid_types = ['frontrun', 'sandwich', 'timebandit', 'extraction_loop']
        if attack_type not in valid_types:
            raise ValidationException("attack_type", f"Invalid type. Must be one of: {valid_types}")

        async with pool.acquire() as conn:
            incident_id = await conn.fetchval("""
                SELECT record_mev_incident($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                root_tx_hash, attack_type, attacker_agent_uuid, victim_agent_uuid,
                extracted_value_usdc, block_number, tx_index, evidence_hash
            )

            incident = await conn.fetchrow("""
                SELECT slashed_amount_usdc, created_at
                FROM erc8004_mev_incidents
                WHERE id = $1
            """, incident_id)

            logger.info(
                "mev_incident_reported",
                root_tx=root_tx_hash,
                attack_type=attack_type,
                attacker=attacker_agent_uuid,
                slashed_usdc=float(incident['slashed_amount_usdc'] or 0)
            )

            return {
                "reported": True,
                "incident_id": str(incident_id),
                "slashed_usdc": float(incident['slashed_amount_usdc'] or 0),
                "reported_at": incident['created_at'].isoformat()
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
