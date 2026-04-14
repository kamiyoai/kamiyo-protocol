"""POST /extract -- extract entities, claims, and scenario topics from chunks."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.extraction.entity_extractor import extract_entities
from src.extraction.claim_extractor import extract_claims
from src.extraction.topic_modeler import derive_scenario_topics
from src.utils import generate_id

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChunkInput(BaseModel):
    """A single text chunk to extract from."""

    id: str
    content: str
    evidence_id: str = Field(alias="evidenceId")

    model_config = {"populate_by_name": True}


class ExtractRequest(BaseModel):
    """Request body for the /extract endpoint."""

    project_id: str = Field(alias="projectId")
    prompt: str
    chunks: list[ChunkInput]

    model_config = {"populate_by_name": True}


class ExtractResponse(BaseModel):
    """Response body for the /extract endpoint."""

    entities: list[dict]
    claims: list[dict]
    scenario_inputs: list[dict] = Field(alias="scenarioInputs")
    extractions: list[dict]
    errors: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest) -> ExtractResponse:
    """Run the full extraction pipeline: entities -> claims -> scenario topics.

    Each step feeds into the next. If any step fails, partial results are
    returned along with error messages in the ``errors`` field.
    """
    if not req.chunks:
        raise HTTPException(status_code=400, detail="No chunks provided.")

    chunk_dicts = [
        {"id": c.id, "content": c.content, "evidenceId": c.evidence_id}
        for c in req.chunks
    ]

    entities: list[dict] = []
    claims: list[dict] = []
    scenario_inputs: list[dict] = []
    errors: list[str] = []

    # Step 1: Entity extraction
    try:
        entities = await extract_entities(chunk_dicts, req.prompt)
        logger.info("Extracted %d entities for project %s", len(entities), req.project_id)
    except Exception as exc:
        msg = f"Entity extraction failed: {exc}"
        logger.error(msg, exc_info=True)
        errors.append(msg)

    # Step 2: Claim extraction (uses entities for cross-referencing)
    try:
        claims = await extract_claims(chunk_dicts, entities, req.prompt)
        logger.info("Extracted %d claims for project %s", len(claims), req.project_id)
    except Exception as exc:
        msg = f"Claim extraction failed: {exc}"
        logger.error(msg, exc_info=True)
        errors.append(msg)

    # Step 3: Scenario topic derivation (uses both entities and claims)
    try:
        scenario_inputs = await derive_scenario_topics(entities, claims, req.prompt)
        logger.info("Derived %d scenario topics for project %s", len(scenario_inputs), req.project_id)
    except Exception as exc:
        msg = f"Scenario topic derivation failed: {exc}"
        logger.error(msg, exc_info=True)
        errors.append(msg)

    # Build extraction summary records linking back to each extracted item
    extractions: list[dict] = []

    for entity in entities:
        evidence_ids = _resolve_evidence_ids(entity.get("chunkIds", []), chunk_dicts)
        extractions.append({
            "id": generate_id("rf_ext"),
            "type": "entity",
            "refId": entity["id"],
            "label": entity.get("label", ""),
            "evidenceIds": evidence_ids,
        })

    for claim in claims:
        evidence_ids = _resolve_evidence_ids(claim.get("supportingChunkIds", []), chunk_dicts)
        extractions.append({
            "id": generate_id("rf_ext"),
            "type": "claim",
            "refId": claim["id"],
            "label": claim.get("statement", "")[:100],
            "evidenceIds": evidence_ids,
        })

    for sci in scenario_inputs:
        extractions.append({
            "id": generate_id("rf_ext"),
            "type": "scenarioInput",
            "refId": sci["id"],
            "label": sci.get("topic", ""),
        })

    return ExtractResponse(
        entities=entities,
        claims=claims,
        scenarioInputs=scenario_inputs,
        extractions=extractions,
        errors=errors,
    )


def _resolve_evidence_ids(
    chunk_ids: list[str],
    chunk_dicts: list[dict],
) -> list[str]:
    """Map chunk IDs back to their source evidence IDs.

    Chunks carry an ``evidenceId`` field that links back to the original
    document/evidence record. This function resolves chunk IDs to those
    evidence IDs, deduplicating the result.
    """
    chunk_to_evidence = {c["id"]: c.get("evidenceId", "") for c in chunk_dicts}
    evidence_ids: list[str] = []
    seen: set[str] = set()

    for cid in chunk_ids:
        eid = chunk_to_evidence.get(cid, "")
        if eid and eid not in seen:
            evidence_ids.append(eid)
            seen.add(eid)

    return evidence_ids
