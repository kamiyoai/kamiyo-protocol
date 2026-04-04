"""Shared utility functions for the Reality Fork simulation service."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any


def parse_llm_json(raw: str) -> Any:
    """Parse JSON from LLM output, handling markdown fences and extra text.

    Steps:
      1. Strip leading/trailing whitespace.
      2. Remove markdown code fences (```json ... ``` or ``` ... ```).
      3. Attempt json.loads on cleaned text.
      4. On failure, locate the first '{' or '[' and last '}' or ']' and parse
         that substring.
      5. If all parsing fails, raise ValueError with the first 200 chars.
    """
    cleaned = raw.strip()

    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    cleaned = cleaned.strip()

    # Attempt 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: find outermost JSON structure
    first_brace = -1
    first_bracket = -1
    for i, ch in enumerate(cleaned):
        if ch == "{" and first_brace == -1:
            first_brace = i
        if ch == "[" and first_bracket == -1:
            first_bracket = i
        if first_brace != -1 and first_bracket != -1:
            break

    last_brace = cleaned.rfind("}")
    last_bracket = cleaned.rfind("]")

    candidates: list[str] = []
    if first_brace != -1 and last_brace > first_brace:
        candidates.append(cleaned[first_brace : last_brace + 1])
    if first_bracket != -1 and last_bracket > first_bracket:
        candidates.append(cleaned[first_bracket : last_bracket + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    preview = raw[:200] if len(raw) > 200 else raw
    raise ValueError(f"Failed to parse JSON from LLM output: {preview!r}")


def generate_id(prefix: str) -> str:
    """Generate a unique ID with the given prefix.

    Returns a string in the format ``{prefix}_{12_hex_chars}``.
    """
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def truncate_for_context(items: list[dict], max_chars: int = 80000) -> str:
    """JSON-serialize a list of dicts, truncating to fit within max_chars.

    Items are included in order until adding the next item would exceed
    the character limit. If no items fit, returns '[]'.
    """
    if not items:
        return "[]"

    parts: list[str] = []
    current_len = 2  # account for surrounding [ ]

    for item in items:
        serialized = json.dumps(item, ensure_ascii=False)
        # +2 for the comma and space between items
        addition = len(serialized) + (2 if parts else 0)

        if current_len + addition > max_chars:
            break

        parts.append(serialized)
        current_len += addition

    return "[" + ", ".join(parts) + "]"
