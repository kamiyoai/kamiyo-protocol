"""Generate four canonical hypotheses for Reality Fork simulation.

Each hypothesis represents an alternative future trajectory: status_quo,
accelerant, backlash, and market_shock. Probabilities are validated and
normalized so they sum to approximately 1.0.
"""

from __future__ import annotations

import logging

import anthropic

from src import config
from src.utils import generate_id, parse_llm_json, truncate_for_context

logger = logging.getLogger(__name__)

HYPOTHESIS_IDS = ("status_quo", "accelerant", "backlash", "market_shock")

SYSTEM_PROMPT = """\
You are a strategic foresight analyst specializing in scenario planning and \
alternative futures analysis. Given entities, claims, scenario topics, and an \
analysis prompt, generate exactly 4 simulation hypotheses representing \
divergent future trajectories.

The four hypotheses MUST use these exact IDs:
  1. status_quo    — baseline continuation of current trends and dynamics
  2. accelerant    — a positive catalyst or breakthrough amplifies the dominant trend
  3. backlash      — opposition, regulation, or negative reaction reverses momentum
  4. market_shock  — an external disruption (geopolitical, technological, black swan) \
reshapes the entire landscape

For EACH hypothesis return a JSON object with:
  - "id": one of the four IDs above (status_quo, accelerant, backlash, market_shock)
  - "title": a compelling, descriptive name (5-10 words)
  - "stance": one of "bullish", "bearish", "neutral", "volatile"
  - "outcome": a vivid narrative of this future (2-3 sentences)
  - "probability": float 0.0-1.0 — the prior probability estimate. \
All four probabilities MUST sum to approximately 1.0.
  - "assumptions": array of 3-5 key assumptions that underpin this scenario
  - "triggerEvents": array of 2-3 specific events that would move reality toward this fork
  - "timeHorizon": one of "short" (weeks), "medium" (months), "long" (years)
  - "keyRisks": array of 2-3 risks or failure modes specific to this scenario

Return ONLY a JSON array of exactly 4 objects. No markdown fences, no commentary.\
"""


async def generate_hypotheses(
    entities: list[dict],
    claims: list[dict],
    topics: list[dict],
    prompt: str,
) -> list[dict]:
    """Call Claude to produce four hypothesis configurations.

    Args:
        entities: Extracted entity dicts from the evidence pipeline.
        claims: Extracted claim dicts from the evidence pipeline.
        topics: Scenario input / topic dicts provided by the user.
        prompt: The user's analysis prompt describing the scenario.

    Returns:
        A list of exactly 4 hypothesis dicts, each enriched with a unique
        ``id`` field and validated probability distribution.

    Raises:
        ValueError: If the LLM response cannot be parsed or fails validation
            after retries.
    """
    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    entities_ctx = truncate_for_context(entities, max_chars=25000)
    claims_ctx = truncate_for_context(claims, max_chars=25000)
    topics_ctx = truncate_for_context(topics, max_chars=15000)

    user_content = (
        f"Analysis prompt: {prompt}\n\n"
        f"Entities:\n{entities_ctx}\n\n"
        f"Claims:\n{claims_ctx}\n\n"
        f"Scenario topics:\n{topics_ctx}"
    )

    last_error: Exception | None = None

    for attempt in range(1, config.LLM_MAX_RETRIES + 2):
        try:
            message = await client.messages.create(
                model=config.LLM_MODEL,
                max_tokens=4096,
                temperature=0.5,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}],
            )

            raw = message.content[0].text
            hypotheses_raw: list[dict] = parse_llm_json(raw)
            hypotheses = _validate_and_normalize(hypotheses_raw)
            return hypotheses

        except Exception as exc:
            last_error = exc
            logger.warning(
                "Hypothesis generation attempt %d/%d failed: %s",
                attempt,
                config.LLM_MAX_RETRIES + 1,
                exc,
            )

    raise ValueError(
        f"Hypothesis generation failed after {config.LLM_MAX_RETRIES + 1} "
        f"attempts. Last error: {last_error}"
    )


def _validate_and_normalize(hypotheses_raw: list[dict]) -> list[dict]:
    """Validate hypothesis structure and normalize probabilities.

    Ensures exactly 4 hypotheses with the correct IDs and probabilities
    summing to approximately 1.0.

    Args:
        hypotheses_raw: Raw hypothesis dicts parsed from LLM output.

    Returns:
        List of 4 validated and normalized hypothesis dicts.

    Raises:
        ValueError: If the structure is invalid.
    """
    if not isinstance(hypotheses_raw, list) or len(hypotheses_raw) != 4:
        raise ValueError(
            f"Expected exactly 4 hypotheses, got {len(hypotheses_raw) if isinstance(hypotheses_raw, list) else type(hypotheses_raw).__name__}"
        )

    # Map by ID for validation
    by_id: dict[str, dict] = {}
    for h in hypotheses_raw:
        h_id = h.get("id", "")
        if h_id not in HYPOTHESIS_IDS:
            # Try to match by label field as fallback
            h_id = h.get("label", h_id)
        if h_id in HYPOTHESIS_IDS:
            by_id[h_id] = h

    if len(by_id) != 4:
        # If IDs don't match, assign them in order
        logger.warning(
            "Hypothesis IDs did not match expected set; assigning in order."
        )
        by_id = {}
        for i, h in enumerate(hypotheses_raw[:4]):
            by_id[HYPOTHESIS_IDS[i]] = h

    # Extract probabilities and normalize
    prob_sum = sum(
        float(by_id[hid].get("probability", 0.25)) for hid in HYPOTHESIS_IDS
    )

    if prob_sum < 0.8 or prob_sum > 1.2:
        logger.info(
            "Probability sum %.3f outside [0.8, 1.2]; normalizing.", prob_sum
        )

    # Always normalize for consistency
    normalize_factor = 1.0 / prob_sum if prob_sum > 0 else 0.25

    hypotheses: list[dict] = []
    for hid in HYPOTHESIS_IDS:
        h = by_id[hid]
        raw_prob = float(h.get("probability", 0.25))
        normalized_prob = round(raw_prob * normalize_factor, 4)

        hypotheses.append(
            {
                "id": generate_id("rf_hyp"),
                "label": hid,
                "title": h.get("title", hid.replace("_", " ").title()),
                "stance": h.get("stance", "neutral"),
                "outcome": h.get("outcome", h.get("description", "")),
                "probability": normalized_prob,
                "assumptions": h.get("assumptions", [])[:5],
                "triggerEvents": h.get("triggerEvents", [])[:3],
                "timeHorizon": h.get("timeHorizon", "medium"),
                "keyRisks": h.get("keyRisks", [])[:3],
            }
        )

    return hypotheses
