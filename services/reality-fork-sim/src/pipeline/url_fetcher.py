"""Fetch and extract readable text from a URL with SSRF protection."""

from __future__ import annotations

import html
import ipaddress
import re
from urllib.parse import urlparse

import httpx

# Maximum response body size: 5 MB
_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

_USER_AGENT = "RealityForkSim/1.0 (+https://kamiyo.ai)"


def is_safe_url(url: str) -> bool:
    """Check whether a URL is safe to fetch (not targeting private/internal networks).

    Blocks:
      - Private IPs: 10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x
      - IPv6 loopback (::1)
      - Hostnames: localhost
      - Schemes: file://, ftp://
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    scheme = (parsed.scheme or "").lower()
    if scheme in ("file", "ftp"):
        return False

    if scheme not in ("http", "https"):
        return False

    hostname = (parsed.hostname or "").lower()

    if not hostname:
        return False

    if hostname in ("localhost",):
        return False

    # Check IP addresses
    try:
        addr = ipaddress.ip_address(hostname)
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return False
    except ValueError:
        # Not a raw IP, check if hostname resolves to a known bad pattern
        # (we only block obvious cases here; DNS rebinding is out of scope)
        pass

    return True


async def fetch_url_text(url: str, timeout: float = 15.0) -> str:
    """Fetch *url* and return its body as plain text.

    Raises ValueError if the URL targets a private/internal network.
    Enforces a 5 MB response size limit and 15s timeout.
    HTML content is cleaned by stripping script/style tags, removing HTML tags,
    decoding entities, and normalizing whitespace.
    """
    if not is_safe_url(url):
        raise ValueError(f"URL is not allowed (private/internal network or unsafe scheme): {url}")

    headers = {"User-Agent": _USER_AGENT}

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers=headers,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    # Enforce size limit
    content_length = resp.headers.get("content-length")
    if content_length and int(content_length) > _MAX_RESPONSE_BYTES:
        raise ValueError(f"Response too large: {content_length} bytes (limit: {_MAX_RESPONSE_BYTES})")

    raw_bytes = resp.content
    if len(raw_bytes) > _MAX_RESPONSE_BYTES:
        raise ValueError(f"Response too large: {len(raw_bytes)} bytes (limit: {_MAX_RESPONSE_BYTES})")

    content_type = resp.headers.get("content-type", "")
    body = resp.text

    if "html" in content_type:
        body = _strip_html(body)

    return body


def _strip_html(text: str) -> str:
    """Strip HTML to plain text.

    Removes script and style blocks, strips all tags, decodes common HTML
    entities, and normalizes whitespace.
    """
    # Remove script and style blocks
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)

    # Remove all remaining HTML tags
    text = re.sub(r"<[^>]+>", " ", text)

    # Decode HTML entities
    text = html.unescape(text)

    # Normalize whitespace: collapse runs of whitespace into single spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text
