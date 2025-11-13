"""
ERC-8004 Agent Identity API Routes
FastAPI endpoints for agent registration and reputation
"""

from fastapi import APIRouter, HTTPException, Depends, Query
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
from database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/agents", tags=["ERC-8004 Agents"])


@router.post("/register", response_model=AgentResponse, status_code=201)
async def register_agent(request: RegisterAgentRequest):
    """
    Register a new ERC-8004 agent identity

    Creates an agent identity record and returns agent details.
    In production, this should trigger on-chain registration.
    """
    try:
        db = get_db()

        # Generate agent ID (in production, this comes from smart contract)
        agent_id = db.get_next_agent_id(request.chain)

        # Create agent record
        agent_uuid = str(uuid.uuid4())
        token_uri = f"https://kamiyo.ai/api/v1/agents/{agent_uuid}/registration"

        db.execute("""
            INSERT INTO erc8004_agents (
                id, agent_id, chain, registry_address, owner_address,
                token_uri, registration_file, status, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            agent_uuid,
            agent_id,
            request.chain,
            "0x0000000000000000000000000000000000000000",  # Placeholder
            request.owner_address,
            token_uri,
            request.registration_file.model_dump_json(),
            "active",
            datetime.utcnow(),
            datetime.utcnow()
        ))

        # Store metadata
        for key, value in request.metadata.items():
            db.execute("""
                INSERT INTO erc8004_agent_metadata (
                    agent_uuid, key, value, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                agent_uuid,
                key,
                str(value).encode(),
                datetime.utcnow(),
                datetime.utcnow()
            ))

        logger.info(f"Registered agent {agent_id} for {request.owner_address}")

        return AgentResponse(
            agent_uuid=agent_uuid,
            agent_id=agent_id,
            chain=request.chain,
            registry_address="0x0000000000000000000000000000000000000000",
            owner_address=request.owner_address,
            token_uri=token_uri,
            status="active",
            created_at=datetime.utcnow(),
            registration_file=request.registration_file
        )

    except Exception as e:
        logger.error(f"Error registering agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}", response_model=AgentResponse)
