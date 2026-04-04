"""POST /ingest -- accept files, URLs, and pasted text, return evidence + chunks."""

from __future__ import annotations

import base64
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src import config
from src.pipeline.chunker import chunk_text
from src.pipeline.pdf_reader import extract_pdf_text
from src.pipeline.url_fetcher import fetch_url_text, is_safe_url
from src.utils import generate_id

router = APIRouter()

# Allowed MIME types for uploads
_ALLOWED_MIME_TYPES: set[str] = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/html",
    "text/htm",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# File extensions as a fallback check
_ALLOWED_EXTENSIONS: set[str] = {"pdf", "txt", "md", "html", "htm", "docx"}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class UploadItem(BaseModel):
    """A single uploaded file with base64-encoded data."""

    id: str
    file_name: str = Field(alias="fileName")
    mime_type: str = Field(alias="mimeType")
    data: str  # base64-encoded

    model_config = {"populate_by_name": True}


class IngestRequest(BaseModel):
    """Ingest request containing uploads, URLs, and/or pasted text."""

    project_id: str = Field(alias="projectId")
    uploads: list[UploadItem] = []
    urls: list[str] = []
    pasted_text: Optional[str] = Field(default=None, alias="pastedText")

    model_config = {"populate_by_name": True}


class EvidenceItem(BaseModel):
    """A piece of evidence extracted from an upload, URL, or pasted text."""

    id: str
    source_type: str = Field(alias="sourceType")
    source_name: str = Field(alias="sourceName")
    raw_text: str = Field(alias="rawText")
    char_count: int = Field(alias="charCount")

    model_config = {"populate_by_name": True}


class ChunkItem(BaseModel):
    """A text chunk derived from an evidence item."""

    id: str
    evidence_id: str = Field(alias="evidenceId")
    content: str
    char_start: int = Field(alias="charStart")
    char_end: int = Field(alias="charEnd")

    model_config = {"populate_by_name": True}


class IngestResponse(BaseModel):
    """Response containing all evidence items and their chunks."""

    evidence: list[EvidenceItem]
    chunks: list[ChunkItem]

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_mime_type(mime_type: str, file_name: str) -> None:
    """Validate that the MIME type or file extension is in the allowlist.

    Raises HTTPException with 400 status if the type is not allowed.
    """
    if mime_type in _ALLOWED_MIME_TYPES:
        return

    # Fallback: check file extension
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext in _ALLOWED_EXTENSIONS:
        return

    raise HTTPException(
        status_code=400,
        detail=(
            f"File type '{mime_type}' is not allowed for '{file_name}'. "
            f"Accepted types: pdf, txt, md, html, htm, docx."
        ),
    )


def _validate_upload_size(data_b64: str, file_name: str) -> None:
    """Validate that the decoded file size does not exceed the configured limit.

    Raises HTTPException with 400 status if the file is too large.
    """
    # Base64 encoding inflates size by ~4/3, so decoded size is roughly 3/4 of encoded
    estimated_bytes = len(data_b64) * 3 // 4
    max_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    if estimated_bytes > max_bytes:
        size_mb = estimated_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=(
                f"File '{file_name}' is ~{size_mb:.1f} MB, which exceeds the "
                f"{config.MAX_UPLOAD_SIZE_MB} MB upload limit."
            ),
        )


def _decode_upload(item: UploadItem) -> str:
    """Decode a base64 upload and extract text."""
    raw_bytes = base64.b64decode(item.data)

    if item.mime_type == "application/pdf":
        return extract_pdf_text(raw_bytes)

    # Plain text / markdown / other text types
    return raw_bytes.decode("utf-8", errors="replace")


def _make_chunks(text: str, evi_id: str) -> list[ChunkItem]:
    """Chunk text and wrap results as ChunkItem models."""
    items: list[ChunkItem] = []
    for ch in chunk_text(text):
        items.append(
            ChunkItem(
                id=generate_id("rf_chk"),
                evidenceId=evi_id,
                content=ch["content"],
                charStart=ch["charStart"],
                charEnd=ch["charEnd"],
            )
        )
    return items


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest) -> IngestResponse:
    """Ingest evidence from uploads, URLs, and pasted text into chunks."""
    evidence_items: list[EvidenceItem] = []
    all_chunks: list[ChunkItem] = []

    # 1. Process uploaded files
    for upload in req.uploads:
        _validate_mime_type(upload.mime_type, upload.file_name)
        _validate_upload_size(upload.data, upload.file_name)

        try:
            text = _decode_upload(upload)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to process upload {upload.file_name}: {exc}",
            )

        evi_id = generate_id("rf_evi")
        evidence_items.append(
            EvidenceItem(
                id=evi_id,
                sourceType="upload",
                sourceName=upload.file_name,
                rawText=text,
                charCount=len(text),
            )
        )
        all_chunks.extend(_make_chunks(text, evi_id))

    # 2. Process URLs
    for url in req.urls:
        if not is_safe_url(url):
            raise HTTPException(
                status_code=400,
                detail=f"URL is not allowed (private/internal network or unsafe scheme): {url}",
            )

        try:
            text = await fetch_url_text(url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch URL {url}: {exc}",
            )

        evi_id = generate_id("rf_evi")
        evidence_items.append(
            EvidenceItem(
                id=evi_id,
                sourceType="url",
                sourceName=url,
                rawText=text,
                charCount=len(text),
            )
        )
        all_chunks.extend(_make_chunks(text, evi_id))

    # 3. Process pasted text
    if req.pasted_text:
        evi_id = generate_id("rf_evi")
        evidence_items.append(
            EvidenceItem(
                id=evi_id,
                sourceType="paste",
                sourceName="pasted_text",
                rawText=req.pasted_text,
                charCount=len(req.pasted_text),
            )
        )
        all_chunks.extend(_make_chunks(req.pasted_text, evi_id))

    if not evidence_items:
        raise HTTPException(
            status_code=400,
            detail="No evidence provided. Supply uploads, urls, or pastedText.",
        )

    return IngestResponse(evidence=evidence_items, chunks=all_chunks)
