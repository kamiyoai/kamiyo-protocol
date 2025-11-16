"""
ERC-8004 Agent Identity API Routes
FastAPI endpoints for agent registration and reputation
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Optional, List
import logging
import uuid
from datetime import datetime

from .models import (
    RegisterAgentRequest,
    AgentResponse,
    ReputationFeedbackRequest,
    ReputationFeedbackResponse,
    AgentReputationSummary,
    AgentPaymentStats,
    AgentStatsResponse,
    LinkPaymentToAgentRequest,
    AgentSearchRequest,
    AgentListResponse,
    AgentRegistrationFile
)
from .database import DatabaseTransactionManager
from .rate_limiter import limiter, RateLimits
from .monitoring import MetricsCollector, logger
from .cache import ERC8004Cache, cached
from .auth import get_current_user, get_optional_user, AuthenticatedUser, verify_wallet_ownership
from .config import ContractConfig
from .cycle_detection import PaymentCycleDetector
from .game_theory import GameTheoryEngine
from config.database_pool import get_db
from decimal import Decimal
import time

router = APIRouter(prefix="/api/v1/agents", tags=["ERC-8004 Agents"])


@router.post("/register", response_model=AgentResponse, status_code=201)
@limiter.limit(RateLimits.REGISTER_AGENT)
async def register_agent(
    request: Request,
    registration: RegisterAgentRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Register a new ERC-8004 agent identity

    Creates an agent identity record and returns agent details.
    In production, this should trigger on-chain registration.

    Uses atomic transactions to ensure all-or-nothing registration.
    """
    if not await verify_wallet_ownership(user, registration.owner_address):
        raise HTTPException(
            status_code=403,
            detail="You can only register agents for your own wallet address"
        )

    pool = await get_db()
    start_time = time.time()

    # Validate chain has contracts configured
    if not ContractConfig.is_configured(registration.chain):
        raise HTTPException(
            status_code=400,
            detail=f"Chain '{registration.chain}' not configured. Supported: {ContractConfig.get_supported_chains()}"
        )

    registry_address = ContractConfig.get_identity_registry(registration.chain)

    try:
        async with pool.acquire() as conn:
            db_manager = DatabaseTransactionManager(conn)

            async with db_manager.transaction():
                logger.info("agent_registration_started",
                           owner=registration.owner_address,
                           chain=registration.chain,
                           user_id=user.user_id)

                # Generate agent ID (in production, this comes from smart contract)
                result = await conn.fetchrow("""
                    SELECT COALESCE(MAX(agent_id), 0) + 1 as next_id
                    FROM erc8004_agents
                    WHERE chain = $1
                """, registration.chain)
                agent_id = result['next_id'] if result else 1

                # Create agent record
                agent_uuid = str(uuid.uuid4())
                token_uri = f"https://kamiyo.ai/api/v1/agents/{agent_uuid}/registration"
                now = datetime.utcnow()

                await conn.execute("""
                    INSERT INTO erc8004_agents (
                        id, agent_id, chain, registry_address, owner_address,
                        token_uri, registration_file, status, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """,
                    agent_uuid,
                    agent_id,
                    registration.chain,
                    registry_address,
                    registration.owner_address,
                    token_uri,
                    registration.registration_file.model_dump_json(),
                    "active",
                    now,
                    now
                )

                # Store metadata (will rollback if fails)
                for key, value in registration.metadata.items():
                    await conn.execute("""
                        INSERT INTO erc8004_agent_metadata (
                            agent_uuid, key, value, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5)
                    """,
                        agent_uuid,
                        key,
                        str(value).encode(),
                        now,
                        now
                    )

                duration = time.time() - start_time
                MetricsCollector.record_registration(registration.chain, True, duration)

                logger.info("agent_registration_success",
                           agent_id=agent_id,
                           agent_uuid=agent_uuid,
                           duration_seconds=duration)

                return AgentResponse(
                    agent_uuid=agent_uuid,
                    agent_id=agent_id,
                    chain=registration.chain,
                    registry_address=registry_address,
                    owner_address=registration.owner_address,
                    token_uri=token_uri,
                    status="active",
                    created_at=now,
                    registration_file=registration.registration_file
                )

    except Exception as e:
        duration = time.time() - start_time
        MetricsCollector.record_registration(registration.chain, False, duration)

        logger.error("agent_registration_failed",
                    owner=registration.owner_address,
                    error=str(e),
                    duration_seconds=duration,
                    exc_info=True)

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}", response_model=AgentResponse)
@limiter.limit(RateLimits.GET_AGENT)
async def get_agent(request: Request, agent_uuid: str):
    """Get agent details by UUID"""
    try:
        db = await get_db()

        async with db.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT id, agent_id, chain, registry_address, owner_address,
                       token_uri, registration_file, status, created_at
                FROM erc8004_agents
                WHERE id = $1
            """, agent_uuid)

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        return AgentResponse(
            agent_uuid=result['id'],
            agent_id=result['agent_id'],
            chain=result['chain'],
            registry_address=result['registry_address'],
            owner_address=result['owner_address'],
            token_uri=result['token_uri'],
            status=result['status'],
            created_at=result['created_at'],
            registration_file=AgentRegistrationFile.model_validate_json(result['registration_file']) if result['registration_file'] else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/registration", response_model=AgentRegistrationFile)
async def get_agent_registration(agent_uuid: str):
    """
    Get agent registration file (ERC-8004 format)
    This endpoint is referenced in the agent's tokenURI
    """
    try:
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT registration_file
                FROM erc8004_agents
                WHERE id = $1 AND status = 'active'
            """, agent_uuid)

        if not result or not result['registration_file']:
            raise HTTPException(status_code=404, detail="Agent registration not found")

        return AgentRegistrationFile.model_validate_json(result['registration_file'])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching registration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback", response_model=ReputationFeedbackResponse, status_code=201)
