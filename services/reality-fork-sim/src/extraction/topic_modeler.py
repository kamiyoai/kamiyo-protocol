"""Derive scenario topics (simulation fork points) from entities and claims using Claude.

Uses context-window-aware truncation to avoid overflowing the model's input,
validates topic count constraints, and applies robust JSON parsing with retries.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import anthropic

from src import config
from src.utils import generate_id, parse_llm_json, truncate_for_context

logger = logging.getLogger(__name__)

MIN_TOPICS = 3
MAX_TOPICS = 6

SYSTEM_PROMPT = """\
You are a strategic scenario planner and futures analyst. Given extracted entities, \
claims, and an analysis prompt, derive scenario topics that represent genuine \
fork points -- places where reality could diverge in meaningfully different directions.

Return ONLY a JSON array with exactly {min_topics} to {max_topics} elements. \
Each element must have exactly these fields:

- "topic": short label for this scenario dimension (3-8 words)
- "summary": 2-3 sentence description of what this scenario dimension covers and why it matters
- "tension": what makes this a genuine fork point -- describe the opposing forces, \
  competing outcomes, or fundamental uncertainty (NOT just a restatement of the topic)
- "relevantClaimIds": array of claim IDs from the input that inform this topic (use the exact IDs provided)
- "relevantEntityLabels": array of entity labels most involved in this fork point
- "weight": float 0.0-1.0 indicating how central this topic is to the overall decision/analysis. \
  Calibration: 1.0 = this single dimension could change the entire outcome; \
  0.5 = important but one of several factors; 0.2 = relevant but peripheral.

Rules:
- Topics must represent DISTINCT dimensions -- avoid overlapping or redundant topics.
- Every topic must have a genuine tension (two or more plausible outcomes), not just a description of a trend.
- Weights should sum to roughly 1.0 across all topics (they represent relative importance).
- Reference actual claim IDs and entity labels from the provided data.
- Do NOT wrap your response in markdown fences or add any text outside the JSON array.
""".format(min_topics=MIN_TOPICS, max_topics=MAX_TOPICS)

ELABORATION_PROMPT = """\
Your previous response contained fewer than {min_topics} scenario topics. The analysis \
requires at least {min_topics} distinct fork points. Please review the entities and claims \
again and identify additional dimensions of uncertainty or divergence.

Return a complete JSON array with {min_topics} to {max_topics} topics (including any good \
ones from your previous response, plus new ones). Use the same schema as before.
""".format(min_topics=MIN_TOPICS, max_topics=MAX_TOPICS)


def _build_context(
    entities: list[dict],
    claims: list[dict],
) -> tuple[str, str]:
    """Build truncated context strings for entities and claims.

    Reserves roughly 40k chars for entities and 40k for claims to stay
    well within model context limits even with the system prompt overhead.
    """
    entities_json = truncate_for_context(entities, max_chars=40_000)
    claims_json = truncate_for_context(claims, max_chars=40_000)
    return entities_json, claims_json


async def _call_llm(
    client: anthropic.AsyncAnthropic,
    system: str,
    user_content: str,
) -> list[dict]:
    """Make a single LLM call with retry logic."""
    last_error: Exception | None = None

    for attempt in range(1 + config.LLM_MAX_RETRIES):
        try:
            message = await client.messages.create(
                model=config.LLM_MODEL,
                max_tokens=4096,
                temperature=0.4,
                system=system,
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
                "Topic derivation API error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
        except (ValueError, KeyError) as exc:
            last_error = exc
            logger.warning(
                "Topic derivation parse error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(1)

    raise RuntimeError(
        f"Topic derivation failed after {1 + config.LLM_MAX_RETRIES} attempts: {last_error}"
    )


def _validate_claim_refs(topics: list[dict], valid_claim_ids: set[str]) -> list[dict]:
    """Filter out claim IDs that don't exist in the actual claims data."""
    for topic in topics:
        original_refs = topic.get("relevantClaimIds", [])
        valid_refs = [cid for cid in original_refs if cid in valid_claim_ids]
        if len(valid_refs) < len(original_refs):
            dropped = len(original_refs) - len(valid_refs)
            logger.warning(
                "Topic %r: dropped %d invalid claim refs (kept %d)",
                topic.get("topic", "?"), dropped, len(valid_refs),
            )
        topic["relevantClaimIds"] = valid_refs
    return topics


async def derive_scenario_topics(
    entities: list[dict],
    claims: list[dict],
    prompt: str,
) -> list[dict]:
    """Derive scenario fork-point topics from extracted entities and claims.

    Args:
        entities: Previously extracted entity dicts.
        claims: Previously extracted claim dicts.
        prompt: The user's analysis prompt providing context.

    Returns:
        List of 3-6 topic dicts, each with a unique ``id``, ``topic``,
        ``summary``, ``tension``, ``relevantClaimIds``, ``relevantEntityLabels``,
        and ``weight``.

    Raises:
        RuntimeError: If all LLM call attempts fail.
    """
    if not entities and not claims:
        return []

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    entities_json, claims_json = _build_context(entities, claims)

    user_content = (
        f"Analysis prompt: {prompt}\n\n"
        f"Extracted entities ({len(entities)} total):\n{entities_json}\n\n"
        f"Extracted claims ({len(claims)} total):\n{claims_json}"
    )

    raw_topics = await _call_llm(client, SYSTEM_PROMPT, user_content)

    # Enforce minimum topic count: ask the model to elaborate if too few
    if len(raw_topics) < MIN_TOPICS:
        logger.info(
            "Got %d topics (min %d), requesting elaboration",
            len(raw_topics), MIN_TOPICS,
        )
        elaboration_content = (
            f"Previous topics:\n{truncate_for_context(raw_topics, max_chars=10_000)}\n\n"
            + user_content
        )
        try:
            raw_topics = await _call_llm(client, ELABORATION_PROMPT, elaboration_content)
        except RuntimeError:
            logger.warning("Elaboration failed, proceeding with %d topics", len(raw_topics))

    # Enforce maximum: take top N by weight
    if len(raw_topics) > MAX_TOPICS:
        logger.info("Got %d topics, trimming to top %d by weight", len(raw_topics), MAX_TOPICS)
        raw_topics.sort(key=lambda t: t.get("weight", 0.0), reverse=True)
        raw_topics = raw_topics[:MAX_TOPICS]

    # Build valid claim ID set for reference validation
    valid_claim_ids = {c["id"] for c in claims if "id" in c}

    # Normalize and assign IDs
    topics: list[dict] = []
    for raw in raw_topics:
        weight = raw.get("weight", 0.5)
        try:
            weight = max(0.0, min(1.0, float(weight)))
        except (TypeError, ValueError):
            weight = 0.5

        topics.append({
            "id": generate_id("rf_sci"),
            "topic": raw.get("topic", "").strip(),
            "summary": raw.get("summary", raw.get("description", "")).strip(),
            "tension": raw.get("tension", "").strip(),
            "relevantClaimIds": raw.get("relevantClaimIds", []),
            "relevantEntityLabels": raw.get("relevantEntityLabels", []),
            "weight": round(weight, 2),
        })

    # Validate claim references against actual data
    topics = _validate_claim_refs(topics, valid_claim_ids)

    logger.info("Derived %d scenario topics", len(topics))
    return topics
