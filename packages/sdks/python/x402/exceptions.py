"""
x402 SDK Exceptions
"""


class X402Error(Exception):
    """Base exception for x402 SDK"""
    pass


class X402APIError(X402Error):
    """API request failed"""
    pass


class X402AuthError(X402Error):
    """Authentication failed"""
    pass


class X402QuotaExceeded(X402Error):
    """Monthly quota exceeded"""
    pass
