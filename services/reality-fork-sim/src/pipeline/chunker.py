"""Text chunking utility with sentence-boundary awareness."""

from __future__ import annotations

import re

# Minimum chunk size: chunks smaller than this are appended to the previous chunk
_MIN_CHUNK_SIZE = 50


def chunk_text(
    text: str,
    chunk_size: int = 1500,
    overlap: int = 200,
) -> list[dict]:
    """Split *text* into overlapping chunks with sentence-boundary awareness.

    Whitespace is normalized before chunking (multiple newlines/spaces collapsed).
    Chunk boundaries prefer sentence endings (. ! ? followed by space or newline)
    within the last 20% of the chunk window.

    Returns a list of dicts with keys: content, charStart, charEnd.
    Returns an empty list for empty or whitespace-only input.
    """
    # Normalize whitespace: collapse runs of whitespace
    text = re.sub(r"\n{2,}", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = text.strip()

    if not text:
        return []

    chunks: list[dict] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)

        # Try to break at a sentence boundary within the last 20% of the chunk
        if end < text_len:
            tolerance_start = start + int(chunk_size * 0.8)
            best_break = _find_sentence_break(text, tolerance_start, end)
            if best_break > tolerance_start:
                end = best_break

        chunk_content = text[start:end]

        # Merge tiny trailing chunks into the previous one
        if chunks and len(chunk_content) < _MIN_CHUNK_SIZE:
            prev = chunks[-1]
            prev["content"] = text[prev["charStart"] : end]
            prev["charEnd"] = end
        else:
            chunks.append(
                {
                    "content": chunk_content,
                    "charStart": start,
                    "charEnd": end,
                }
            )

        if end >= text_len:
            break

        start = end - overlap
        # Ensure forward progress
        if start <= chunks[-1]["charStart"]:
            start = end

    return chunks


def _find_sentence_break(text: str, window_start: int, window_end: int) -> int:
    """Find the best sentence-ending break point in the given window.

    Looks for '. ', '! ', '? ', or sentence-ending punctuation followed by
    a newline. Returns the position just after the punctuation + space, or
    window_start if no break is found.
    """
    best = window_start
    for match in re.finditer(r"[.!?][\s]", text[window_start:window_end]):
        # Position in the original text, right after the space
        pos = window_start + match.end()
        if pos > best:
            best = pos
    return best
