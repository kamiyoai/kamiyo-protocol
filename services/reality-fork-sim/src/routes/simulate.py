"""POST /simulate -- run Reality Fork simulation across four hypotheses.

Parallelizes lane simulations within each hypothesis and across all
hypotheses using asyncio.gather with a semaphore to cap concurrency.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import anthropic

from src import config
from src.report.decision_engine import pick_winner
from src.simulation.hypothesis_engine import generate_hypotheses
from src.simulation.scoring import compute_scorecard
from src.utils import generate_id, parse_llm_json, truncate_for_context

logger = logging.getLogger(__name__)
router = APIRouter()

# Global semaphore — limits concurrent LLM calls across all hypotheses/lanes.
_llm_semaphore = asyncio.Semaphore(8)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class SimulationConfig(BaseModel):
    """Configuration for the simulation run."""

    represented_population: int = Field(default=1000, alias="representedPopulation")
    active_agents: int = Field(default=20, alias="activeAgents")
    rounds: int = 5
    lanes: list[str] = Field(
        default_factory=lambda: [
            "x_lane",
            "reddit_lane",
            "market_lane",
            "public_opinion",
        ]
    )

    model_config = {"populate_by_name": True}


class SimulateRequest(BaseModel):
    """Incoming simulation request payload."""

    project_id: str = Field(alias="projectId")
    prompt: str
    entities: list[dict]
    claims: list[dict]
    scenario_inputs: list[dict] = Field(alias="scenarioInputs")
    simulation_config: SimulationConfig = Field(
        default_factory=SimulationConfig, alias="simulationConfig"
    )

    model_config = {"populate_by_name": True}


class SimulateResponse(BaseModel):
    """Simulation response containing lane rounds, simulations, and decision."""

    lane_rounds: list[dict] = Field(alias="laneRounds")
    simulations: list[dict]
    decision: dict

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Lane-specific simulation guidance
# ---------------------------------------------------------------------------

_LANE_GUIDANCE: dict[str, str] = {
    "x_lane": (
        "Model Twitter/X dynamics: virality cascades, ratio patterns, "
        "quote-tweet amplification, narrative capture by influencers, "
        "hashtag momentum, and bot-driven sentiment distortion."
    ),
    "reddit_lane": (
        "Model Reddit dynamics: subreddit community reactions, upvote/downvote "
        "sentiment clustering, long-form debate quality, AMA-driven revelations, "
        "cross-posting between communities, and moderator intervention effects."
    ),
    "market_lane": (
        "Model market dynamics: price sentiment shifts, trading volume surges, "
        "institutional vs retail positioning, options flow signals, "
        "sector contagion, and analyst narrative changes."
    ),
    "public_opinion": (
        "Model general public opinion dynamics: media framing effects, "
        "poll movement, demographic splits, elite vs populist sentiment, "
        "attention fatigue, and narrative simplification over time."
    ),
}

_DEFAULT_LANE_GUIDANCE = (
    "Model social dynamics in this domain: sentiment evolution, "
    "key actor behaviours, narrative shifts, and emergent patterns."
)


def _lane_label(lane: str) -> str:
    """Return a human-readable label for a lane identifier."""
    return lane.replace("_", " ").title()


def _compute_time_per_round(rounds: int, population: int) -> str:
    """Estimate the real-world time each simulation round represents.

    Heuristic: larger populations and more rounds imply longer timeframes.
    """
    if rounds >= 20 and population >= 100:
        return "approximately 1 week"
    if rounds >= 10:
        return "approximately 3-4 days"
    if rounds >= 5 and population >= 50:
        return "approximately 1 week"
    return "approximately 2-3 days"


def _build_lane_system_prompt(lane: str, rounds: int, time_per_round: str) -> str:
    """Build the system prompt for a lane simulation call."""
    guidance = _LANE_GUIDANCE.get(lane, _DEFAULT_LANE_GUIDANCE)
    label = _lane_label(lane)

    return f"""\
You are a social simulation engine modeling how {label} would react to a \
scenario over {rounds} rounds. Each round represents {time_per_round} of \
real-world time.

{guidance}

IMPORTANT CONSTRAINTS:
- Each round should causally follow from the previous. Sentiment shifts should \
be gradual unless a trigger event causes a sharp change.
- Maintain internal consistency: if round N introduces an event, round N+1 must \
acknowledge its consequences.
- Ground your simulation in realistic dynamics, not random fluctuation.

For each round return a JSON object with:
  - "round": integer round number (1-based)
  - "sentiment": float -1.0 to 1.0 (negative = bearish/hostile, positive = bullish/supportive)
  - "conviction": float 0.0 to 1.0 (how strongly agents hold their positions)
  - "salience": float 0.0 to 1.0 (how prominent this topic is in discourse)
  - "summary": 1-2 sentence description of what happens this round
  - "keyEvents": array of 2-3 event objects, each with:
    - "actor": who initiated the event
    - "action": what they did
    - "impact": consequence or ripple effect

