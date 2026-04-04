"""Compute a scorecard for a completed simulation run."""

from __future__ import annotations

from src.utils import generate_id


def compute_scorecard(simulation_result: dict) -> dict:
    """Produce a scorecard dict from a simulation result.

    The scorecard mirrors the TypeScript ``StudioSimulationScorecard`` type:
      - overallScore (0-100)
      - confidence (0.0-1.0)
      - metrics: array of {name, value, weight, normalised}
      - summary: textual summary
    """
    lane_rounds: list[dict] = simulation_result.get("laneRounds", [])

    if not lane_rounds:
        return _empty_scorecard()

    # Aggregate sentiment, conviction, salience across all rounds
    sentiments: list[float] = []
    convictions: list[float] = []
    saliences: list[float] = []

    for lr in lane_rounds:
        for r in lr.get("rounds", []):
            sentiments.append(r.get("sentiment", 0.0))
            convictions.append(r.get("conviction", 0.0))
            saliences.append(r.get("salience", 0.0))

    avg_sentiment = _safe_mean(sentiments)
    avg_conviction = _safe_mean(convictions)
    avg_salience = _safe_mean(saliences)

    # Normalise each metric to 0-100 scale
    norm_sentiment = _clamp((avg_sentiment + 1) / 2 * 100)  # -1..1 -> 0..100
    norm_conviction = _clamp(avg_conviction * 100)            # 0..1 -> 0..100
    norm_salience = _clamp(avg_salience * 100)                # 0..1 -> 0..100

    # Weight rationale:
    # - Sentiment (0.4): strongest signal; captures overall directional stance
    #   of agents across the simulation, most directly maps to outcome favorability.
    # - Conviction (0.35): measures how strongly agents hold their positions,
    #   reflecting argument strength and resistance to counter-evidence.
    # - Salience (0.25): measures relevance/importance of the topic to agents;
    #   lower weight because high salience alone doesn't indicate direction.
    weights = {"sentiment": 0.4, "conviction": 0.35, "salience": 0.25}

    overall = (
        norm_sentiment * weights["sentiment"]
        + norm_conviction * weights["conviction"]
        + norm_salience * weights["salience"]
    )

    confidence = min(1.0, len(lane_rounds) / 4)  # More lanes = higher confidence

    metrics = [
        {
            "name": "sentiment",
            "value": round(avg_sentiment, 4),
            "weight": weights["sentiment"],
            "normalised": round(norm_sentiment, 2),
        },
        {
            "name": "conviction",
            "value": round(avg_conviction, 4),
            "weight": weights["conviction"],
            "normalised": round(norm_conviction, 2),
        },
        {
            "name": "salience",
            "value": round(avg_salience, 4),
            "weight": weights["salience"],
            "normalised": round(norm_salience, 2),
        },
    ]

    return {
        "id": generate_id("rf_scr"),
        "overallScore": round(overall, 2),
        "confidence": round(confidence, 4),
        "metrics": metrics,
        "summary": (
            f"Overall score {overall:.1f}/100 "
            f"(sentiment={avg_sentiment:+.2f}, "
            f"conviction={avg_conviction:.2f}, "
            f"salience={avg_salience:.2f}). "
            f"Based on {len(lane_rounds)} lanes."
        ),
    }


def _empty_scorecard() -> dict:
    """Return a zero-value scorecard when no lane rounds are available."""
    return {
        "id": generate_id("rf_scr"),
        "overallScore": 0,
        "confidence": 0,
        "metrics": [],
        "summary": "No lane rounds available for scoring.",
    }


def _safe_mean(values: list[float]) -> float:
    """Compute the arithmetic mean, returning 0.0 for empty lists."""
    return sum(values) / len(values) if values else 0.0


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp a value between lo and hi."""
    return max(lo, min(hi, v))
