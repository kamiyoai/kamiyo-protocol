"""PDF text extraction using PyMuPDF (fitz)."""

from __future__ import annotations

import fitz  # PyMuPDF

# Default maximum number of pages to process
DEFAULT_MAX_PAGES = 200

# Minimum total text length to consider the PDF as having extractable text
_MIN_TEXT_LENGTH = 50


def extract_pdf_text(file_bytes: bytes, max_pages: int = DEFAULT_MAX_PAGES) -> str:
    """Extract all text from a PDF provided as raw bytes.

    Uses a context manager to ensure the document is properly closed.
    Raises ValueError for password-protected or image-only PDFs, and
    enforces a configurable page count limit.
    """
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        # Check for password protection
        if doc.is_encrypted:
            raise ValueError(
                "PDF is password-protected and cannot be processed. "
                "Please provide an unprotected version."
            )

        page_count = len(doc)
        if page_count > max_pages:
            raise ValueError(
                f"PDF has {page_count} pages, which exceeds the maximum "
                f"of {max_pages}. Please provide a shorter document."
            )

        pages: list[str] = []
        for page in doc:
            pages.append(page.get_text())

    full_text = "\n".join(pages)

    # Detect image-only PDFs where text extraction yields minimal content
    if len(full_text.strip()) < _MIN_TEXT_LENGTH:
        raise ValueError(
            "PDF appears to be image-only; text extraction yielded no content"
        )

    return full_text