async def get_agent(agent_uuid: str):
    """Get agent details by UUID"""
    try:
        db = get_db()

        result = db.fetch_one("""
            SELECT id, agent_id, chain, registry_address, owner_address,
                   token_uri, registration_file, status, created_at
            FROM erc8004_agents
            WHERE id = %s
        """, (agent_uuid,))

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        return AgentResponse(
            agent_uuid=result[0],
            agent_id=result[1],
            chain=result[2],
            registry_address=result[3],
            owner_address=result[4],
            token_uri=result[5],
            status=result[7],
            created_at=result[8],
            registration_file=AgentRegistrationFile.model_validate_json(result[6]) if result[6] else None
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
        db = get_db()

        result = db.fetch_one("""
            SELECT registration_file
            FROM erc8004_agents
            WHERE id = %s AND status = 'active'
        """, (agent_uuid,))

        if not result or not result[0]:
            raise HTTPException(status_code=404, detail="Agent registration not found")

        return AgentRegistrationFile.model_validate_json(result[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching registration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback", response_model=ReputationFeedbackResponse, status_code=201)
async def submit_feedback(request: ReputationFeedbackRequest):
    """
    Submit reputation feedback for an agent

    Used to record payment reliability, service quality, etc.
    """
    try:
        db = get_db()

        # Verify agent exists
        agent = db.fetch_one("""
            SELECT id FROM erc8004_agents WHERE id = %s
        """, (request.agent_uuid,))

        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        feedback_id = str(uuid.uuid4())

        db.execute("""
            INSERT INTO erc8004_reputation (
                id, agent_uuid, client_address, score, tag1, tag2,
                file_uri, file_hash, feedback_auth, is_revoked,
                chain, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            feedback_id,
            request.agent_uuid,
            request.client_address,
            request.score,
            request.tag1,
            request.tag2,
            request.file_uri,
            request.file_hash,
            request.feedback_auth.encode() if request.feedback_auth else None,
            False,
            "base",  # Default chain
            datetime.utcnow()
        ))

        logger.info(f"Feedback submitted for agent {request.agent_uuid}: score={request.score}")

        return ReputationFeedbackResponse(
            id=feedback_id,
            agent_uuid=request.agent_uuid,
            client_address=request.client_address,
            score=request.score,
            tag1=request.tag1,
            tag2=request.tag2,
            is_revoked=False,
            created_at=datetime.utcnow()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/reputation", response_model=AgentReputationSummary)
async def get_agent_reputation(agent_uuid: str):
    """Get agent reputation summary"""
    try:
        db = get_db()

        result = db.fetch_one("""
            SELECT * FROM v_erc8004_agent_reputation
            WHERE agent_uuid = %s
        """, (agent_uuid,))

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        return AgentReputationSummary(
            agent_uuid=result[0],
            agent_id=result[1],
            total_feedback=result[4] or 0,
            average_score=result[5],
            positive_feedback=result[6] or 0,
            negative_feedback=result[7] or 0,
            revoked_feedback=result[8] or 0,
            last_feedback_at=result[9]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching reputation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{agent_uuid}/stats", response_model=AgentStatsResponse)
async def get_agent_stats(agent_uuid: str):
    """Get combined agent statistics (reputation + payments)"""
    try:
        db = get_db()

        result = db.fetch_one("""
            SELECT * FROM v_erc8004_agent_stats
            WHERE agent_uuid = %s
        """, (agent_uuid,))

        if not result:
            raise HTTPException(status_code=404, detail="Agent not found")

        return AgentStatsResponse(
            agent_uuid=result[0],
            agent_id=result[1],
            chain=result[2],
            registry_address=result[3],
            owner_address=result[4],
            status=result[5],
            registered_at=result[6],
            total_feedback=result[7] or 0,
            reputation_score=result[8],
            positive_feedback=result[9] or 0,
            negative_feedback=result[10] or 0,
            total_payments=result[11] or 0,
            total_amount_usdc=result[12],
            payment_success_rate=result[13],
            last_payment_at=result[14],
            trust_level=result[15] or "poor"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link-payment", status_code=200)
async def link_payment_to_agent(request: LinkPaymentToAgentRequest):
    """
    Link an x402 payment to an agent identity

    Called after successful payment verification to build agent reputation
    """
    try:
        db = get_db()

        # Find the x402 payment
        payment = db.fetch_one("""
            SELECT id, amount_usdc, status, created_at
            FROM x402_payments
            WHERE tx_hash = %s AND chain = %s
        """, (request.tx_hash, request.chain))

        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        # Link payment to agent
        db.execute("""
            INSERT INTO erc8004_agent_payments (
                agent_uuid, x402_payment_id, tx_hash, chain,
                amount_usdc, status, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            request.agent_uuid,
            payment[0],
            request.tx_hash,
            request.chain,
            payment[1],
            payment[2],
            payment[3]
        ))

        # Update x402_payments table with agent_id
        db.execute("""
            UPDATE x402_payments
            SET agent_id = %s
            WHERE tx_hash = %s AND chain = %s
        """, (request.agent_uuid, request.tx_hash, request.chain))

        logger.info(f"Linked payment {request.tx_hash} to agent {request.agent_uuid}")

        return {"success": True, "message": "Payment linked to agent"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=AgentListResponse)
async def search_agents(
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
        db = get_db()

        # Build dynamic query
        conditions = ["status = %s"]
        params = [status]

        if owner_address:
            conditions.append("LOWER(owner_address) = LOWER(%s)")
            params.append(owner_address)

        if chain:
            conditions.append("chain = %s")
            params.append(chain)

        if min_reputation_score is not None:
            conditions.append("reputation_score >= %s")
            params.append(min_reputation_score)

        if min_success_rate is not None:
            conditions.append("payment_success_rate >= %s")
            params.append(min_success_rate)

        if trust_level:
            conditions.append("trust_level = %s")
            params.append(trust_level)

        where_clause = " AND ".join(conditions)

        # Get total count
        count_result = db.fetch_one(f"""
            SELECT COUNT(*) FROM v_erc8004_agent_stats
            WHERE {where_clause}
        """, tuple(params))

        total = count_result[0] if count_result else 0

        # Get paginated results
        params.extend([limit, offset])
        results = db.fetch_all(f"""
            SELECT * FROM v_erc8004_agent_stats
            WHERE {where_clause}
            ORDER BY registered_at DESC
            LIMIT %s OFFSET %s
        """, tuple(params))

        agents = [
            AgentStatsResponse(
                agent_uuid=row[0],
                agent_id=row[1],
                chain=row[2],
                registry_address=row[3],
                owner_address=row[4],
                status=row[5],
                registered_at=row[6],
                total_feedback=row[7] or 0,
                reputation_score=row[8],
                positive_feedback=row[9] or 0,
                negative_feedback=row[10] or 0,
                total_payments=row[11] or 0,
                total_amount_usdc=row[12],
                payment_success_rate=row[13],
                last_payment_at=row[14],
                trust_level=row[15] or "poor"
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
