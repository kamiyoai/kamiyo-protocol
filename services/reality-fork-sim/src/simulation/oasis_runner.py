"""OASIS multi-agent simulation runner stub.

This module will integrate with camel-ai's OASIS framework when
``OASIS_ENABLED`` is set to true. For now it raises ``NotImplementedError``.
"""

from __future__ import annotations


async def run_oasis_simulation(
    hypotheses: list[dict],
    agents: list[dict],
    rounds: int = 5,
    lanes: list[str] | None = None,
) -> dict:
    """Run a full OASIS multi-agent simulation.

    TODO: Implement when OASIS integration is ready.
      - Instantiate OASIS environment
      - Configure agent personas and social graph
      - Run simulation rounds per hypothesis per lane
      - Collect and return aggregated results
    """
    raise NotImplementedError(
        "OASIS simulation is not yet implemented. "
        "Set OASIS_ENABLED=false to use the LLM-based simulation fallback."
    )
