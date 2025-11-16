# -*- coding: utf-8 -*-
"""
Payment Error Handling for Kamiyo
Maps Stripe errors to user-friendly responses with safe correlation IDs
PCI DSS Compliance: Requirement 3.4 - No sensitive data in error messages
"""

import re
import uuid
import logging
from typing import Dict, Any, Optional
from enum import Enum
import stripe

logger = logging.getLogger(__name__)


class PaymentErrorCode(Enum):
    """
    User-facing payment error codes.

    PCI DSS Compliance:
    - Error codes are generic and don't expose system internals
    - No sensitive card data in error messages
    - Safe for logging and client responses
    """
    # Card errors
    CARD_DECLINED = "card_declined"
    INSUFFICIENT_FUNDS = "insufficient_funds"
    CARD_EXPIRED = "card_expired"
    INVALID_CARD = "invalid_card"
    CARD_NOT_SUPPORTED = "card_not_supported"

    # Processing errors
    PROCESSING_ERROR = "processing_error"
    RATE_LIMIT = "rate_limit"
    API_ERROR = "api_error"

    # Authentication errors
    AUTHENTICATION_REQUIRED = "authentication_required"

    # General errors
    UNKNOWN_ERROR = "unknown_error"
    INVALID_REQUEST = "invalid_request"


# Map Stripe error codes to our error codes and user messages
STRIPE_ERROR_MAPPING = {
    # Card declined
    'card_declined': {
        'code': PaymentErrorCode.CARD_DECLINED,
        'message': 'Your card was declined. Please try a different payment method or contact your bank.',
        'user_action': 'Try a different card or contact your bank for details.'
    },
    'insufficient_funds': {
        'code': PaymentErrorCode.INSUFFICIENT_FUNDS,
        'message': 'Your card has insufficient funds. Please try a different payment method.',
        'user_action': 'Use a different card or add funds to your account.'
    },
    'expired_card': {
        'code': PaymentErrorCode.CARD_EXPIRED,
        'message': 'Your card has expired. Please use a different payment method.',
        'user_action': 'Update your card information with a valid expiration date.'
    },
    'incorrect_cvc': {
        'code': PaymentErrorCode.INVALID_CARD,
        'message': 'The security code (CVC) you entered is incorrect. Please check and try again.',
        'user_action': 'Verify the 3-4 digit security code on the back of your card.'
    },
    'invalid_card_type': {
        'code': PaymentErrorCode.CARD_NOT_SUPPORTED,
        'message': 'This card type is not supported. Please use a different payment method.',
        'user_action': 'Use a Visa, Mastercard, or American Express card.'
    },

    # Processing errors
    'processing_error': {
        'code': PaymentErrorCode.PROCESSING_ERROR,
        'message': 'An error occurred while processing your payment. Please try again.',
        'user_action': 'Wait a moment and try again. If the problem persists, contact support.'
    },
    'rate_limit': {
        'code': PaymentErrorCode.RATE_LIMIT,
        'message': 'Too many requests. Please wait a moment and try again.',
        'user_action': 'Wait 1-2 minutes before trying again.'
    },
}


def sanitize_correlation_id(request_id: Optional[str]) -> str:
    """
    Sanitize and validate correlation ID for safe exposure to clients.

    PCI DSS Compliance (Requirement 3.4):
    - Ensures no sensitive data leaks through correlation IDs
    - Validates format to prevent injection attacks
    - Generates safe UUID if input is invalid

    Security Measures:
    1. Remove any non-alphanumeric characters (except - and _)
    2. Limit length to 64 characters
    3. Generate new UUID if invalid
    4. Never expose internal system details

    Args:
        request_id: Raw request ID from client or system

    Returns:
        Sanitized correlation ID safe for logging and client responses
    """
    # If no request_id provided, generate a new one
    if not request_id or not isinstance(request_id, str):
        safe_id = str(uuid.uuid4())
        logger.debug(f"[CORRELATION ID] Generated new ID: {safe_id}")
        return safe_id

    # Remove any characters that aren't alphanumeric, dash, or underscore
    # This prevents:
    # - SQL injection attempts
    # - XSS attacks
    # - Path traversal attempts
    # - Command injection
    sanitized = re.sub(r'[^a-zA-Z0-9\-_]', '', request_id)

    # Limit length to 64 characters
    sanitized = sanitized[:64]

    # If sanitization removed everything, generate new ID
    if not sanitized or len(sanitized) < 8:
        safe_id = str(uuid.uuid4())
        logger.warning(
            f"[CORRELATION ID] Invalid request_id sanitized away, generated new: {safe_id}",
            extra={'original': request_id[:100]}  # Log first 100 chars for debugging
        )
        return safe_id

    logger.debug(f"[CORRELATION ID] Sanitized: {sanitized}")
    return sanitized


