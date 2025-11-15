"""
x402 Infrastructure Python SDK

Official Python client for x402 payment verification API
"""

from .client import X402Client, VerificationResult
from .exceptions import (
    X402Error,
    X402APIError,
    X402AuthError,
    X402QuotaExceeded
)

__version__ = "1.0.0"
__all__ = [
    "X402Client",
    "VerificationResult",
    "X402Error",
    "X402APIError",
    "X402AuthError",
    "X402QuotaExceeded"
]
