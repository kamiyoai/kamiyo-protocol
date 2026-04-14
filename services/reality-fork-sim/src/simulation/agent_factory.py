"""Agent persona generation for future OASIS integration.

This module is a stub. When OASIS_ENABLED is true the simulation service will
use camel-ai's OASIS framework to run multi-agent simulations. Until then the
functions here return placeholder data structures.
"""

from __future__ import annotations

import uuid


def generate_agent_personas(
    entities: list[dict],
    active_agents: int = 20,
) -> list[dict]:
    """Generate agent persona profiles from entities.

    TODO: When OASIS is enabled, map entities to OASIS agent configurations
    with belief systems, social graphs, and behavioural heuristics.
    """
    personas: list[dict] = []
    for i in range(active_agents):
        # Assign each agent an affinity to a subset of entities
        affiliated = [
            e["name"]
            for j, e in enumerate(entities)
            if j % active_agents == i
        ]
        personas.append(
            {
                "id": f"rf_agent_{uuid.uuid4().hex[:12]}",
                "index": i,
                "role": "general_public" if i >= active_agents // 2 else "stakeholder",
                "affiliatedEntities": affiliated,
                "initialSentiment": 0.0,
                "initialConviction": 0.5,
            }
        )
    return personas
