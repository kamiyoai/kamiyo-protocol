"""POST /report -- generate a comprehensive Reality Fork report.

Validates that all required pipeline data is present before delegating
to the multi-step report generator.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.report import generator

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ReportRequest(BaseModel):
    """Incoming report generation request payload."""

    project_id: str = Field(alias="projectId")
    prompt: str
    evidence: list[dict] = []
    entities: list[dict] = []
    claims: list[dict] = []
    scenario_inputs: list[dict] = Field(default=[], alias="scenarioInputs")
    lane_rounds: list[dict] = Field(default=[], alias="laneRounds")
    simulations: list[dict] = []
    decision: dict = {}

    model_config = {"populate_by_name": True}


class ReportResponse(BaseModel):
    """Report generation response."""

    report: dict

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/report", response_model=ReportResponse)
async def report(req: ReportRequest) -> ReportResponse:
    """Generate a comprehensive Reality Fork report.

    Validates that the required pipeline stages have produced data:
      - evidence or entities or claims (content to analyze)
      - simulations (simulation results to compare)
      - decision (winner selection)

    Returns the full report with executive summary, sections, lane
    summaries, scenario comparison, social card, and quality metrics.
    """
    # Validate required data is present
    if not req.evidence and not req.entities and not req.claims:
        raise HTTPException(
            status_code=400,
            detail="At least one of evidence, entities, or claims must be provided.",
        )

    if not req.simulations:
        raise HTTPException(
            status_code=400,
            detail="Simulations data is required for report generation.",
        )

    if not req.decision:
        raise HTTPException(
            status_code=400,
            detail="Decision data is required for report generation.",
        )

    try:
        logger.info("Generating report for project %s", req.project_id)

        report_data = await generator.generate_report(
            {
                "projectId": req.project_id,
                "prompt": req.prompt,
                "evidence": req.evidence,
                "entities": req.entities,
                "claims": req.claims,
                "scenarioInputs": req.scenario_inputs,
                "laneRounds": req.lane_rounds,
                "simulations": req.simulations,
                "decision": req.decision,
            }
        )

        logger.info("Report generated: %s", report_data.get("id"))
        return ReportResponse(report=report_data)

    except Exception as exc:
        logger.exception("Report generation failed for project %s", req.project_id)
        raise HTTPException(
            status_code=500,
            detail=f"Report generation failed: {exc}",
        ) from exc
