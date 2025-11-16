"""API routes for manifest verification and forward receipts"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal

from .manifest_verification import ManifestVerifier
from .rate_limiter import limiter, RateLimits
from .auth import get_current_user, AuthenticatedUser
from .monitoring import logger

router = APIRouter(prefix="/api/v1/agents/manifests", tags=["Endpoint Manifests"])


class PublishManifestRequest(BaseModel):
    agent_uuid: str
    endpoint_uri: str
    pubkey: str
    nonce: int = Field(ge=0)
    valid_from: datetime
    valid_until: datetime
    signature: str
    chain: str = "base"


class VerifyForwardRequest(BaseModel):
    root_tx_hash: str
    source_agent_uuid: str
    dest_agent_uuid: str
    manifest_hash: str
    manifest_nonce: int = Field(ge=0)
    manifest_signature: str


class RecordForwardRequest(BaseModel):
    root_tx_hash: str
    source_agent_uuid: str
    dest_agent_uuid: str
    hop: int = Field(ge=0)
    manifest_id: str
    next_hop_hash: Optional[str] = None
    receipt_nonce: int = Field(ge=0)
    signature: str
    chain: str = "base"


class OnchainCommitmentRequest(BaseModel):
    root_tx_hash: str
    first_hop_agent_uuid: str
    routing_hash: str
    amount_usdc: Decimal = Field(ge=0)
    chain: str = "base"


class ReportCycleRequest(BaseModel):
    root_tx_hash: str
    reporter_address: str


@router.post("/publish")
@limiter.limit(RateLimits.WRITE_OPERATION)
async def publish_manifest(
    request: Request,
    manifest_req: PublishManifestRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Publish signed endpoint manifest

    Manifests are immutable routing declarations with nonce-based
    versioning to prevent post-verification routing changes.
    """
    try:
        result = await ManifestVerifier.publish_manifest(
            agent_uuid=manifest_req.agent_uuid,
            endpoint_uri=manifest_req.endpoint_uri,
            pubkey=manifest_req.pubkey,
            nonce=manifest_req.nonce,
            valid_from=manifest_req.valid_from,
            valid_until=manifest_req.valid_until,
            signature=manifest_req.signature,
            chain=manifest_req.chain
        )
        return result
    except Exception as e:
        logger.error("manifest_publish_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/verify-forward")
@limiter.limit(RateLimits.VERIFY_FORWARD)
async def verify_forward(
    request: Request,
    verify_req: VerifyForwardRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Verify forward safety with manifest validation

    Returns safe=true only if manifest is valid, nonce unused,
    time window current, and no cycle detected.
    """
    try:
        result = await ManifestVerifier.verify_forward(
            root_tx_hash=verify_req.root_tx_hash,
            source_agent_uuid=verify_req.source_agent_uuid,
            dest_agent_uuid=verify_req.dest_agent_uuid,
            manifest_hash=verify_req.manifest_hash,
            manifest_nonce=verify_req.manifest_nonce,
            manifest_signature=verify_req.manifest_signature
        )
        return result
    except Exception as e:
        logger.error("verify_forward_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/record-forward")
@limiter.limit(RateLimits.WRITE_OPERATION)
async def record_forward(
    request: Request,
    record_req: RecordForwardRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Record forward with non-repudiable receipt

    Receipt binds routing via signature. Any routing change
    invalidates the receipt and becomes provable.
    """
    try:
        result = await ManifestVerifier.record_forward(
            root_tx_hash=record_req.root_tx_hash,
            source_agent_uuid=record_req.source_agent_uuid,
            dest_agent_uuid=record_req.dest_agent_uuid,
            hop=record_req.hop,
            manifest_id=record_req.manifest_id,
            next_hop_hash=record_req.next_hop_hash,
            receipt_nonce=record_req.receipt_nonce,
            signature=record_req.signature,
            chain=record_req.chain
        )
        return result
    except Exception as e:
        logger.error("record_forward_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/onchain-commitment")
@limiter.limit(RateLimits.WRITE_OPERATION)
async def create_onchain_commitment(
    request: Request,
    commitment_req: OnchainCommitmentRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Create on-chain commitment for high-value flows

    Binds first-hop routing into auditable tx with time-lock.
    Required for flows >= $10k USDC.
    """
    try:
        result = await ManifestVerifier.create_onchain_commitment(
            root_tx_hash=commitment_req.root_tx_hash,
            first_hop_agent_uuid=commitment_req.first_hop_agent_uuid,
            routing_hash=commitment_req.routing_hash,
            amount_usdc=commitment_req.amount_usdc,
            chain=commitment_req.chain
        )
        return result
    except Exception as e:
        logger.error("onchain_commitment_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/report-cycle")
@limiter.limit(RateLimits.WRITE_OPERATION)
async def report_cycle(
    request: Request,
    report_req: ReportCycleRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    External reporter submits cycle proof for bounty

    Bounty = base (50 USDC) + depth multiplier + 10% of slashed stakes
    Capped at 1000 USDC per report.
    """
    try:
        result = await ManifestVerifier.report_cycle(
            root_tx_hash=report_req.root_tx_hash,
            reporter_address=report_req.reporter_address
        )
        return result
    except Exception as e:
        logger.error("cycle_report_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{agent_uuid}/flip-metrics")
@limiter.limit(RateLimits.READ_OPERATION)
async def get_flip_metrics(
    request: Request,
    agent_uuid: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Get manifest flip metrics for monitoring

    Tracks suspicious routing changes:
    - Rapid flips (<1 min)
    - Endpoint changes
    - High suspicion scores
    """
    try:
        result = await ManifestVerifier.get_flip_metrics(agent_uuid)
        return result
    except Exception as e:
        logger.error("flip_metrics_failed", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
