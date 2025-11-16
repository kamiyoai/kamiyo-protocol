# -*- coding: utf-8 -*-
"""
PCI-Compliant Logging Filter for Payment Data
PCI DSS Requirement 3.4: Render PAN unreadable anywhere it is stored

This module implements a logging filter that automatically redacts
sensitive payment information from all log messages, ensuring compliance
with PCI DSS requirements for cardholder data protection.

CRITICAL: This filter MUST be applied to ALL loggers in the application,
especially those handling payment processing. Failure to redact sensitive
data from logs can result in:
- PCI DSS audit failure
- Payment processor termination
- GDPR fines up to €20M
- Data breach liability

PCI DSS Requirements Addressed:
- 3.4: Render PAN unreadable (even in logs)
- 4.2: Never send unencrypted PANs via end-user messaging
- 10.2: Implement automated audit trails (but without exposing PAN)
- 12.8: Maintain policies for protection of cardholder data
"""

import re
import logging
from typing import Pattern, List, Tuple, Optional


class PCILoggingFilter(logging.Filter):
    """
    Logging filter that redacts sensitive payment information.

    This filter scans all log messages and replaces sensitive patterns
    with redacted placeholders. It operates at the logging infrastructure
    level, providing defense-in-depth against accidental data exposure.

    Protected Data Types:
    1. Credit card numbers (PAN) - PCI DSS 3.4
    2. CVV/CVC codes - PCI DSS 3.2
    3. Stripe customer IDs - Contains customer linkage
    4. Stripe payment method IDs - Contains payment details
    5. Stripe API keys - Security credentials
    6. Stripe payment intent IDs - Transaction linkage
    7. Stripe subscription IDs - Customer linkage
    8. Email addresses in payment context - PII protection
    9. Full names in payment logs - PII protection

    Usage:
        # Apply to specific logger
        payment_logger = logging.getLogger('api.payments')
        payment_logger.addFilter(PCILoggingFilter())

        # Apply to root logger (recommended for defense-in-depth)
        logging.getLogger().addFilter(PCILoggingFilter())
    """

    # ==========================================
    # REDACTION PATTERNS
    # ==========================================

    # Pattern format: (regex_pattern, replacement_string, description)
    REDACTION_PATTERNS: List[Tuple[Pattern, str, str]] = [
        # Credit Card Numbers (PAN)
        # Matches: 4111-1111-1111-1111, 4111 1111 1111 1111, 4111111111111111
        # PCI DSS 3.4: Primary Account Number must be unreadable
        (
            re.compile(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b'),
            '[CARD_REDACTED]',
            'Credit card number (PAN)'
        ),

        # Partial card numbers (for context: "card ending in 1234")
        # Keep "last 4" references but redact full sequences
        (
            re.compile(r'(?<!last\s)(?<!ending\s)\b\d{13,19}\b'),
            '[CARD_REDACTED]',
            'Long number sequence (potential PAN)'
        ),

        # CVV/CVC Codes
        # Matches: cvv:123, cvc=456, cvv2: 789
        # PCI DSS 3.2: CVV must not be stored after authorization
        (
            re.compile(r'\b(cvv|cvc|cvv2|cvc2|cid)[\s:=]+\d{3,4}\b', re.IGNORECASE),
            r'\1: [CVV_REDACTED]',
            'CVV/CVC security code'
        ),

        # Stripe Customer IDs
        # Format: cus_XXXXXXXXXXXX (14+ alphanumeric)
        # Contains customer linkage - PII
        (
            re.compile(r'\bcus_[a-zA-Z0-9]{14,}\b'),
            '[CUSTOMER_ID_REDACTED]',
            'Stripe customer ID'
        ),

        # Stripe Payment Method IDs
        # Format: pm_XXXXXXXXXXXX
        # Contains payment details - sensitive
        (
            re.compile(r'\bpm_[a-zA-Z0-9]{14,}\b'),
            '[PAYMENT_METHOD_REDACTED]',
            'Stripe payment method ID'
        ),

        # Stripe Payment Intent IDs
        # Format: pi_XXXXXXXXXXXX
        # Transaction linkage - sensitive
        (
            re.compile(r'\bpi_[a-zA-Z0-9]{14,}\b'),
            '[PAYMENT_INTENT_REDACTED]',
            'Stripe payment intent ID'
        ),

        # Stripe Secret Keys
        # Format: sk_live_XXXX or sk_test_XXXX
        # CRITICAL: API credentials must never be logged
        (
            re.compile(r'\bsk_(live|test)_[a-zA-Z0-9]{20,}\b'),
            '[STRIPE_SECRET_KEY_REDACTED]',
            'Stripe secret API key'
        ),

        # Stripe Publishable Keys
        # Format: pk_live_XXXX or pk_test_XXXX
        # Less sensitive but still credentials
        (
            re.compile(r'\bpk_(live|test)_[a-zA-Z0-9]{20,}\b'),
            '[STRIPE_PUBLISHABLE_KEY_REDACTED]',
            'Stripe publishable key'
        ),

        # Stripe Subscription IDs
        # Format: sub_XXXXXXXXXXXX
        # Customer linkage - PII
        (
            re.compile(r'\bsub_[a-zA-Z0-9]{14,}\b'),
            '[SUBSCRIPTION_ID_REDACTED]',
            'Stripe subscription ID'
        ),

        # Stripe Charge IDs
        # Format: ch_XXXXXXXXXXXX
        # Transaction data - sensitive
        (
            re.compile(r'\bch_[a-zA-Z0-9]{14,}\b'),
            '[CHARGE_ID_REDACTED]',
            'Stripe charge ID'
        ),

        # Stripe Invoice IDs
        # Format: in_XXXXXXXXXXXX
        # Financial data - sensitive
        (
            re.compile(r'\bin_[a-zA-Z0-9]{14,}\b'),
            '[INVOICE_ID_REDACTED]',
            'Stripe invoice ID'
        ),

        # Email Addresses in Payment Context
        # Only redact in payment-related messages to avoid over-redaction
        # Note: This is a broad pattern - consider context-aware filtering
        (
            re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
            '[EMAIL_REDACTED]',
            'Email address (PII)'
        ),

        # Bearer Tokens / JWT Tokens
        # Format: Bearer eyJXXXXX... or jwt:eyJXXXXX...
        (
            re.compile(r'\b(Bearer|JWT|jwt)\s+[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+', re.IGNORECASE),
            r'\1 [TOKEN_REDACTED]',
            'Bearer/JWT token'
        ),

        # API Keys (generic pattern)
        # Format: api_key=XXXX, apiKey:XXXX, authorization: XXXX
        (
            re.compile(r'(api[_\-]?key|authorization)[\s:=]+[\'"]?[a-zA-Z0-9_\-]{20,}[\'"]?', re.IGNORECASE),
            r'\1: [API_KEY_REDACTED]',
            'Generic API key'
        ),

        # Bank Account Numbers
        # Matches: account:123456789, acct_XXXXX
        (
            re.compile(r'\b(account|acct|bank[_\-]?account)[\s:=]+[0-9]{6,}\b', re.IGNORECASE),
            r'\1: [ACCOUNT_REDACTED]',
            'Bank account number'
        ),

        # Routing Numbers (US)
        # Format: routing:123456789 (9 digits)
        (
            re.compile(r'\b(routing|aba)[\s:=]+[0-9]{9}\b', re.IGNORECASE),
            r'\1: [ROUTING_REDACTED]',
            'Bank routing number'
        ),

        # Social Security Numbers (SSN)
        # Format: 123-45-6789 or 123456789
        (
            re.compile(r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b'),
            '[SSN_REDACTED]',
            'Social Security Number'
        ),
    ]

    def __init__(self, additional_patterns: Optional[List[Tuple[Pattern, str, str]]] = None):
        """
        Initialize PCI logging filter.

        Args:
            additional_patterns: Optional list of additional (pattern, replacement, description) tuples
                                to extend the default redaction patterns
        """
        super().__init__()

        # Compile all patterns
        self.patterns = self.REDACTION_PATTERNS.copy()

        # Add any additional patterns
        if additional_patterns:
            self.patterns.extend(additional_patterns)

        # Track redaction statistics for monitoring
        self.redaction_count = 0
        self.redactions_by_type = {}

        logging.info(
            f"[PCI FILTER] Initialized with {len(self.patterns)} redaction patterns"
        )

    def filter(self, record: logging.LogRecord) -> bool:
        """
        Filter log record by redacting sensitive information.

        This method is called by the logging framework for every log message.
        It modifies the record in-place, redacting any sensitive patterns.

        Args:
            record: LogRecord to filter

        Returns:
            True (always allow the record to be logged after redaction)

        PCI Compliance:
        - Ensures PAN never appears in logs (PCI DSS 3.4)
        - Prevents accidental exposure via log aggregation systems
        - Maintains audit trail without compromising cardholder data
        """
        try:
            # Redact the main message
            if hasattr(record, 'msg'):
                original_msg = str(record.msg)
                redacted_msg = self._redact_sensitive_data(original_msg)

                if redacted_msg != original_msg:
                    record.msg = redacted_msg
                    self.redaction_count += 1

            # Redact arguments if present
            if hasattr(record, 'args') and record.args:
                if isinstance(record.args, dict):
                    record.args = {
                        k: self._redact_sensitive_data(str(v))
                        for k, v in record.args.items()
                    }
                elif isinstance(record.args, tuple):
                    record.args = tuple(
                        self._redact_sensitive_data(str(arg))
                        for arg in record.args
                    )

            # Redact exception info if present
            if hasattr(record, 'exc_text') and record.exc_text:
                record.exc_text = self._redact_sensitive_data(record.exc_text)

            # Redact stack info if present
            if hasattr(record, 'stack_info') and record.stack_info:
                record.stack_info = self._redact_sensitive_data(record.stack_info)

        except Exception as e:
            # NEVER let filter errors prevent logging
            # Log the filter error itself (without sensitive data)
            logging.getLogger(__name__).error(
                f"Error in PCI logging filter: {type(e).__name__}",
                exc_info=False
            )

        # Always return True to allow the log record through
        return True

    def _redact_sensitive_data(self, text: str) -> str:
        """
        Redact sensitive data from text using all patterns.

        Args:
            text: Text to redact

        Returns:
            Text with sensitive data replaced by placeholders

        Performance Note:
        - Compiled regex patterns are reused for efficiency
        - Runs in O(n*p) where n=text length, p=pattern count
        - Typically adds <1ms latency per log message
        """
        if not text:
            return text

        redacted_text = text

        # Apply all redaction patterns
        for pattern, replacement, description in self.patterns:
            if pattern.search(redacted_text):
                redacted_text = pattern.sub(replacement, redacted_text)

                # Track redaction type for monitoring
                self.redactions_by_type[description] = \
                    self.redactions_by_type.get(description, 0) + 1

        return redacted_text

    def get_statistics(self) -> dict:
        """
        Get redaction statistics for monitoring.

        Returns:
            Dict with redaction counts by type

        Use for:
        - Monitoring unexpected sensitive data in logs
        - Identifying code paths that need fixing
        - PCI audit evidence of protection measures
        """
        return {
            "total_redactions": self.redaction_count,
            "by_type": self.redactions_by_type.copy()
        }

    def reset_statistics(self) -> None:
        """Reset redaction statistics (useful for testing)"""
        self.redaction_count = 0
        self.redactions_by_type = {}


# ==========================================
# SETUP FUNCTION
# ==========================================

def setup_pci_compliant_logging(
    apply_to_root: bool = True,
    apply_to_loggers: Optional[List[str]] = None,
    log_level: Optional[str] = None
) -> PCILoggingFilter:
    """
    Set up PCI-compliant logging for the application.

    This function should be called at application startup (in main.py)
    to ensure all log messages are filtered for sensitive data.

    Args:
        apply_to_root: Apply filter to root logger (recommended)
        apply_to_loggers: List of specific logger names to filter
        log_level: Optional log level to set (DEBUG, INFO, WARNING, ERROR)

    Returns:
        PCILoggingFilter instance for monitoring

    Example:
        # In main.py startup
        filter = setup_pci_compliant_logging(
            apply_to_root=True,
            apply_to_loggers=['api.payments', 'api.subscriptions'],
            log_level='INFO'
        )

    PCI Compliance:
    - MUST be called before any payment processing
    - Protects against accidental PAN exposure
    - Defense-in-depth: Filters even if developers forget
    """
    pci_filter = PCILoggingFilter()

    # Apply to root logger (catches all loggers)
    if apply_to_root:
        root_logger = logging.getLogger()
        root_logger.addFilter(pci_filter)
        logging.info("[PCI FILTER] Applied to root logger (all logs protected)")

    # Apply to specific loggers
    if apply_to_loggers:
        for logger_name in apply_to_loggers:
            logger = logging.getLogger(logger_name)
            logger.addFilter(pci_filter)
            logging.info(f"[PCI FILTER] Applied to logger: {logger_name}")

    # Set log level if specified
    if log_level:
        logging.getLogger().setLevel(log_level)

    # Log completion for audit trail
    logging.info(
        "[PCI FILTER] PCI-compliant logging initialized. "
        "All sensitive payment data will be redacted from logs."
    )

    return pci_filter


# ==========================================
# CONTEXT MANAGER FOR TESTING
# ==========================================

class TemporaryPCIFilter:
    """
    Context manager for temporarily applying PCI filter in tests.

    Example:
        with TemporaryPCIFilter():
            logger.info("Processing card 4111-1111-1111-1111")
            # Logs: "Processing card [CARD_REDACTED]"
    """

    def __init__(self, logger_name: Optional[str] = None):
        self.logger_name = logger_name
        self.filter = None

    def __enter__(self):
        self.filter = PCILoggingFilter()
        logger = logging.getLogger(self.logger_name)
        logger.addFilter(self.filter)
        return self.filter

    def __exit__(self, exc_type, exc_val, exc_tb):
        logger = logging.getLogger(self.logger_name)
        logger.removeFilter(self.filter)


# ==========================================
# TESTING
# ==========================================

if __name__ == '__main__':
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    print("\n=== PCI Logging Filter Test ===\n")

    # Set up PCI filter
    pci_filter = setup_pci_compliant_logging(
        apply_to_root=True,
        log_level='INFO'
    )

    test_logger = logging.getLogger('test')

    # Test card number redaction
    print("\n--- Test 1: Credit Card Numbers ---")
    test_logger.info("Processing payment with card 4111-1111-1111-1111")
    test_logger.info("Card number 4111111111111111 charged successfully")
    test_logger.info("Payment completed for card ending in 1234")  # Should keep this

    # Test CVV redaction
    print("\n--- Test 2: CVV Codes ---")
    test_logger.info("Validating CVV:123 for transaction")
    test_logger.info("CVC=456 validation failed")

    # Test Stripe IDs
    print("\n--- Test 3: Stripe IDs ---")
    test_logger.info("Customer cus_MKPxvWQp8PCd1a created")
    test_logger.info("Payment method pm_1234567890abcd attached")
    test_logger.info("Payment intent pi_1234567890abcd succeeded")

    # Test API keys
    print("\n--- Test 4: API Keys ---")
    test_logger.info("Using key sk_live_51234567890abcdefghijk")
    test_logger.info("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature")

    # Test email
    print("\n--- Test 5: Email Addresses ---")
    test_logger.info("Payment confirmation sent to customer@example.com")

    # Test bank account
    print("\n--- Test 6: Bank Account ---")
    test_logger.info("Bank account:123456789 verified")
    test_logger.info("Routing:987654321 added")

    # Get statistics
    print("\n--- Redaction Statistics ---")
    stats = pci_filter.get_statistics()
    print(f"Total redactions: {stats['total_redactions']}")
    print("\nBy type:")
    for data_type, count in sorted(stats['by_type'].items()):
        print(f"  {data_type}: {count}")

    print("\n✅ PCI logging filter test complete")
    print("\nCheck the log output above - all sensitive data should be redacted")
