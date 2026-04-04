"""Generate a comprehensive Reality Fork report using multi-step LLM calls.

The report is assembled from several independent LLM calls for quality:
  1. Executive summary
  2. Report sections (one call per section topic)
  3. Lane summaries
  4. Scenario comparison
  5. Social card + quality metrics (pure Python)
  6. Final assembly with markdown/HTML generation
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import anthropic

from src import config
from src.utils import generate_id, parse_llm_json, truncate_for_context

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM call helper with retry
# ---------------------------------------------------------------------------


async def _llm_call(
    client: anthropic.AsyncAnthropic,
    system: str,
    user_content: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> dict:
    """Make a single LLM call with retry logic.

    Args:
        client: The async Anthropic client instance.
        system: System prompt for the call.
        user_content: User message content.
        max_tokens: Maximum tokens in the response.
        temperature: Sampling temperature.

    Returns:
        Parsed JSON dict from the LLM response.

    Raises:
        RuntimeError: If all retry attempts are exhausted.
    """
    last_error: Exception | None = None

    for attempt in range(1, config.LLM_MAX_RETRIES + 2):
        try:
            message = await client.messages.create(
                model=config.LLM_MODEL_LARGE,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": user_content}],
                timeout=config.LLM_TIMEOUT_SECONDS,
            )
            raw = message.content[0].text
            return parse_llm_json(raw)

        except Exception as exc:
            last_error = exc
            logger.warning(
                "Report LLM call attempt %d/%d failed: %s",
                attempt,
                config.LLM_MAX_RETRIES + 1,
                exc,
            )

    raise RuntimeError(
        f"Report LLM call failed after {config.LLM_MAX_RETRIES + 1} "
        f"attempts. Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# Step 1: Executive Summary
# ---------------------------------------------------------------------------

_EXEC_SUMMARY_SYSTEM = """\
You are a senior analyst writing an executive summary for a Reality Fork \
simulation report. Be concise, authoritative, and insight-driven.

Given the analysis prompt, winning scenario decision, top claims, and \
simulation outcome summaries, produce:

Return ONLY a JSON object with:
  - "headline": a punchy, informative headline (max 15 words)
  - "summary": 3-5 sentence executive summary capturing the key finding
  - "executiveSummary": a detailed executive summary paragraph (150-250 words) \
covering methodology, key findings, and implications

No markdown fences.\
"""


async def _generate_executive_summary(
    client: anthropic.AsyncAnthropic,
    data: dict,
) -> dict:
    """Generate the executive summary section.

    Args:
        client: Anthropic client.
        data: Full pipeline data dict.

    Returns:
        Dict with headline, summary, and executiveSummary keys.
    """
    decision = data.get("decision", {})
    claims_ctx = truncate_for_context(data.get("claims", []), max_chars=10000)
    sims = data.get("simulations", [])
    sim_summaries = [
        {
            "label": s.get("label"),
            "title": s.get("title"),
            "score": s.get("scorecard", {}).get("overallScore", 0),
            "summary": s.get("scorecard", {}).get("summary", ""),
        }
        for s in sims
    ]

    user_content = (
        f"Analysis prompt: {data.get('prompt', 'General analysis')}\n\n"
        f"Decision winner: {decision.get('winnerLabel', 'N/A')} — "
        f"{decision.get('winnerTitle', 'N/A')}\n"
        f"Decision rationale: {decision.get('rationale', 'N/A')}\n\n"
        f"Top claims:\n{claims_ctx}\n\n"
        f"Simulation outcomes:\n{json.dumps(sim_summaries, indent=2)}"
    )

    return await _llm_call(client, _EXEC_SUMMARY_SYSTEM, user_content, max_tokens=2048)


# ---------------------------------------------------------------------------
# Step 2: Report Sections
# ---------------------------------------------------------------------------

_SECTION_SYSTEM = """\
You are an expert analyst writing one section of a Reality Fork simulation \
report. Write with depth, nuance, and evidence-based reasoning.

Return ONLY a JSON object with:
  - "title": section title
  - "body": section body text (400-800 words). Use clear paragraphs. \
Reference specific entities, claims, and simulation outcomes where relevant.
  - "citations": array of evidence IDs or claim references that support this section

