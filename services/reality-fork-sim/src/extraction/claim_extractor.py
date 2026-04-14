"""Extract structured claims from text chunks using Claude.

Handles batching for large inputs, cross-references against known entities,
and robust JSON parsing with retries.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import anthropic

from src import config
from src.utils import generate_id, parse_llm_json

logger = logging.getLogger(__name__)

BATCH_CHAR_LIMIT = 60_000

SYSTEM_PROMPT = """\
You are an expert claim-extraction engine used in strategic intelligence analysis. \
Given text chunks, a list of known entities, and an analysis prompt, identify every \
distinct claim, assertion, or stated position present in the text.

Return ONLY a JSON array. Each element must have exactly these fields:

- "statement": the claim expressed as a single clear sentence (verbatim quote or close paraphrase)
- "category": one of: factual | predictive | evaluative | causal | normative
    - factual: a statement about what is or was the case
    - predictive: a statement about what will or might happen
    - evaluative: a judgment about quality, value, or significance
    - causal: a claim that X causes/caused/leads to Y
    - normative: a claim about what should be done or what is right/wrong
- "confidence": float 0.0-1.0 representing how confident the source is in this claim.
    Calibration guide:
    - 0.9-1.0: near-certain, backed by direct evidence or official data
    - 0.7-0.89: strong confidence, well-supported but some uncertainty
    - 0.5-0.69: moderate confidence, mixed evidence or qualified language
    - 0.3-0.49: low confidence, speculative or hedged
    - 0.0-0.29: very uncertain, explicitly flagged as unverified or contested
- "sentiment": float -1.0 to 1.0 (negative = pessimistic/critical, 0 = neutral, positive = optimistic/favorable)
- "supportingChunkIds": array of chunk IDs that contain evidence for this claim
- "entityLabels": array of entity labels (from the known entities list) involved in this claim
- "counterclaim": brief description of the strongest counter-argument or null if none apparent
- "stakes": one of: low | medium | high | critical
    - low: minor detail, limited downstream impact
    - medium: relevant to the analysis but not pivotal
    - high: significantly shapes the conclusions or decisions
    - critical: a make-or-break claim that the entire analysis hinges on