def map_stripe_error(
    stripe_error: stripe.error.StripeError,
    request_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Map Stripe error to user-friendly response with safe correlation ID.

    PCI DSS Compliance:
    - No sensitive card data in error messages (Requirement 3.4)
    - No internal system details exposed (Requirement 6.5.5)
    - Safe correlation IDs for support tracking
    - Comprehensive audit logging

    Args:
        stripe_error: Stripe error exception
        request_id: Optional request correlation ID

    Returns:
        Dict with user-safe error information:
        {
            'error_code': str,          # Generic error code
            'message': str,             # User-friendly message
            'user_action': str,         # What user should do
            'support_id': str,          # Safe correlation ID for support
            'support_contact': str      # How to contact support
        }
    """
    # Sanitize correlation ID first
    safe_support_id = sanitize_correlation_id(request_id)

    # Default error response
    error_response = {
        'error_code': PaymentErrorCode.UNKNOWN_ERROR.value,
        'message': 'An unexpected error occurred. Please try again or contact support.',
        'user_action': 'Try again in a few moments. If the problem persists, contact support.',
        'support_id': safe_support_id,
        'support_contact': 'support@kamiyo.ai'
    }

    # Map Stripe error type to our error
    if isinstance(stripe_error, stripe.error.CardError):
        # Card was declined
        stripe_code = stripe_error.code

        if stripe_code in STRIPE_ERROR_MAPPING:
            error_info = STRIPE_ERROR_MAPPING[stripe_code]
            error_response.update({
                'error_code': error_info['code'].value,
                'message': error_info['message'],
                'user_action': error_info['user_action']
            })
        else:
            # Generic card error
            error_response.update({
                'error_code': PaymentErrorCode.CARD_DECLINED.value,
                'message': 'Your card was declined. Please try a different payment method.',
                'user_action': 'Try a different card or contact your bank.'
            })

        # Log card error (PCI compliant - no card numbers)
        logger.warning(
            f"[PAYMENT ERROR] Card error: {stripe_code}",
            extra={
                'error_code': stripe_code,
                'error_type': 'card_error',
                'support_id': safe_support_id,
                'stripe_error_type': type(stripe_error).__name__
            }
        )

    elif isinstance(stripe_error, stripe.error.RateLimitError):
        # Rate limit exceeded
        error_response.update({
            'error_code': PaymentErrorCode.RATE_LIMIT.value,
            'message': 'Too many requests. Please wait a moment and try again.',
            'user_action': 'Wait 1-2 minutes before trying again.'
        })

        logger.warning(
            f"[PAYMENT ERROR] Rate limit exceeded",
            extra={
                'error_type': 'rate_limit',
                'support_id': safe_support_id
            }
        )

    elif isinstance(stripe_error, stripe.error.InvalidRequestError):
        # Invalid parameters (code bug)
        error_response.update({
            'error_code': PaymentErrorCode.INVALID_REQUEST.value,
            'message': 'Invalid payment request. Please contact support.',
            'user_action': 'Contact support with your support ID.'
        })

        logger.error(
            f"[PAYMENT ERROR] Invalid request: {str(stripe_error)}",
            extra={
                'error_type': 'invalid_request',
                'support_id': safe_support_id,
                'error_message': str(stripe_error)[:200]  # Truncate for safety
            }
        )

    elif isinstance(stripe_error, stripe.error.AuthenticationError):
        # API key issue (system error)
        error_response.update({
            'error_code': PaymentErrorCode.API_ERROR.value,
            'message': 'Payment system error. Our team has been notified.',
            'user_action': 'Please try again later or contact support.'
        })

        logger.critical(
            f"[PAYMENT ERROR] Authentication error - invalid API key",
            extra={
                'error_type': 'authentication_error',
                'support_id': safe_support_id
            }
        )

    elif isinstance(stripe_error, stripe.error.APIConnectionError):
        # Network error
        error_response.update({
            'error_code': PaymentErrorCode.PROCESSING_ERROR.value,
            'message': 'Could not connect to payment processor. Please try again.',
            'user_action': 'Check your internet connection and try again.'
        })

        logger.error(
            f"[PAYMENT ERROR] API connection error",
            extra={
                'error_type': 'connection_error',
                'support_id': safe_support_id
            }
        )

    elif isinstance(stripe_error, stripe.error.APIError):
        # Stripe server error
        error_response.update({
            'error_code': PaymentErrorCode.API_ERROR.value,
            'message': 'Payment processor error. Please try again.',
            'user_action': 'Try again in a few moments.'
        })

        logger.error(
            f"[PAYMENT ERROR] Stripe API error",
            extra={
                'error_type': 'api_error',
                'support_id': safe_support_id
            }
        )

    else:
        # Unknown error type
        logger.error(
            f"[PAYMENT ERROR] Unknown error type: {type(stripe_error).__name__}",
            extra={
                'error_type': 'unknown',
                'support_id': safe_support_id,
                'stripe_error_type': type(stripe_error).__name__
            }
        )

    return error_response


def create_error_response(
    error_code: PaymentErrorCode,
    message: str,
    user_action: str,
    request_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a standardized error response for payment errors.

    Args:
        error_code: Payment error code enum
        message: User-friendly error message
        user_action: What the user should do next
        request_id: Optional correlation ID
        metadata: Optional additional metadata (for logging only, not exposed)

    Returns:
        Standardized error response dict
    """
    safe_support_id = sanitize_correlation_id(request_id)

    response = {
        'error_code': error_code.value,
        'message': message,
        'user_action': user_action,
        'support_id': safe_support_id,
        'support_contact': 'support@kamiyo.ai'
    }

    # Log error with metadata (not exposed to client)
    logger.error(
        f"[PAYMENT ERROR] {error_code.value}: {message}",
        extra={
            'error_code': error_code.value,
            'support_id': safe_support_id,
            'metadata': metadata or {}
        }
    )

    return response


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.DEBUG)

    print("\n=== Payment Error Handler Test ===\n")

    # Test 1: Sanitize correlation IDs
    print("1. Correlation ID Sanitization:")
    test_ids = [
        "abc-123",
        "'; DROP TABLE users; --",
        "<script>alert('xss')</script>",
        "../../../etc/passwd",
        "valid_id_123-456",
        None,
        "",
        "a" * 100  # Too long
    ]

    for test_id in test_ids:
        safe_id = sanitize_correlation_id(test_id)
        print(f"   Input: {str(test_id)[:30]:<30} -> Output: {safe_id}")

    # Test 2: Map Stripe errors
    print("\n2. Stripe Error Mapping:")

    # Simulate card declined error
    try:
        raise stripe.error.CardError(
            message="Card was declined",
            param="card",
            code="card_declined"
        )
    except stripe.error.CardError as e:
        error_response = map_stripe_error(e, "test-request-123")
        print(f"   Card Declined:")
        print(f"   - Error Code: {error_response['error_code']}")
        print(f"   - Message: {error_response['message']}")
        print(f"   - User Action: {error_response['user_action']}")
        print(f"   - Support ID: {error_response['support_id']}")

    print("\n✅ Payment error handler ready")
    print("\nSECURITY FEATURES:")
    print("   - Correlation IDs sanitized (no injection attacks)")
    print("   - No sensitive data in error messages (PCI compliant)")
    print("   - User-friendly messages with actionable guidance")
    print("   - Comprehensive audit logging")