No markdown fences.\
"""


async def _generate_section(
    client: anthropic.AsyncAnthropic,
    topic: str,
    data: dict,
) -> dict:
    """Generate a single report section for a given topic.

    Args:
        client: Anthropic client.
        topic: The section topic to write about.
        data: Full pipeline data dict.

    Returns:
        Dict with title, body, and citations keys.
    """
    entities_ctx = truncate_for_context(data.get("entities", []), max_chars=8000)
    claims_ctx = truncate_for_context(data.get("claims", []), max_chars=8000)
    sims = data.get("simulations", [])
    sim_ctx = json.dumps(
        [
            {
                "label": s.get("label"),
                "title": s.get("title"),
                "outcome": s.get("outcome", s.get("description", "")),
                "score": s.get("scorecard", {}).get("overallScore", 0),
            }
            for s in sims
        ],
        indent=2,
    )

    user_content = (
        f"Analysis prompt: {data.get('prompt', 'General analysis')}\n\n"
        f"Section topic: {topic}\n\n"
        f"Entities:\n{entities_ctx}\n\n"
        f"Claims:\n{claims_ctx}\n\n"
        f"Simulation outcomes:\n{sim_ctx}"
    )

    return await _llm_call(
        client, _SECTION_SYSTEM, user_content, max_tokens=3000, temperature=0.4
    )


def _derive_section_topics(data: dict) -> list[str]:
    """Derive 3-5 section topics from scenario inputs and claims.

    Args:
        data: Full pipeline data dict.

    Returns:
        List of topic strings for section generation.
    """
    topics: list[str] = []

    # From scenario inputs
    for si in data.get("scenarioInputs", []):
        label = si.get("label") or si.get("title") or si.get("topic")
        if label and label not in topics:
            topics.append(label)

    # From high-confidence claims
    for c in data.get("claims", []):
        category = c.get("category", "")
        if category and category not in topics:
            topics.append(category)

    # Ensure at least 3 topics
    defaults = [
        "Stakeholder Impact Analysis",
        "Risk and Opportunity Assessment",
        "Strategic Implications",
        "Market and Sentiment Dynamics",
        "Future Trajectory Analysis",
    ]
    for d in defaults:
        if len(topics) >= 5:
            break
        if d not in topics:
            topics.append(d)

    return topics[:5]


# ---------------------------------------------------------------------------
# Step 3: Lane Summaries
# ---------------------------------------------------------------------------

_LANE_SUMMARY_SYSTEM = """\
You are an analyst summarizing simulation lane data. For each lane, provide \
a narrative summary of how sentiment, conviction, and salience evolved across \
rounds. Identify key turning points and explain causal drivers.

Return ONLY a JSON object with:
  - "laneSummaries": array of objects, each with:
    - "lane": lane identifier
    - "narrative": 2-4 sentence narrative of the lane's arc
    - "sentimentArc": brief description of sentiment trajectory
    - "keyTurningPoints": array of 1-3 turning point descriptions

No markdown fences.\
"""


async def _generate_lane_summaries(
    client: anthropic.AsyncAnthropic,
    lane_rounds: list[dict],
) -> list[dict]:
    """Generate narrative summaries for each simulation lane.

    Args:
        client: Anthropic client.
        lane_rounds: List of lane round dicts from simulation.

    Returns:
        List of lane summary dicts.
    """
    lane_ctx = truncate_for_context(lane_rounds, max_chars=30000)

    user_content = f"Lane simulation data:\n{lane_ctx}"

    result = await _llm_call(
        client, _LANE_SUMMARY_SYSTEM, user_content, max_tokens=2048
    )
    return result.get("laneSummaries", [])


# ---------------------------------------------------------------------------
# Step 4: Scenario Comparison
# ---------------------------------------------------------------------------

_COMPARISON_SYSTEM = """\
You are a strategic analyst performing a comparative analysis of 4 simulated \
scenarios. Evaluate their relative strengths, weaknesses, and likelihood.