Return ONLY a JSON object: {{"rounds": [...]}}
No markdown fences, no commentary outside the JSON.\
"""


# ---------------------------------------------------------------------------
# LLM-based lane simulation with retry and semaphore
# ---------------------------------------------------------------------------


async def _simulate_lane_llm(
    hypothesis: dict,
    lane: str,
    entities: list[dict],
    claims: list[dict],
    rounds: int,
    prompt: str,
    time_per_round: str,
) -> dict:
    """Simulate one lane for one hypothesis using Claude.

    Acquires the global semaphore before making the LLM call. Retries
    up to ``config.LLM_MAX_RETRIES`` times on failure.

    Args:
        hypothesis: The hypothesis dict to simulate under.
        lane: Lane identifier (e.g. ``x_lane``).
        entities: Entity dicts from the evidence pipeline.
        claims: Claim dicts from the evidence pipeline.
        rounds: Number of simulation rounds.
        prompt: The user's analysis prompt.
        time_per_round: Human-readable time per round string.

    Returns:
        A lane round dict containing hypothesis label, lane, and round data.

    Raises:
        RuntimeError: If all retry attempts are exhausted.
    """
    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    system_prompt = _build_lane_system_prompt(lane, rounds, time_per_round)

    entity_names = [e.get("name", "") for e in entities[:15] if e.get("name")]
    claim_statements = [c.get("statement", "") for c in claims[:10] if c.get("statement")]

    user_content = (
        f"Analysis prompt: {prompt}\n\n"
        f"Hypothesis: {hypothesis.get('label')} — {hypothesis.get('title')}\n"
        f"Outcome: {hypothesis.get('outcome', hypothesis.get('description', ''))}\n"
        f"Assumptions: {json.dumps(hypothesis.get('assumptions', []))}\n"
        f"Trigger events: {json.dumps(hypothesis.get('triggerEvents', []))}\n"
        f"Time horizon: {hypothesis.get('timeHorizon', 'medium')}\n\n"
        f"Lane: {_lane_label(lane)}\n"
        f"Number of rounds: {rounds}\n"
        f"Time per round: {time_per_round}\n\n"
        f"Key entities: {json.dumps(entity_names)}\n"
        f"Key claims: {json.dumps(claim_statements)}"
    )

    last_error: Exception | None = None

    for attempt in range(1, config.LLM_MAX_RETRIES + 2):
        try:
            async with _llm_semaphore:
                message = await client.messages.create(
                    model=config.LLM_MODEL,
                    max_tokens=3000,
                    temperature=0.6,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_content}],
                    timeout=config.LLM_TIMEOUT_SECONDS,
                )

            raw = message.content[0].text
            result = parse_llm_json(raw)
            parsed_rounds = result.get("rounds", []) if isinstance(result, dict) else result

            # Validate round structure
            validated_rounds = []
            for r in parsed_rounds:
                validated_rounds.append(
                    {
                        "round": r.get("round", len(validated_rounds) + 1),
                        "sentiment": _clamp_float(r.get("sentiment", 0.0), -1.0, 1.0),
                        "conviction": _clamp_float(r.get("conviction", 0.5), 0.0, 1.0),
                        "salience": _clamp_float(r.get("salience", 0.5), 0.0, 1.0),
                        "summary": r.get("summary", r.get("narrative", "")),
                        "keyEvents": r.get("keyEvents", [])[:3],
                    }
                )

            return {
                "id": generate_id("rf_lr"),
                "hypothesisLabel": hypothesis["label"],
                "lane": lane,
                "rounds": validated_rounds,
            }

        except Exception as exc:
            last_error = exc
            logger.warning(
                "Lane sim %s/%s attempt %d/%d failed: %s",
                hypothesis.get("label"),
                lane,
                attempt,
                config.LLM_MAX_RETRIES + 1,
                exc,
            )

    raise RuntimeError(
        f"Lane simulation {hypothesis.get('label')}/{lane} failed after "
        f"{config.LLM_MAX_RETRIES + 1} attempts. Last error: {last_error}"
    )


def _clamp_float(value: Any, lo: float, hi: float) -> float:
    """Clamp a value to [lo, hi], defaulting to the midpoint on error."""
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return (lo + hi) / 2


# ---------------------------------------------------------------------------
# Parallel simulation orchestration
# ---------------------------------------------------------------------------


async def _simulate_hypothesis(
    hypothesis: dict,
    lanes: list[str],
    entities: list[dict],
    claims: list[dict],
    rounds: int,
    prompt: str,
    time_per_round: str,
) -> tuple[list[dict], dict]:
    """Run all lane simulations for a single hypothesis in parallel.

    Args:
        hypothesis: The hypothesis to simulate.
        lanes: List of lane identifiers to simulate.
        entities: Entity dicts from the evidence pipeline.
        claims: Claim dicts from the evidence pipeline.
        rounds: Number of simulation rounds.
        prompt: The user's analysis prompt.
        time_per_round: Human-readable time per round string.

    Returns:
        A tuple of (lane_rounds_list, simulation_dict) for this hypothesis.
    """
    lane_tasks = [
        _simulate_lane_llm(
            hypothesis=hypothesis,
            lane=lane,
            entities=entities,
            claims=claims,
            rounds=rounds,
            prompt=prompt,
            time_per_round=time_per_round,
        )
        for lane in lanes
    ]

    hyp_lane_rounds: list[dict] = await asyncio.gather(*lane_tasks)

    scorecard = compute_scorecard({"laneRounds": hyp_lane_rounds})

    simulation = {
        "id": generate_id("rf_sim"),
        "label": hypothesis["label"],
        "title": hypothesis["title"],
        "stance": hypothesis.get("stance", "neutral"),
        "outcome": hypothesis.get("outcome", hypothesis.get("description", "")),
        "probability": hypothesis.get("probability", 0.25),
        "assumptions": hypothesis.get("assumptions", []),
        "triggerEvents": hypothesis.get("triggerEvents", []),
        "timeHorizon": hypothesis.get("timeHorizon", "medium"),
        "keyRisks": hypothesis.get("keyRisks", []),
        "laneRoundIds": [lr["id"] for lr in hyp_lane_rounds],
        "scorecard": scorecard,
    }

    return hyp_lane_rounds, simulation


async def _run_llm_simulation(
    hypotheses: list[dict],
    entities: list[dict],
    claims: list[dict],
    sim_config: SimulationConfig,
    prompt: str,
) -> tuple[list[dict], list[dict]]:
    """Run full LLM-based simulation across all hypotheses and lanes in parallel.

    Up to 16 concurrent LLM calls (4 hypotheses x 4 lanes), throttled by
    the module-level semaphore (default cap: 8).

    Args:
        hypotheses: List of 4 hypothesis dicts.
        entities: Entity dicts from the evidence pipeline.
        claims: Claim dicts from the evidence pipeline.
        sim_config: Simulation configuration (rounds, lanes, population).
        prompt: The user's analysis prompt.

    Returns:
        A tuple of (all_lane_rounds, simulations) lists.
    """
    time_per_round = _compute_time_per_round(
        sim_config.rounds, sim_config.represented_population
    )

    hypothesis_tasks = [
        _simulate_hypothesis(
            hypothesis=hyp,
            lanes=sim_config.lanes,
            entities=entities,
            claims=claims,
            rounds=sim_config.rounds,
            prompt=prompt,
            time_per_round=time_per_round,
        )
        for hyp in hypotheses
    ]

    results: list[tuple[list[dict], dict]] = await asyncio.gather(*hypothesis_tasks)

    all_lane_rounds: list[dict] = []
    simulations: list[dict] = []

    for hyp_lane_rounds, simulation in results:
        all_lane_rounds.extend(hyp_lane_rounds)
        simulations.append(simulation)

    return all_lane_rounds, simulations


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest) -> SimulateResponse:
    """Run a full Reality Fork simulation.

    1. Generates 4 hypotheses from the input data.
    2. Simulates each hypothesis across all configured lanes in parallel.
    3. Scores each simulation and picks a winner.

    Returns lane round data, simulation results, and the decision.
    """
    if not req.entities and not req.claims:
        raise HTTPException(
            status_code=400,
            detail="At least entities or claims must be provided.",
        )

    # Step 1: Generate hypotheses
    logger.info("Generating hypotheses for project %s", req.project_id)
    hypotheses = await generate_hypotheses(
        entities=req.entities,
        claims=req.claims,
        topics=req.scenario_inputs,
        prompt=req.prompt,
    )

    # Step 2: Run simulation
    if config.OASIS_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="OASIS simulation not yet implemented. Set OASIS_ENABLED=false.",
        )

    logger.info(
        "Running LLM simulation: %d hypotheses x %d lanes x %d rounds",
        len(hypotheses),
        len(req.simulation_config.lanes),
        req.simulation_config.rounds,
    )
    lane_rounds, simulations = await _run_llm_simulation(
        hypotheses=hypotheses,
        entities=req.entities,
        claims=req.claims,
        sim_config=req.simulation_config,
        prompt=req.prompt,
    )

    # Step 3: Pick a winner
    decision = pick_winner(simulations)
    logger.info("Simulation complete. Winner: %s", decision.get("winnerLabel"))

    return SimulateResponse(
        laneRounds=lane_rounds,
        simulations=simulations,
        decision=decision,
    )