Rules:
- Extract claims at a useful granularity: one distinct assertion per claim, not entire paragraphs.
- Use entity labels exactly as provided in the known entities list when possible.
- If a claim references an entity not in the known list, still include it in entityLabels.
- Do NOT wrap your response in markdown fences or add any text outside the JSON array.
"""


def _batch_chunks(chunks: list[dict]) -> list[list[dict]]:
    """Split chunks into batches that stay under BATCH_CHAR_LIMIT."""
    batches: list[list[dict]] = []
    current_batch: list[dict] = []
    current_size = 0

    for chunk in chunks:
        chunk_size = len(chunk.get("content", "")) + len(chunk.get("id", "")) + 10
        if current_batch and current_size + chunk_size > BATCH_CHAR_LIMIT:
            batches.append(current_batch)
            current_batch = []
            current_size = 0
        current_batch.append(chunk)
        current_size += chunk_size

    if current_batch:
        batches.append(current_batch)

    return batches


def _build_chunk_text(chunks: list[dict]) -> str:
    """Format chunks into a labeled text block for the LLM."""
    return "\n---\n".join(
        f"[{c['id']}]\n{c['content']}" for c in chunks
    )


async def _call_llm(client: anthropic.AsyncAnthropic, user_content: str) -> list[dict]:
    """Make a single LLM call with retry logic."""
    last_error: Exception | None = None

    for attempt in range(1 + config.LLM_MAX_RETRIES):
        try:
            message = await client.messages.create(
                model=config.LLM_MODEL,
                max_tokens=4096,
                temperature=0.3,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}],
                timeout=config.LLM_TIMEOUT_SECONDS,
            )
            raw = message.content[0].text
            parsed = parse_llm_json(raw)
            if not isinstance(parsed, list):
                raise ValueError(f"Expected JSON array, got {type(parsed).__name__}")
            return parsed
        except (anthropic.APIError, anthropic.APIConnectionError) as exc:
            last_error = exc
            logger.warning(
                "Claim extraction API error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
        except (ValueError, KeyError) as exc:
            last_error = exc
            logger.warning(
                "Claim extraction parse error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(1)

    raise RuntimeError(
        f"Claim extraction failed after {1 + config.LLM_MAX_RETRIES} attempts: {last_error}"
    )


def _cross_reference_entities(
    claims: list[dict],
    known_labels: set[str],
) -> list[dict]:
    """Validate entity label references and log warnings for mismatches.

    Does not remove unrecognized labels -- they may represent entities the
    extractor missed. Warnings help downstream consumers assess data quality.
    """
    known_lower = {label.lower() for label in known_labels}

    for claim in claims:
        for label in claim.get("entityLabels", []):
            if label.lower() not in known_lower:
                logger.warning(
                    "Claim references unknown entity %r: %s",
                    label, claim.get("statement", "")[:80],
                )

    return claims


async def extract_claims(
    chunks: list[dict],
    entities: list[dict],
    prompt: str,
) -> list[dict]:
    """Extract structured claims from document chunks using Claude.

    Args:
        chunks: List of dicts with keys ``id``, ``content``, and optionally ``evidenceId``.
        entities: Previously extracted entity dicts (used for cross-referencing).
        prompt: The user's analysis prompt providing extraction context.

    Returns:
        List of claim dicts, each with a unique ``id``, ``statement``,
        ``category``, ``confidence``, ``sentiment``, ``supportingChunkIds``,
        ``entityLabels``, ``counterclaim``, and ``stakes``.

    Raises:
        RuntimeError: If all LLM call attempts fail.
    """
    if not chunks:
        return []

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    batches = _batch_chunks(chunks)

    # Build entity context for the prompt
    entity_labels = [e.get("label", "") for e in entities]
    entity_summary = json.dumps(entity_labels, ensure_ascii=False)

    all_raw_claims: list[dict] = []

    for batch_idx, batch in enumerate(batches):
        logger.info(
            "Processing claim batch %d/%d (%d chunks)",
            batch_idx + 1, len(batches), len(batch),
        )
        user_content = (
            f"Analysis prompt: {prompt}\n\n"
            f"Known entities: {entity_summary}\n\n"
            f"Text chunks ({len(batch)} of {len(chunks)} total):\n"
            + _build_chunk_text(batch)
        )
        raw_claims = await _call_llm(client, user_content)
        all_raw_claims.extend(raw_claims)

    # Normalize, validate, and assign IDs
    valid_categories = {"factual", "predictive", "evaluative", "causal", "normative"}
    valid_stakes = {"low", "medium", "high", "critical"}
    known_label_set = {e.get("label", "") for e in entities}

    claims: list[dict] = []
    for raw in all_raw_claims:
        category = raw.get("category", "factual").lower().strip()
        if category not in valid_categories:
            category = "factual"

        stakes = raw.get("stakes", "medium").lower().strip()
        if stakes not in valid_stakes:
            stakes = "medium"

        confidence = raw.get("confidence", 0.5)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.5

        sentiment = raw.get("sentiment", 0.0)
        try:
            sentiment = max(-1.0, min(1.0, float(sentiment)))
        except (TypeError, ValueError):
            sentiment = 0.0

        counterclaim = raw.get("counterclaim")
        if counterclaim and not isinstance(counterclaim, str):
            counterclaim = str(counterclaim)

        claims.append({
            "id": generate_id("rf_clm"),
            "statement": raw.get("statement", "").strip(),
            "category": category,
            "confidence": round(confidence, 2),
            "sentiment": round(sentiment, 2),
            "supportingChunkIds": raw.get("supportingChunkIds", []),
            "entityLabels": raw.get("entityLabels", []),
            "counterclaim": counterclaim,
            "stakes": stakes,
        })

    # Cross-reference entity labels (warns on mismatches but keeps all data)
    claims = _cross_reference_entities(claims, known_label_set)

    logger.info("Extracted %d claims from %d chunks", len(claims), len(chunks))
    return claims
