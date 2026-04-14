"""Build individual report sections."""

from __future__ import annotations


def build_section(
    topic: str,
    data: dict,
    body: str | None = None,
    citations: list[str] | None = None,
) -> dict:
    """Construct a single report section dict.

    Parameters
    ----------
    topic:
        A short key for the section (e.g. ``"market_overview"``).
    data:
        Contextual data used to auto-generate a title if none is provided.
    body:
        Pre-written section body. If ``None`` an empty string is used.
    citations:
        List of evidence or claim IDs referenced in this section.
    """
    title = data.get("title", topic.replace("_", " ").title())

    return {
        "key": topic,
        "title": title,
        "body": body or "",
        "citations": citations or [],
    }


def build_sections_from_topics(
    topics: list[dict],
    claims: list[dict],
) -> list[dict]:
    """Build a list of skeleton sections from scenario topics and claims."""
    sections: list[dict] = []

    for topic in topics:
        relevant_claim_ids = topic.get("relevantClaimIds", [])
        relevant_claims = [c for c in claims if c.get("id") in relevant_claim_ids]

        body_parts = [topic.get("description", "")]
        for claim in relevant_claims:
            body_parts.append(
                f"- {claim.get('statement', '')} "
                f"(confidence: {claim.get('confidence', 0):.0%})"
            )

        sections.append(
            {
                "key": topic.get("topic", "").lower().replace(" ", "_"),
                "title": topic.get("topic", "Untitled"),
                "body": "\n".join(body_parts),
                "citations": relevant_claim_ids,
            }
        )

    return sections