Return ONLY a JSON object with:
  - "comparison": array of 4 objects, each with:
    - "label": scenario label
    - "title": scenario title
    - "overallAssessment": 2-3 sentence assessment
    - "strengths": array of 2-3 strengths
    - "weaknesses": array of 2-3 weaknesses
  - "winnerRationale": paragraph explaining why the winner outperforms others
  - "runnerUpAnalysis": paragraph on the closest alternative and what could tip \
the balance

No markdown fences.\
"""


async def _generate_scenario_comparison(
    client: anthropic.AsyncAnthropic,
    simulations: list[dict],
    decision: dict,
) -> dict:
    """Generate comparative analysis across all 4 simulations.

    Args:
        client: Anthropic client.
        simulations: List of simulation result dicts.
        decision: Decision dict with winner information.

    Returns:
        Dict with comparison array, winnerRationale, and runnerUpAnalysis.
    """
    sim_ctx = json.dumps(
        [
            {
                "label": s.get("label"),
                "title": s.get("title"),
                "outcome": s.get("outcome", s.get("description", "")),
                "probability": s.get("probability", 0.25),
                "scorecard": s.get("scorecard", {}),
                "assumptions": s.get("assumptions", []),
                "keyRisks": s.get("keyRisks", []),
            }
            for s in simulations
        ],
        indent=2,
    )

    user_content = (
        f"Simulations:\n{sim_ctx}\n\n"
        f"Decision:\n{json.dumps(decision, indent=2)}"
    )

    return await _llm_call(
        client, _COMPARISON_SYSTEM, user_content, max_tokens=2048
    )


# ---------------------------------------------------------------------------
# Step 5: Social Card + Quality Metrics (pure Python)
# ---------------------------------------------------------------------------


def _build_social_card(
    headline: str,
    winner_title: str,
    winner_score: float,
    total_lanes: int,
) -> dict:
    """Build a social sharing card from report metadata.

    Args:
        headline: The report headline.
        winner_title: Title of the winning scenario.
        winner_score: Overall score of the winning scenario.
        total_lanes: Total number of lanes simulated.

    Returns:
        Dict with title, subtitle, stat, and statLabel keys.
    """
    return {
        "title": headline,
        "subtitle": f"Winning scenario: {winner_title}",
        "stat": f"{winner_score:.0f}",
        "statLabel": f"Score across {total_lanes} lanes",
    }


def _compute_quality_metrics(
    sections: list[dict],
    entities: list[dict],
    claims: list[dict],
    lane_rounds: list[dict],
) -> dict:
    """Compute quality metrics for the generated report.

    Evaluates completeness (section count), evidence coverage (citations
    vs available claims), entity representation, and lane divergence.

    Args:
        sections: Generated report section dicts.
        entities: Entity dicts from evidence pipeline.
        claims: Claim dicts from evidence pipeline.
        lane_rounds: Lane round dicts from simulation.

    Returns:
        Dict with completeness, coherence, evidenceCoverage, laneDivergence,
        and overall quality scores (all 0.0-1.0).
    """
    # Completeness: did we generate enough sections?
    section_count = len(sections)
    completeness = min(1.0, section_count / 3.0)

    # Evidence coverage: how many claims are cited?
    all_citations: set[str] = set()
    for s in sections:
        for c in s.get("citations", []):
            all_citations.add(str(c))

    total_claims = max(len(claims), 1)
    evidence_coverage = min(1.0, len(all_citations) / total_claims)

    # Entity representation
    entity_count = len(entities)
    entity_score = min(1.0, entity_count / 5.0) if entity_count > 0 else 0.0

    # Lane divergence: measure spread of average sentiments across lanes
    lane_sentiments: dict[str, list[float]] = {}
    for lr in lane_rounds:
        lane = lr.get("lane", "unknown")
        for r in lr.get("rounds", []):
            lane_sentiments.setdefault(lane, []).append(r.get("sentiment", 0.0))

    lane_avgs = [
        sum(vals) / len(vals) for vals in lane_sentiments.values() if vals
    ]
    if len(lane_avgs) >= 2:
        spread = max(lane_avgs) - min(lane_avgs)
        lane_divergence = min(1.0, spread / 2.0)  # Normalize: max spread is 2
    else:
        lane_divergence = 0.0

    # Coherence: proxy via section body lengths
    avg_body_len = (
        sum(len(s.get("body", "")) for s in sections) / max(len(sections), 1)
    )
    coherence = min(1.0, avg_body_len / 400.0)

    overall = (
        completeness * 0.25
        + coherence * 0.25
        + evidence_coverage * 0.25
        + entity_score * 0.15
        + lane_divergence * 0.10
    )

    return {
        "completeness": round(completeness, 3),
        "coherence": round(coherence, 3),
        "evidenceCoverage": round(evidence_coverage, 3),
        "laneDivergence": round(lane_divergence, 3),
        "overall": round(overall, 3),
    }


# ---------------------------------------------------------------------------
# Step 6: Markdown / HTML generation
# ---------------------------------------------------------------------------


def _sections_to_markdown(
    headline: str,
    executive_summary: str,
    sections: list[dict],
    lane_summaries: list[dict],
    comparison: dict,
) -> str:
    """Convert report components into a single markdown document.

    Args:
        headline: Report headline.
        executive_summary: Detailed executive summary text.
        sections: Report section dicts with title and body.
        lane_summaries: Lane summary dicts with narratives.
        comparison: Scenario comparison dict.

    Returns:
        Full markdown string.
    """
    parts: list[str] = []

    parts.append(f"# {headline}\n")
    parts.append(f"## Executive Summary\n\n{executive_summary}\n")

    for section in sections:
        parts.append(f"## {section.get('title', 'Section')}\n\n{section.get('body', '')}\n")

    if lane_summaries:
        parts.append("## Simulation Lane Analysis\n")
        for ls in lane_summaries:
            lane_name = ls.get("lane", "Unknown").replace("_", " ").title()
            parts.append(f"### {lane_name}\n\n{ls.get('narrative', '')}\n")
            arc = ls.get("sentimentArc", "")
            if arc:
                parts.append(f"**Sentiment arc:** {arc}\n")
            turning_points = ls.get("keyTurningPoints", [])
            if turning_points:
                parts.append("**Key turning points:**\n")
                for tp in turning_points:
                    parts.append(f"- {tp}")
                parts.append("")

    if comparison:
        parts.append("## Scenario Comparison\n")
        for comp in comparison.get("comparison", []):
            parts.append(f"### {comp.get('title', comp.get('label', ''))}\n")
            parts.append(f"{comp.get('overallAssessment', '')}\n")
            strengths = comp.get("strengths", [])
            if strengths:
                parts.append("**Strengths:**")
                for s in strengths:
                    parts.append(f"- {s}")
            weaknesses = comp.get("weaknesses", [])
            if weaknesses:
                parts.append("**Weaknesses:**")
                for w in weaknesses:
                    parts.append(f"- {w}")
            parts.append("")

        rationale = comparison.get("winnerRationale", "")
        if rationale:
            parts.append(f"### Winner Rationale\n\n{rationale}\n")

        runner_up = comparison.get("runnerUpAnalysis", "")
        if runner_up:
            parts.append(f"### Runner-Up Analysis\n\n{runner_up}\n")

    return "\n".join(parts)


def _markdown_to_html(markdown: str) -> str:
    """Convert markdown to basic HTML without external dependencies.

    Handles headings (h1-h3), paragraphs, bold text, and unordered lists.

    Args:
        markdown: Markdown string to convert.

    Returns:
        HTML string.
    """
    lines = markdown.split("\n")
    html_parts: list[str] = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            continue

        # Headings
        if stripped.startswith("### "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h3>{_inline_format(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h2>{_inline_format(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h1>{_inline_format(stripped[2:])}</h1>")
        elif stripped.startswith("- "):
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            html_parts.append(f"<li>{_inline_format(stripped[2:])}</li>")
        else:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<p>{_inline_format(stripped)}</p>")

    if in_list:
        html_parts.append("</ul>")

    return "\n".join(html_parts)


def _inline_format(text: str) -> str:
    """Apply inline markdown formatting (bold) to text.

    Args:
        text: Text potentially containing **bold** markers.

    Returns:
        Text with bold markers replaced by <strong> tags.
    """
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def generate_report(data: dict) -> dict:
    """Generate the full report from aggregated pipeline data.

    Orchestrates multiple LLM calls in a staged pipeline:
      - Step 1: Executive summary
      - Steps 2+3: Report sections and lane summaries (parallel)
      - Step 4: Scenario comparison
      - Step 5: Social card and quality metrics (no LLM)
      - Step 6: Assembly with markdown and HTML

    Args:
        data: Dict containing keys: evidence, entities, claims, laneRounds,
            simulations, decision, prompt, and optionally scenarioInputs.

    Returns:
        Complete report dict with all sections, summaries, markdown, HTML,
        social card, and quality metrics.
    """
    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

    # Step 1: Executive Summary
    logger.info("Report step 1: generating executive summary")
    exec_summary = await _generate_executive_summary(client, data)

    # Steps 2 + 3: Sections and lane summaries in parallel
    logger.info("Report steps 2+3: generating sections and lane summaries")
    section_topics = _derive_section_topics(data)

    section_tasks = [
        _generate_section(client, topic, data) for topic in section_topics
    ]
    lane_summary_task = _generate_lane_summaries(
        client, data.get("laneRounds", [])
    )

    # Gather sections + lane summaries concurrently
    all_results = await asyncio.gather(
        *section_tasks,
        lane_summary_task,
        return_exceptions=True,
    )

    # Separate results: first N are sections, last is lane summaries
    sections: list[dict] = []
    for result in all_results[:-1]:
        if isinstance(result, Exception):
            logger.error("Section generation failed: %s", result)
            continue
        sections.append(result)

    lane_summaries: list[dict] = (
        all_results[-1]
        if not isinstance(all_results[-1], Exception)
        else []
    )
    if isinstance(all_results[-1], Exception):
        logger.error("Lane summary generation failed: %s", all_results[-1])

    # Step 4: Scenario comparison
    logger.info("Report step 4: generating scenario comparison")
    comparison = await _generate_scenario_comparison(
        client,
        data.get("simulations", []),
        data.get("decision", {}),
    )

    # Step 5: Social card + quality (pure Python)
    logger.info("Report step 5: computing social card and quality metrics")
    decision = data.get("decision", {})
    simulations = data.get("simulations", [])

    winner_score = 0.0
    winner_title = decision.get("winnerTitle", "N/A")
    for sim in simulations:
        if sim.get("label") == decision.get("winnerLabel"):
            winner_score = sim.get("scorecard", {}).get("overallScore", 0.0)
            break

    social_card = _build_social_card(
        headline=exec_summary.get("headline", "Reality Fork Report"),
        winner_title=winner_title,
        winner_score=winner_score,
        total_lanes=len(data.get("laneRounds", [])),
    )

    quality = _compute_quality_metrics(
        sections=sections,
        entities=data.get("entities", []),
        claims=data.get("claims", []),
        lane_rounds=data.get("laneRounds", []),
    )

    # Step 6: Assembly
    logger.info("Report step 6: assembling final report")
    headline = exec_summary.get("headline", "Reality Fork Analysis Report")
    executive_summary_text = exec_summary.get("executiveSummary", exec_summary.get("summary", ""))

    markdown = _sections_to_markdown(
        headline=headline,
        executive_summary=executive_summary_text,
        sections=sections,
        lane_summaries=lane_summaries,
        comparison=comparison,
    )

    html = _markdown_to_html(markdown)

    report = {
        "id": generate_id("rf_rpt"),
        "headline": headline,
        "summary": exec_summary.get("summary", ""),
        "executiveSummary": executive_summary_text,
        "sections": [
            {
                "key": f"section_{i}",
                "title": s.get("title", ""),
                "body": s.get("body", ""),
                "citations": s.get("citations", []),
            }
            for i, s in enumerate(sections)
        ],
        "laneSummaries": lane_summaries,
        "scenarioComparison": comparison.get("comparison", []),
        "winningRationale": comparison.get("winnerRationale", ""),
        "runnerUpAnalysis": comparison.get("runnerUpAnalysis", ""),
        "socialCard": social_card,
        "quality": quality,
        "markdown": markdown,
        "html": html,
    }

    logger.info("Report generation complete: %s", report["id"])
    return report
