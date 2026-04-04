"""Pick the winning simulation hypothesis based on scorecard metrics.

Uses a composite scoring formula that weights overall score, confidence,
and probability to select the most likely and well-supported scenario.
"""

from __future__ import annotations

from src.utils import generate_id


def pick_winner(simulations: list[dict]) -> dict:
    """Select the best-performing hypothesis from simulation results.

    Composite formula:
        composite = overall * 0.6 + confidence * overall * 0.2 + probability * 0.2

    This weights raw simulation performance (60%), confidence-adjusted
    performance (20%), and prior probability (20%).

    Args:
        simulations: List of simulation dicts, each expected to have:
            - label, title, outcome
            - probability (0-1 prior estimate from hypothesis)
            - scorecard: {overallScore, confidence, metrics, summary}

    Returns:
        A decision dict with the winning simulation, scores, and rationale.
    """
    if not simulations:
        return {
            "id": generate_id("rf_dec"),
            "winnerLabel": None,
            "winnerTitle": "No simulations available",
            "rationale": "No simulation data was provided to evaluate.",
            "scores": [],
            "confidence": 0.0,
        }

    scored: list[dict] = []
    for sim in simulations:
        scorecard = sim.get("scorecard", {})
        overall = scorecard.get("overallScore", 0.0)
        confidence = scorecard.get("confidence", 0.0)
        probability = sim.get("probability", 0.25)

        # Composite: 60% raw score + 20% confidence-weighted score + 20% prior
        composite = overall * 0.6 + confidence * overall * 0.2 + probability * 0.2

        scored.append(
            {
                "label": sim.get("label", "unknown"),
                "title": sim.get("title", ""),
                "overallScore": round(overall, 2),
                "confidence": round(confidence, 4),
                "probability": round(probability, 4),
                "composite": round(composite, 2),
            }
        )

    scored.sort(key=lambda s: s["composite"], reverse=True)
    winner = scored[0]

    runner_up = scored[1] if len(scored) > 1 else None
    margin = (
        round(winner["composite"] - runner_up["composite"], 2)
        if runner_up
        else winner["composite"]
    )

    rationale = (
        f"'{winner['title']}' ({winner['label']}) achieved the highest composite "
        f"score of {winner['composite']:.1f} (overall: {winner['overallScore']:.1f}, "
        f"confidence: {winner['confidence']:.2f}, prior: {winner['probability']:.2f})."
    )
    if runner_up:
        rationale += (
            f" It led the runner-up '{runner_up['title']}' ({runner_up['label']}) "
            f"by a margin of {margin:.1f} points."
        )

    return {
        "id": generate_id("rf_dec"),
        "winnerLabel": winner["label"],
        "winnerTitle": winner["title"],
        "rationale": rationale,
        "scores": scored,
        "confidence": winner["confidence"],
        "margin": margin,
    }