@limiter.limit(RateLimits.SUBMIT_FEEDBACK)
async def submit_feedback(request: Request, feedback: ReputationFeedbackRequest):
    """
    Submit reputation feedback for an agent

    Used to record payment reliability, service quality, etc.
    """
    pool = await get_db()

    try:
        logger.info("feedback_submission_started",
                   agent_uuid=feedback.agent_uuid,
                   client=feedback.client_address,
                   score=feedback.score)

        async with pool.acquire() as conn:
            # Verify agent exists
            agent = await conn.fetchrow("""
                SELECT id FROM erc8004_agents WHERE id = $1
            """, feedback.agent_uuid)

            if not agent:
                raise HTTPException(status_code=404, detail="Agent not found")

            feedback_id = str(uuid.uuid4())

            await conn.execute("""
                INSERT INTO erc8004_reputation (
                    id, agent_uuid, client_address, score, tag1, tag2,
                    file_uri, file_hash, feedback_auth, is_revoked,
                    chain, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
                feedback_id,
                feedback.agent_uuid,
                feedback.client_address,
                feedback.score,
                feedback.tag1,
                feedback.tag2,
                feedback.file_uri,
                feedback.file_hash,
                feedback.feedback_auth.encode() if feedback.feedback_auth else None,
                False,
                "base",
                datetime.utcnow()
            )

        MetricsCollector.record_feedback(True)

        cache = ERC8004Cache()
        await cache.invalidate_agent(feedback.agent_uuid)

        logger.info("feedback_submission_success",
                   feedback_id=feedback_id,
                   agent_uuid=feedback.agent_uuid)

        return ReputationFeedbackResponse(
            id=feedback_id,
            agent_uuid=feedback.agent_uuid,
            client_address=feedback.client_address,
            score=feedback.score,
            tag1=feedback.tag1,
            tag2=feedback.tag2,
            is_revoked=False,
            created_at=datetime.utcnow()
        )

    except HTTPException:
        MetricsCollector.record_feedback(False)
        raise
    except Exception as e:
        MetricsCollector.record_feedback(False)
        logger.error("feedback_submission_failed",
                    agent_uuid=feedback.agent_uuid,
                    error=str(e),
                    exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/reputation", response_model=AgentReputationSummary)
async def get_agent_reputation(agent_uuid: str):
    """Get agent reputation summary"""
    try:
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT * FROM v_erc8004_agent_reputation
                WHERE agent_uuid = $1
            """, agent_uuid)

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        return AgentReputationSummary(
            agent_uuid=result['agent_uuid'],
            agent_id=result['agent_id'],
            total_feedback=result['total_feedback'] or 0,
            average_score=result['average_score'],
            positive_feedback=result['positive_feedback'] or 0,
            negative_feedback=result['negative_feedback'] or 0,
            revoked_feedback=result['revoked_feedback'] or 0,
            last_feedback_at=result['last_feedback_at']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching reputation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/stats", response_model=AgentStatsResponse)
@cached(ttl=300, key_prefix="agent_stats")
async def get_agent_stats(agent_uuid: str):
    """
    Get combined agent statistics (reputation + payments)

    Cached for 5 minutes to reduce database load.
    """
    try:
        pool = await get_db()

        async with pool.acquire() as conn:
            result = await conn.fetchrow("""
                SELECT * FROM v_erc8004_agent_stats
                WHERE agent_uuid = $1
            """, agent_uuid)

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        MetricsCollector.record_search_duration(0)

        return AgentStatsResponse(
            agent_uuid=result['agent_uuid'],
            agent_id=result['agent_id'],
            chain=result['chain'],
            registry_address=result['registry_address'],
            owner_address=result['owner_address'],
            status=result['status'],
            registered_at=result['registered_at'],
            total_feedback=result['total_feedback'] or 0,
            reputation_score=result['reputation_score'],
            positive_feedback=result['positive_feedback'] or 0,
            negative_feedback=result['negative_feedback'] or 0,
            total_payments=result['total_payments'] or 0,
            total_amount_usdc=result['total_amount_usdc'],
            payment_success_rate=result['payment_success_rate'],
            last_payment_at=result['last_payment_at'],
            trust_level=result['trust_level'] or "poor"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link-payment", status_code=200)
@limiter.limit(RateLimits.LINK_PAYMENT)
async def link_payment_to_agent(request: Request, link_request: LinkPaymentToAgentRequest):
    """
    Link an x402 payment to an agent identity

    Called after successful payment verification to build agent reputation.
    Uses atomic transaction to ensure consistent linking.
    """
    pool = await get_db()

    try:
        async with pool.acquire() as conn:
            db_manager = DatabaseTransactionManager(conn)

            async with db_manager.transaction():
                # Find the x402 payment
                payment = await conn.fetchrow("""
                    SELECT id, amount_usdc, status, created_at
                    FROM x402_payments
                    WHERE tx_hash = $1 AND chain = $2
                """, link_request.tx_hash, link_request.chain)

                if not payment:
                    raise HTTPException(status_code=404, detail="Payment not found")

                # Link payment to agent
                await conn.execute("""
                    INSERT INTO erc8004_agent_payments (
                        agent_uuid, x402_payment_id, tx_hash, chain,
                        amount_usdc, status, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                    link_request.agent_uuid,
                    payment['id'],
                    link_request.tx_hash,
                    link_request.chain,
                    payment['amount_usdc'],
                    payment['status'],
                    payment['created_at']
                )

                # Update x402_payments table with agent_id
                await conn.execute("""
                    UPDATE x402_payments
                    SET agent_id = $1
                    WHERE tx_hash = $2 AND chain = $3
                """, link_request.agent_uuid, link_request.tx_hash, link_request.chain)

                logger.info(f"Linked payment {link_request.tx_hash} to agent {link_request.agent_uuid}")

                return {"success": True, "message": "Payment linked to agent"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=AgentListResponse)
@limiter.limit(RateLimits.SEARCH_AGENTS)
async def search_agents(
    request: Request,
    owner_address: Optional[str] = Query(None),
    chain: Optional[str] = Query(None),
    min_reputation_score: Optional[int] = Query(None, ge=0, le=100),
    min_success_rate: Optional[float] = Query(None, ge=0, le=100),
    trust_level: Optional[str] = Query(None),
    status: str = Query("active"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0)
):
    """
    Search and filter agents

    Supports filtering by owner, chain, reputation metrics, and trust level
    """
    try:
        pool = await get_db()

        # Build dynamic query with $1, $2... placeholders
        conditions = ["status = $1"]
        params = [status]
        param_count = 1

        if owner_address:
            param_count += 1
            conditions.append(f"LOWER(owner_address) = LOWER(${param_count})")
            params.append(owner_address)

        if chain:
            param_count += 1
            conditions.append(f"chain = ${param_count}")
            params.append(chain)

        if min_reputation_score is not None:
            param_count += 1
            conditions.append(f"reputation_score >= ${param_count}")
            params.append(min_reputation_score)

        if min_success_rate is not None:
            param_count += 1
            conditions.append(f"payment_success_rate >= ${param_count}")
            params.append(min_success_rate)

        if trust_level:
            param_count += 1
            conditions.append(f"trust_level = ${param_count}")
            params.append(trust_level)

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            # Get total count
            count_result = await conn.fetchrow(f"""
                SELECT COUNT(*) FROM v_erc8004_agent_stats
                WHERE {where_clause}
            """, *params)

            total = count_result['count'] if count_result else 0

            # Get paginated results
            param_count += 1
            limit_placeholder = f"${param_count}"
            param_count += 1
            offset_placeholder = f"${param_count}"

            results = await conn.fetch(f"""
                SELECT * FROM v_erc8004_agent_stats
                WHERE {where_clause}
                ORDER BY registered_at DESC
                LIMIT {limit_placeholder} OFFSET {offset_placeholder}
            """, *params, limit, offset)

        agents = [
            AgentStatsResponse(
                agent_uuid=row['agent_uuid'],
                agent_id=row['agent_id'],
                chain=row['chain'],
                registry_address=row['registry_address'],
                owner_address=row['owner_address'],
                status=row['status'],
                registered_at=row['registered_at'],
                total_feedback=row['total_feedback'] or 0,
                reputation_score=row['reputation_score'],
                positive_feedback=row['positive_feedback'] or 0,
                negative_feedback=row['negative_feedback'] or 0,
                total_payments=row['total_payments'] or 0,
                total_amount_usdc=row['total_amount_usdc'],
                payment_success_rate=row['payment_success_rate'],
                last_payment_at=row['last_payment_at'],
                trust_level=row['trust_level'] or "poor"
            )
            for row in results
        ]

        return AgentListResponse(
            agents=agents,
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Error searching agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-forward")
@limiter.limit(RateLimits.GET_AGENT)
async def verify_forward(
    request: Request,
    root_tx_hash: str,
    source_agent: str,
    target_agent: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Verify if forwarding a payment would create a cycle

    Called before forwarding to prevent circular dependencies.
    Returns safety status and recommendation.
    """
    try:
        result = await PaymentCycleDetector.verify_forward_safe(
            root_tx_hash, source_agent, target_agent
        )

        if not result['safe']:
            logger.warning(
                "unsafe_forward_detected",
                root_tx=root_tx_hash,
                source=source_agent,
                target=target_agent,
                reason=result['reason']
            )

        return {
            "safe": result['safe'],
            "reason": result['reason'],
            "cycle_agents": result['cycle_agents'],
            "recommendation": "proceed" if result['safe'] else "reject_forward"
        }

    except Exception as e:
        logger.error(f"Error verifying forward: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record-forward")
@limiter.limit(RateLimits.LINK_PAYMENT)
async def record_forward(
    request: Request,
    root_tx_hash: str,
    source_agent: str,
    target_agent: str,
    hop_number: int,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Record a payment forward in the chain

    Automatically detects cycles and applies penalties if found.
    """
    try:
        result = await PaymentCycleDetector.record_forward(
            root_tx_hash, source_agent, target_agent, hop_number
        )

        if result['cycle_detected']:
            penalty_result = await PaymentCycleDetector.apply_cycle_penalties(
                root_tx_hash,
                result['cycle_agents'],
                result['cycle_depth']
            )

            return {
                "forward_recorded": True,
                "cycle_detected": True,
                "cycle_depth": result['cycle_depth'],
                "penalties_applied": penalty_result['penalties_applied'],
                "penalty_details": penalty_result['details']
            }

        return {
            "forward_recorded": True,
            "cycle_detected": False
        }

    except Exception as e:
        logger.error(f"Error recording forward: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cycle-history")
@limiter.limit(RateLimits.SEARCH_AGENTS)
async def get_cycle_history(
    request: Request,
    root_tx_hash: Optional[str] = Query(None),
    agent_uuid: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get payment cycle detection history"""
    try:
        history = await PaymentCycleDetector.get_cycle_history(
            root_tx_hash, agent_uuid, limit
        )

        return {
            "total": len(history),
            "history": history
        }

    except Exception as e:
        logger.error(f"Error fetching cycle history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stake")
@limiter.limit(RateLimits.LINK_PAYMENT)
async def stake_agent(
    request: Request,
    agent_uuid: str,
    amount_usdc: float,
    lock_duration_days: int = 30,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Stake USDC to increase trust tier

    Nash equilibrium: Higher stake reduces penalty impact, increases trust
    """
    try:
        result = await GameTheoryEngine.stake_agent(
            agent_uuid, Decimal(str(amount_usdc)), lock_duration_days
        )

        return result

    except Exception as e:
        logger.error(f"Error staking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unstake")
@limiter.limit(RateLimits.LINK_PAYMENT)
async def unstake_agent(
    request: Request,
    agent_uuid: str,
    amount_usdc: float,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Unstake USDC (after lock period)

    Slashed amounts cannot be recovered (Nash equilibrium enforcement)
    """
    try:
        result = await GameTheoryEngine.unstake_agent(
            agent_uuid, Decimal(str(amount_usdc))
        )

        return result

    except Exception as e:
        logger.error(f"Error unstaking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/game-theory")
@limiter.limit(RateLimits.GET_AGENT)
async def get_game_theory_metrics(
    request: Request,
    agent_uuid: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Get comprehensive game theory metrics

    Returns stake, cooperation score, Sybil resistance, trust level
    """
    try:
        metrics = await GameTheoryEngine.get_game_theory_metrics(agent_uuid)

        if not metrics.get('found', True):
            raise HTTPException(status_code=404, detail="Agent not found")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching game theory metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/sybil-score")
@limiter.limit(RateLimits.GET_AGENT)
async def get_sybil_score(
    request: Request,
    agent_uuid: str
):
    """Get Sybil resistance score based on network topology"""
    try:
        score = await GameTheoryEngine.get_sybil_score(agent_uuid)
        return score

    except Exception as e:
        logger.error(f"Error calculating Sybil score: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/cooperation-rewards")
@limiter.limit(RateLimits.GET_AGENT)
async def get_cooperation_rewards(
    request: Request,
    agent_uuid: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get cooperation rewards earned by agent"""
    try:
        rewards = await GameTheoryEngine.get_cooperation_rewards(agent_uuid)
        return rewards

    except Exception as e:
        logger.error(f"Error fetching cooperation rewards: {e}")
        raise HTTPException(status_code=500, detail=str(e))
