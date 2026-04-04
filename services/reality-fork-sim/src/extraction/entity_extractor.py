"""Extract structured entities from text chunks using Claude.

Handles batching for large inputs, deduplication of entities by label,
and robust JSON parsing with retries.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import anthropic

from src import config
from src.utils import generate_id, parse_llm_json

logger = logging.getLogger(__name__)

BATCH_CHAR_LIMIT = 60_000

SYSTEM_PROMPT = """\
You are an expert entity-extraction engine used in strategic intelligence analysis. \
Given a set of text chunks and an analysis prompt, identify every distinct entity mentioned.

Return ONLY a JSON array. Each element must have exactly these fields:

- "label": canonical entity name (proper casing, no abbreviations unless the abbreviation is the canonical form)
- "category": one of: person | organization | product | technology | policy | market | location | event | concept | other
- "description": 1-2 sentence description of what this entity is and why it matters in context
- "relationships": array of objects, each with:
    - "targetLabel": the label of another entity this one relates to
    - "relationship": a brief phrase describing the relationship (e.g. "competes with", "regulates", "developed by")
- "chunkIds": array of chunk IDs where this entity is mentioned

Rules:
- Merge duplicate entities (same real-world referent) into one entry.
- Prefer the most complete/formal version of a name as the label.
- If an entity appears in multiple chunks, list ALL chunk IDs.
- Relationships should only reference entities you are also extracting.
- Do NOT wrap your response in markdown fences or add any text outside the JSON array.
"""


def _build_chunk_text(chunks: list[dict]) -> str:
    """Format chunks into a labeled text block for the LLM."""
    return "\n---\n".join(
        f"[{c['id']}]\n{c['content']}" for c in chunks
    )


def _batch_chunks(chunks: list[dict]) -> list[list[dict]]:
    """Split chunks into batches that stay under BATCH_CHAR_LIMIT."""
    batches: list[list[dict]] = []
    current_batch: list[dict] = []
    current_size = 0

    for chunk in chunks:
        chunk_size = len(chunk.get("content", "")) + len(chunk.get("id", "")) + 10
        if current_batch and current_size + chunk_size > BATCH_CHAR_LIMIT:
            batches.append(current_batch)
            current_batch = []
            current_size = 0
        current_batch.append(chunk)
        current_size += chunk_size

    if current_batch:
        batches.append(current_batch)

    return batches


def _deduplicate_entities(entities: list[dict]) -> list[dict]:
    """Merge entities with the same label (case-insensitive).

    When duplicates are found, the first occurrence wins for scalar fields,
    and list fields (chunkIds, relationships) are merged.
    """
    seen: dict[str, dict] = {}

    for entity in entities:
        key = entity.get("label", "").strip().lower()
        if not key:
            continue

        if key in seen:
            existing = seen[key]
            # Merge chunkIds
            existing_chunks = set(existing.get("chunkIds", []))
            existing_chunks.update(entity.get("chunkIds", []))
            existing["chunkIds"] = sorted(existing_chunks)
            # Merge relationships (deduplicate by targetLabel+relationship)
            existing_rels = {
                (r["targetLabel"].lower(), r["relationship"].lower()): r
                for r in existing.get("relationships", [])
            }
            for rel in entity.get("relationships", []):
                rel_key = (rel["targetLabel"].lower(), rel["relationship"].lower())
                if rel_key not in existing_rels:
                    existing_rels[rel_key] = rel
            existing["relationships"] = list(existing_rels.values())
            # Use longer description if available
            if len(entity.get("description", "")) > len(existing.get("description", "")):
                existing["description"] = entity["description"]
        else:
            seen[key] = entity

    return list(seen.values())


async def _call_llm(client: anthropic.AsyncAnthropic, user_content: str) -> list[dict]:
    """Make a single LLM call with retry logic."""
    last_error: Exception | None = None

    for attempt in range(1 + config.LLM_MAX_RETRIES):
        try:
            message = await client.messages.create(
                model=config.LLM_MODEL,
                max_tokens=4096,
                temperature=0.2,
                system=SYSTEM_PROMPT,
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
                "Entity extraction API error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
        except (ValueError, KeyError) as exc:
            last_error = exc
            logger.warning(
                "Entity extraction parse error (attempt %d/%d): %s",
                attempt + 1, 1 + config.LLM_MAX_RETRIES, exc,
            )
            if attempt < config.LLM_MAX_RETRIES:
                await asyncio.sleep(1)

    raise RuntimeError(
        f"Entity extraction failed after {1 + config.LLM_MAX_RETRIES} attempts: {last_error}"
    )


async def extract_entities(
    chunks: list[dict],
    prompt: str,
) -> list[dict]:
    """Extract structured entities from document chunks using Claude.

    Args:
        chunks: List of dicts with keys ``id``, ``content``, and optionally ``evidenceId``.
        prompt: The user's analysis prompt providing extraction context.

    Returns:
        Deduplicated list of entity dicts, each with a unique ``id``,
        ``label``, ``category``, ``description``, ``relationships``, and ``chunkIds``.

    Raises:
        RuntimeError: If all LLM call attempts fail.
    """
    if not chunks:
        return []

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    batches = _batch_chunks(chunks)
    all_raw_entities: list[dict] = []

    for batch_idx, batch in enumerate(batches):
        logger.info(
            "Processing entity batch %d/%d (%d chunks)",
            batch_idx + 1, len(batches), len(batch),
        )
        user_content = (
            f"Analysis prompt: {prompt}\n\n"
            f"Text chunks ({len(batch)} of {len(chunks)} total):\n"
            + _build_chunk_text(batch)
        )
        raw_entities = await _call_llm(client, user_content)
        all_raw_entities.extend(raw_entities)

    # Deduplicate across batches
    deduped = _deduplicate_entities(all_raw_entities)

    # Normalize and assign stable IDs
    valid_categories = {
        "person", "organization", "product", "technology", "policy",
        "market", "location", "event", "concept", "other",
    }

    entities: list[dict] = []
    for raw in deduped:
        category = raw.get("category", "other").lower().strip()
        if category not in valid_categories:
            category = "other"

        relationships = []
        for rel in raw.get("relationships", []):
            if isinstance(rel, dict) and "targetLabel" in rel and "relationship" in rel:
                relationships.append({
                    "targetLabel": rel["targetLabel"],
                    "relationship": rel["relationship"],
                })

        entities.append({
            "id": generate_id("rf_ent"),
            "label": raw.get("label", "").strip(),
            "category": category,
            "description": raw.get("description", "").strip(),
            "relationships": relationships,
            "chunkIds": raw.get("chunkIds", []),
        })

    logger.info("Extracted %d entities (from %d raw, pre-dedup)", len(entities), len(all_raw_entities))
    return entities
