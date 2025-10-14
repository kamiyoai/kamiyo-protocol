# -*- coding: utf-8 -*-
"""
Stripe Client for Kamiyo
Wrapper around Stripe SDK for customer and subscription management
"""

import os
import sys
import logging
import hashlib
from typing import Dict, Any, Optional, List
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import stripe
from stripe._error import (
    APIConnectionError,
    RateLimitError,
    APIError,
    CardError,
    InvalidRequestError,
    AuthenticationError,
    StripeError
)
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError
)
from config.stripe_config import get_stripe_config
from database import get_db
from monitoring.prometheus_metrics import payments_total, revenue_total, subscriptions_total
from monitoring.alerts import get_alert_manager, AlertLevel
from api.payments.distributed_circuit_breaker import get_circuit_breaker

logger = logging.getLogger(__name__)


class StripeClient:
    """
    Stripe API wrapper for Kamiyo

    Provides high-level interface for:
    - Customer management (CRUD operations)
    - Subscription management (create, update, cancel)
    - Payment method handling
    - Payment intent creation
    - Comprehensive error handling and logging
    """

    def __init__(self):
        """Initialize Stripe client with configuration"""

        # Load Stripe configuration
        self.config = get_stripe_config()

        # Set Stripe API key
        if self.config.secret_key:
            stripe.api_key = self.config.secret_key
            stripe.api_version = self.config.api_version
            logger.info(f"Stripe client initialized - API version: {self.config.api_version}")
        else:
            logger.error("Stripe API key not configured - payment processing disabled")
            raise ValueError("STRIPE_SECRET_KEY environment variable required")

        # Get database instance
        self.db = get_db()

        # Get alert manager
        self.alert_manager = get_alert_manager()

        # Initialize distributed circuit breaker for PCI compliance
        # PCI DSS 12.10.1: Incident response plan for payment processing failures
        self.circuit_breaker = get_circuit_breaker(
            service_name="stripe_api",
            failure_threshold=5,
            timeout_seconds=60
        )
        logger.info("[PCI] Circuit breaker initialized for Stripe API calls")

    # ==========================================
    # CIRCUIT BREAKER HELPER
    # ==========================================

    @retry(
        # Only retry on transient errors (network, rate limit, 500s)
        retry=retry_if_exception_type((
            APIConnectionError,  # Network errors
            RateLimitError,      # 429 rate limits
            APIError             # 500/502/503/504 errors
        )),
        # Exponential backoff: 1s, 2s, 4s, 8s (max 10s)
        wait=wait_exponential(multiplier=1, min=1, max=10),
        # Max 3 retry attempts
        stop=stop_after_attempt(3),
        # Log before each retry
        before_sleep=before_sleep_log(logger, logging.WARNING),
        # Reraise the last exception if all retries fail
        reraise=True
    )
    def _call_stripe_api(self, api_callable, *args, **kwargs):
        """
        Execute Stripe API call with circuit breaker protection and automatic retries.

        This wrapper ensures that:
        1. Circuit breaker is checked before making API calls
        2. Transient errors (network, rate limit, 500s) are automatically retried
        3. Non-retryable errors (card declined, invalid request) fail immediately
        4. Successful calls reset failure counters
        5. Failed calls increment failure counters and potentially open circuit
        6. Circuit breaker state is available for monitoring

        Retry Strategy (PCI DSS 12.10.1 - Incident Response):
        - Network errors (APIConnectionError): Retry 3x with exponential backoff
        - Rate limits (RateLimitError): Retry 3x with exponential backoff
        - Server errors (APIError 500/502/503): Retry 3x with exponential backoff
        - Card errors (CardError): NEVER retry - user must fix card
        - Invalid requests (InvalidRequestError): NEVER retry - code bug

        Backoff Schedule:
        - Attempt 1: Immediate
        - Attempt 2: Wait 1-2 seconds
        - Attempt 3: Wait 2-4 seconds
        - Attempt 4: Wait 4-8 seconds (max 10s)

        PCI DSS Compliance:
        - Requirement 12.10.1: Incident response for payment processing failures
        - Prevents excessive failed attempts during Stripe outages
        - Provides audit trail of API failures and retries
        - Automatic recovery from transient failures

        Args:
            api_callable: Stripe API function to call
            *args: Positional arguments for the API call
            **kwargs: Keyword arguments for the API call

        Returns:
            Result from Stripe API call

        Raises:
            stripe.error.CardError: Card was declined (DO NOT RETRY)
            stripe.error.InvalidRequestError: Invalid parameters (DO NOT RETRY)
            stripe.error.AuthenticationError: Invalid API key (DO NOT RETRY)
            stripe.error.APIConnectionError: Network failure (after retries)
            stripe.error.RateLimitError: Rate limit (after retries)
            stripe.error.APIError: Stripe server error (after retries)
            Exception: If circuit breaker is open
        """
        # Check if circuit breaker allows the call
        if not self.circuit_breaker.can_call():
            error_msg = (
                "Circuit breaker OPEN - Stripe API calls temporarily blocked. "
                "Payment processing is degraded. Alert operations team."
            )
            logger.error(f"[CIRCUIT BREAKER] {error_msg}")

            # Send critical alert
            self.alert_manager.send_alert(
                title="Payment Processing Circuit Breaker OPEN",
                message=error_msg,
                level=AlertLevel.CRITICAL,
                metadata=self.circuit_breaker.get_status()
            )

            raise Exception(error_msg)

        try:
            # Make the API call (tenacity will automatically retry on retryable errors)
            result = api_callable(*args, **kwargs)

            # Record success
            self.circuit_breaker.record_success()

            return result

        except (CardError,
                InvalidRequestError,
                AuthenticationError) as e:
            # NON-RETRYABLE errors - fail immediately
            # Record failure but don't retry
            self.circuit_breaker.record_failure(e)

            # Log for audit trail
            logger.error(
                f"[STRIPE NON-RETRYABLE ERROR] {type(e).__name__}: {str(e)}",
                extra={
                    "circuit_breaker_status": self.circuit_breaker.get_status(),
                    "error_type": "non_retryable"
                }
            )

            # Re-raise immediately (do not retry)
            raise

        except StripeError as e:
            # RETRYABLE errors - tenacity handles retries
            # Record failure
            self.circuit_breaker.record_failure(e)

            # Log for audit trail
            logger.error(
                f"[STRIPE RETRYABLE ERROR] {type(e).__name__}: {str(e)}",
                extra={
                    "circuit_breaker_status": self.circuit_breaker.get_status(),
                    "error_type": "retryable"
                }
            )

            # Re-raise for tenacity to handle (will retry if retryable)
            raise

        except Exception as e:
            # Generic failure
            self.circuit_breaker.record_failure(e)

            logger.error(
                f"[API CALL ERROR] {type(e).__name__}: {str(e)}",
                extra={"circuit_breaker_status": self.circuit_breaker.get_status()}
            )

            raise

    def get_circuit_breaker_status(self) -> Dict[str, Any]:
        """
        Get current circuit breaker status for monitoring.

        Returns:
            Dict with circuit state, failure counts, and metrics

        Use for:
        - Health check endpoints
        - Monitoring dashboards
        - PCI audit reports
        """
        return self.circuit_breaker.get_status()

    # ==========================================
    # IDEMPOTENCY KEY GENERATION
    # ==========================================

    def _generate_idempotency_key(self, operation: str, user_id: int, **kwargs) -> str:
        """
        Generate deterministic idempotency key for Stripe API calls.

        CRITICAL FOR PCI COMPLIANCE:
        - Prevents double-charging on retries (PCI DSS 12.10.1)
        - Same inputs = same key = Stripe deduplicates automatically
        - Keys are scoped to date to allow same operation next day

        How it works:
        1. Combine: operation name + user_id + date + additional params
        2. Hash with SHA-256 for consistency
        3. Truncate to 32 chars (Stripe limit: 255 chars, we use 32 for readability)

        Example inputs:
        - operation: "customer-create"
        - user_id: 12345
        - date: "2025-10-13"

        Output: "a3f9b8c7d2e1f4g5h6i7j8k9l0m1n2o3" (32 chars)

        Args:
            operation: Operation identifier (e.g., "customer-create", "subscription-create")
            user_id: User ID performing the operation
            **kwargs: Additional parameters to include in key (e.g., price_id, tier)

        Returns:
            32-character deterministic idempotency key

        Notes:
        - Keys are date-scoped: same operation different days = different keys
        - Retries on same day: same key = Stripe returns cached result
        - Different parameters: different key = different operation
        """
        # Include today's date for daily scoping
        today = datetime.utcnow().date().isoformat()

        # Build key input string
        # Format: operation-user_id-date-param1-param2...
        key_parts = [operation, str(user_id), today]

        # Add additional parameters in sorted order for consistency
        for key in sorted(kwargs.keys()):
            value = kwargs[key]
            if value is not None:
                key_parts.append(f"{key}:{value}")

        key_input = "-".join(key_parts)

        # Hash with SHA-256 for deterministic output
        hash_object = hashlib.sha256(key_input.encode('utf-8'))
        idempotency_key = hash_object.hexdigest()[:32]

        logger.debug(
            f"[IDEMPOTENCY] Generated key for operation={operation}, user_id={user_id}",
            extra={
                'key_input': key_input,
                'idempotency_key': idempotency_key
            }
        )

        return idempotency_key

    def _check_duplicate_operation(self, operation: str, user_id: int, **kwargs) -> Optional[Dict[str, Any]]:
        """
        Check if operation already exists in database before calling Stripe.

        This is the FIRST line of defense against duplicate operations:
        1. Query database for existing record (customer/subscription)
        2. If exists, return existing record (skip Stripe call entirely)
        3. If not exists, proceed with Stripe call using idempotency key

        This prevents:
        - Unnecessary Stripe API calls
        - Race conditions in high-concurrency scenarios
        - Double-charging even if idempotency keys fail

        Args:
            operation: Operation type ("customer-create", "subscription-create")
            user_id: User ID
            **kwargs: Additional lookup parameters

        Returns:
            Existing record dict if found, None otherwise
        """
        try:
            if operation == "customer-create":
                # Check if customer already exists for this user
                query = """
                    SELECT id, stripe_customer_id, user_id, email, name, metadata, created_at, updated_at
                    FROM customers
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                """
                result = self.db.execute_with_retry(query, (user_id,), readonly=True)

                if result:
                    logger.info(f"[DEDUPLICATION] Customer already exists for user {user_id}")
                    return dict(result[0])

            elif operation == "subscription-create":
                # Check if active subscription exists for this customer
                customer_id = kwargs.get('customer_id')
                if customer_id:
                    query = """
                        SELECT id, stripe_subscription_id, customer_id, status, tier,
                               current_period_start, current_period_end, cancel_at_period_end,
                               metadata, created_at, updated_at
                        FROM subscriptions
                        WHERE customer_id = %s AND status IN ('active', 'trialing')
                        ORDER BY created_at DESC
                        LIMIT 1
                    """
                    result = self.db.execute_with_retry(query, (customer_id,), readonly=True)

                    if result:
                        logger.info(f"[DEDUPLICATION] Active subscription already exists for customer {customer_id}")
                        return dict(result[0])

            return None

        except Exception as e:
            logger.error(f"[DEDUPLICATION] Error checking for duplicates: {e}")
            # On error, return None to proceed with Stripe call
            # Better to risk a duplicate than block legitimate operations
            return None

    # ==========================================
    # CUSTOMER OPERATIONS
    # ==========================================

    async def create_customer(
        self,
        user_id: int,
        email: str,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new Stripe customer and store in database

        PCI Compliance Enhancements:
        - Checks for existing customer before creating (prevents duplicates)
        - Uses deterministic idempotency key (prevents double-creation on retry)
        - Circuit breaker protection (prevents cascading failures)

        Args:
            user_id: Internal user ID
            email: Customer email address
            name: Customer name (optional)
            metadata: Additional metadata (optional)

        Returns:
            Customer data dict with database ID and Stripe customer ID

        Raises:
            stripe.error.StripeError: If Stripe API call fails
        """

        try:
            logger.info(f"Creating Stripe customer for user {user_id}: {email}")

            # DEFENSE #1: Check if customer already exists in database
            existing = self._check_duplicate_operation("customer-create", user_id)
            if existing:
                logger.info(f"[IDEMPOTENCY] Returning existing customer for user {user_id}")
                return existing

            # DEFENSE #2: Generate deterministic idempotency key
            idempotency_key = self._generate_idempotency_key(
                "customer-create",
                user_id,
                email=email
            )

            # Create customer in Stripe (with circuit breaker protection)
            stripe_customer = self._call_stripe_api(
                stripe.Customer.create,
                email=email,
                name=name,
                metadata={
                    **(metadata or {}),
                    'user_id': str(user_id),
                    'platform': 'kamiyo'
                },
                idempotency_key=idempotency_key
            )

            logger.info(f"Stripe customer created: {stripe_customer.id}")

            # Store in database
            query = """
                INSERT INTO customers (stripe_customer_id, user_id, email, name, metadata)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, stripe_customer_id, user_id, email, name, metadata, created_at, updated_at
            """

            params = (
                stripe_customer.id,
                user_id,
                email,
                name,
                metadata
            )

            result = self.db.execute_with_retry(query, params, readonly=False)

            if not result:
                raise Exception("Failed to store customer in database")

            customer_data = dict(result[0])
            logger.info(f"Customer stored in database with ID: {customer_data['id']}")

            return customer_data

        except StripeError as e:
            logger.error(f"Stripe error creating customer: {e}")
            self.alert_manager.send_alert(
                title="Stripe Customer Creation Failed",
                message=f"Failed to create customer for {email}: {str(e)}",
                level=AlertLevel.ERROR,
                metadata={'email': email, 'error': str(e)}
            )
            raise

        except Exception as e:
            logger.error(f"Error creating customer: {e}")
            raise

    async def get_customer(self, customer_id: int) -> Optional[Dict[str, Any]]:
        """
        Get customer by database ID

        Args:
            customer_id: Database customer ID

        Returns:
            Customer data dict or None if not found
        """

        try:
            query = """
                SELECT id, stripe_customer_id, user_id, email, name, metadata, created_at, updated_at
                FROM customers
                WHERE id = %s
            """

            result = self.db.execute_with_retry(query, (customer_id,), readonly=True)

            if not result:
                return None

            return dict(result[0])

        except Exception as e:
            logger.error(f"Error fetching customer {customer_id}: {e}")
            raise

    async def get_customer_by_stripe_id(self, stripe_customer_id: str) -> Optional[Dict[str, Any]]:
        """
        Get customer by Stripe customer ID

        Args:
            stripe_customer_id: Stripe customer ID

        Returns:
            Customer data dict or None if not found
        """

        try:
            query = """
                SELECT id, stripe_customer_id, user_id, email, name, metadata, created_at, updated_at
                FROM customers
                WHERE stripe_customer_id = %s
            """

            result = self.db.execute_with_retry(query, (stripe_customer_id,), readonly=True)

            if not result:
                return None

            return dict(result[0])

        except Exception as e:
            logger.error(f"Error fetching customer by Stripe ID {stripe_customer_id}: {e}")
            raise

    async def update_customer(
        self,
        customer_id: int,
        email: Optional[str] = None,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Update customer information

        Args:
            customer_id: Database customer ID
            email: New email (optional)
            name: New name (optional)
            metadata: New metadata (optional)

        Returns:
            Updated customer data dict

        Raises:
            ValueError: If customer not found
        """

        try:
            # Get existing customer
            customer = await self.get_customer(customer_id)
            if not customer:
                raise ValueError(f"Customer {customer_id} not found")

            logger.info(f"Updating customer {customer_id}")

            # Update in Stripe
            update_params = {}
            if email:
                update_params['email'] = email
            if name:
                update_params['name'] = name
            if metadata:
                update_params['metadata'] = metadata

            if update_params:
                stripe.Customer.modify(
                    customer['stripe_customer_id'],
                    **update_params
                )

            # Update in database
            query = """
                UPDATE customers
                SET email = COALESCE(%s, email),
                    name = COALESCE(%s, name),
                    metadata = COALESCE(%s, metadata)
                WHERE id = %s
                RETURNING id, stripe_customer_id, user_id, email, name, metadata, created_at, updated_at
            """

            params = (email, name, metadata, customer_id)
            result = self.db.execute_with_retry(query, params, readonly=False)

            if not result:
                raise Exception("Failed to update customer in database")

            logger.info(f"Customer {customer_id} updated successfully")

            return dict(result[0])

        except StripeError as e:
            logger.error(f"Stripe error updating customer: {e}")
            raise

        except Exception as e:
            logger.error(f"Error updating customer {customer_id}: {e}")
            raise

    async def delete_customer(self, customer_id: int) -> bool:
        """
        Delete customer from Stripe and database

        Args:
            customer_id: Database customer ID

        Returns:
            True if deleted successfully

        Raises:
            ValueError: If customer not found
        """

        try:
            # Get existing customer
            customer = await self.get_customer(customer_id)
            if not customer:
                raise ValueError(f"Customer {customer_id} not found")

            logger.info(f"Deleting customer {customer_id}")

            # Delete from Stripe
            stripe.Customer.delete(customer['stripe_customer_id'])

            # Delete from database (cascade will delete related records)
            query = "DELETE FROM customers WHERE id = %s"
            self.db.execute_with_retry(query, (customer_id,), readonly=False)

            logger.info(f"Customer {customer_id} deleted successfully")

            return True

        except StripeError as e:
            logger.error(f"Stripe error deleting customer: {e}")
            raise

        except Exception as e:
            logger.error(f"Error deleting customer {customer_id}: {e}")
            raise

    # ==========================================
    # SUBSCRIPTION OPERATIONS
    # ==========================================

    async def create_subscription(
        self,
        customer_id: int,
        price_id: str,
        tier: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new subscription for a customer

        PCI Compliance Enhancements:
        - Checks for existing active subscription (prevents double-subscription)
        - Uses deterministic idempotency key (prevents double-charging on retry)
        - Circuit breaker protection (prevents cascading failures)

        Args:
            customer_id: Database customer ID
            price_id: Stripe price ID
            tier: Subscription tier (basic, pro, enterprise)
            metadata: Additional metadata (optional)

        Returns:
            Subscription data dict

        Raises:
            ValueError: If customer not found
            stripe.error.StripeError: If Stripe API call fails
        """

        try:
            # Get customer
            customer = await self.get_customer(customer_id)
            if not customer:
                raise ValueError(f"Customer {customer_id} not found")

            logger.info(f"Creating subscription for customer {customer_id}: tier={tier}")

            # DEFENSE #1: Check if active subscription already exists
            existing = self._check_duplicate_operation(
                "subscription-create",
                customer['user_id'],
                customer_id=customer_id
            )
            if existing:
                logger.info(f"[IDEMPOTENCY] Returning existing subscription for customer {customer_id}")
                return existing

            # DEFENSE #2: Generate deterministic idempotency key
            idempotency_key = self._generate_idempotency_key(
                "subscription-create",
                customer['user_id'],
                customer_id=customer_id,
                price_id=price_id,
                tier=tier
            )

            # Create subscription in Stripe (with circuit breaker protection)
            stripe_subscription = self._call_stripe_api(
                stripe.Subscription.create,
                customer=customer['stripe_customer_id'],
                items=[{'price': price_id}],
                metadata={
                    **(metadata or {}),
                    'tier': tier,
                    'customer_db_id': str(customer_id)
                },
                payment_behavior='default_incomplete',
                expand=['latest_invoice.payment_intent'],
                idempotency_key=idempotency_key
            )

            logger.info(f"Stripe subscription created: {stripe_subscription.id}")

            # Store in database
            query = """
                INSERT INTO subscriptions (
                    stripe_subscription_id, customer_id, status, tier,
                    current_period_start, current_period_end, cancel_at_period_end, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, stripe_subscription_id, customer_id, status, tier,
                          current_period_start, current_period_end, cancel_at_period_end,
                          metadata, created_at, updated_at
            """

            params = (
                stripe_subscription.id,
                customer_id,
                stripe_subscription.status,
                tier,
                datetime.fromtimestamp(stripe_subscription.current_period_start),
                datetime.fromtimestamp(stripe_subscription.current_period_end),
                stripe_subscription.cancel_at_period_end,
                metadata
            )

            result = self.db.execute_with_retry(query, params, readonly=False)

            if not result:
                raise Exception("Failed to store subscription in database")

            subscription_data = dict(result[0])
            logger.info(f"Subscription stored in database with ID: {subscription_data['id']}")

            # Track metrics
            subscriptions_total.labels(tier=tier, event='created').inc()

            # Get plan price for revenue tracking
            plan_config = self.config.get_plan_config(tier)
            if plan_config:
                revenue_total.labels(tier=tier).inc(plan_config['price'])

            return subscription_data

        except StripeError as e:
            logger.error(f"Stripe error creating subscription: {e}")
            self.alert_manager.alert_payment_failure(
                user_email=customer['email'],
                amount=0,
                error=str(e)
            )
            raise

        except Exception as e:
            logger.error(f"Error creating subscription: {e}")
            raise

    async def get_subscription(self, subscription_id: int) -> Optional[Dict[str, Any]]:
        """
        Get subscription by database ID

        Args:
            subscription_id: Database subscription ID

        Returns:
            Subscription data dict or None if not found
        """

        try:
            query = """
                SELECT id, stripe_subscription_id, customer_id, status, tier,
                       current_period_start, current_period_end, cancel_at_period_end,
                       metadata, created_at, updated_at
                FROM subscriptions
                WHERE id = %s
            """

            result = self.db.execute_with_retry(query, (subscription_id,), readonly=True)

            if not result:
                return None

            return dict(result[0])

        except Exception as e:
            logger.error(f"Error fetching subscription {subscription_id}: {e}")
            raise

    async def update_subscription(
        self,
        subscription_id: int,
        price_id: Optional[str] = None,
        tier: Optional[str] = None,
        cancel_at_period_end: Optional[bool] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Update subscription

        Args:
            subscription_id: Database subscription ID
            price_id: New Stripe price ID (optional)
            tier: New tier (optional)
            cancel_at_period_end: Whether to cancel at period end (optional)
            metadata: New metadata (optional)

        Returns:
            Updated subscription data dict

        Raises:
            ValueError: If subscription not found
        """

        try:
            # Get existing subscription
            subscription = await self.get_subscription(subscription_id)
            if not subscription:
                raise ValueError(f"Subscription {subscription_id} not found")

            logger.info(f"Updating subscription {subscription_id}")

            # Update in Stripe
            update_params = {}

            if price_id:
                # Get current subscription items
                stripe_sub = stripe.Subscription.retrieve(subscription['stripe_subscription_id'])
                update_params['items'] = [{
                    'id': stripe_sub['items']['data'][0].id,
                    'price': price_id
                }]

            if cancel_at_period_end is not None:
                update_params['cancel_at_period_end'] = cancel_at_period_end

            if metadata:
                update_params['metadata'] = metadata

            if update_params:
                stripe_subscription = stripe.Subscription.modify(
                    subscription['stripe_subscription_id'],
                    **update_params
                )
            else:
                stripe_subscription = stripe.Subscription.retrieve(
                    subscription['stripe_subscription_id']
                )

            # Update in database
            query = """
                UPDATE subscriptions
                SET tier = COALESCE(%s, tier),
                    status = %s,
                    current_period_start = %s,
                    current_period_end = %s,
                    cancel_at_period_end = %s,
                    metadata = COALESCE(%s, metadata)
                WHERE id = %s
                RETURNING id, stripe_subscription_id, customer_id, status, tier,
                          current_period_start, current_period_end, cancel_at_period_end,
                          metadata, created_at, updated_at
            """

            params = (
                tier,
                stripe_subscription.status,
                datetime.fromtimestamp(stripe_subscription.current_period_start),
                datetime.fromtimestamp(stripe_subscription.current_period_end),
                stripe_subscription.cancel_at_period_end,
                metadata,
                subscription_id
            )

            result = self.db.execute_with_retry(query, params, readonly=False)

            if not result:
                raise Exception("Failed to update subscription in database")

            logger.info(f"Subscription {subscription_id} updated successfully")

            # Track metrics
            if tier and tier != subscription['tier']:
                subscriptions_total.labels(tier=tier, event='upgraded').inc()

            return dict(result[0])

        except StripeError as e:
            logger.error(f"Stripe error updating subscription: {e}")
            raise

        except Exception as e:
            logger.error(f"Error updating subscription {subscription_id}: {e}")
            raise

    async def cancel_subscription(
        self,
        subscription_id: int,
        cancel_immediately: bool = False
    ) -> Dict[str, Any]:
        """
        Cancel a subscription

        Args:
            subscription_id: Database subscription ID
            cancel_immediately: Cancel now (True) or at period end (False)

        Returns:
            Updated subscription data dict

        Raises:
            ValueError: If subscription not found
        """

        try:
            # Get existing subscription
            subscription = await self.get_subscription(subscription_id)
            if not subscription:
                raise ValueError(f"Subscription {subscription_id} not found")

            logger.info(f"Canceling subscription {subscription_id} (immediate={cancel_immediately})")

            # Cancel in Stripe
            if cancel_immediately:
                stripe_subscription = stripe.Subscription.delete(
                    subscription['stripe_subscription_id']
                )
            else:
                stripe_subscription = stripe.Subscription.modify(
                    subscription['stripe_subscription_id'],
                    cancel_at_period_end=True
                )

            # Update in database
            if cancel_immediately:
                query = """
                    UPDATE subscriptions
                    SET status = 'canceled',
                        cancel_at_period_end = TRUE,
                        canceled_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, stripe_subscription_id, customer_id, status, tier,
                              current_period_start, current_period_end, cancel_at_period_end,
                              metadata, created_at, updated_at
                """
            else:
                query = """
                    UPDATE subscriptions
                    SET cancel_at_period_end = TRUE
                    WHERE id = %s
                    RETURNING id, stripe_subscription_id, customer_id, status, tier,
                              current_period_start, current_period_end, cancel_at_period_end,
                              metadata, created_at, updated_at
                """

            result = self.db.execute_with_retry(query, (subscription_id,), readonly=False)

            if not result:
                raise Exception("Failed to update subscription in database")

            logger.info(f"Subscription {subscription_id} canceled successfully")

            # Track metrics
            subscriptions_total.labels(tier=subscription['tier'], event='cancelled').inc()

            return dict(result[0])

        except StripeError as e:
            logger.error(f"Stripe error canceling subscription: {e}")
            raise

        except Exception as e:
            logger.error(f"Error canceling subscription {subscription_id}: {e}")
            raise

    # ==========================================
    # PAYMENT METHOD OPERATIONS
    # ==========================================

    async def attach_payment_method(
        self,
        customer_id: int,
        payment_method_id: str
    ) -> Dict[str, Any]:
        """
        Attach payment method to customer

        Args:
            customer_id: Database customer ID
            payment_method_id: Stripe payment method ID

        Returns:
            Payment method data dict

        Raises:
            ValueError: If customer not found
        """

        try:
            # Get customer
            customer = await self.get_customer(customer_id)
            if not customer:
                raise ValueError(f"Customer {customer_id} not found")

            logger.info(f"Attaching payment method {payment_method_id} to customer {customer_id}")

            # Attach payment method in Stripe
            stripe.PaymentMethod.attach(
                payment_method_id,
                customer=customer['stripe_customer_id']
            )

            # Set as default payment method
            stripe.Customer.modify(
                customer['stripe_customer_id'],
                invoice_settings={'default_payment_method': payment_method_id}
            )

            # Get payment method details
            payment_method = stripe.PaymentMethod.retrieve(payment_method_id)

            # Store in database
            query = """
                INSERT INTO payment_methods (
                    stripe_payment_method_id, customer_id, type,
                    card_brand, card_last4, card_exp_month, card_exp_year, is_default
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, stripe_payment_method_id, customer_id, type,
                          card_brand, card_last4, card_exp_month, card_exp_year,
                          is_default, created_at
            """

            params = (
                payment_method.id,
                customer_id,
                payment_method.type,
                payment_method.card.brand if payment_method.type == 'card' else None,
                payment_method.card.last4 if payment_method.type == 'card' else None,
                payment_method.card.exp_month if payment_method.type == 'card' else None,
                payment_method.card.exp_year if payment_method.type == 'card' else None,
                True
            )

            result = self.db.execute_with_retry(query, params, readonly=False)

            if not result:
                raise Exception("Failed to store payment method in database")

            logger.info(f"Payment method attached and stored successfully")

            return dict(result[0])

        except StripeError as e:
            logger.error(f"Stripe error attaching payment method: {e}")
            raise

        except Exception as e:
            logger.error(f"Error attaching payment method: {e}")
            raise


# Singleton instance
_stripe_client = None


def get_stripe_client() -> StripeClient:
    """
    Get Stripe client singleton

    Returns:
        StripeClient instance
    """

    global _stripe_client
    if _stripe_client is None:
        _stripe_client = StripeClient()
    return _stripe_client


# Test function
if __name__ == '__main__':
    import logging
    import asyncio

    logging.basicConfig(level=logging.INFO)

    async def test_stripe_client():
        """Test Stripe client functionality"""

        print("\n=== Stripe Client Test ===\n")

        try:
            client = get_stripe_client()
            print("✓ Stripe client initialized")

            # Note: Actual testing requires:
            # - Valid Stripe API keys
            # - PostgreSQL database connection
            # - User account in database

            print("\n✅ Stripe client ready")
            print("\nTo test fully, set these environment variables:")
            print("  - STRIPE_SECRET_KEY=sk_test_...")
            print("  - STRIPE_PUBLISHABLE_KEY=pk_test_...")
            print("  - DATABASE_URL=postgresql://...")

        except Exception as e:
            print(f"\n❌ Initialization error: {e}")
            print("Set required environment variables and try again")

    # Run test
    asyncio.run(test_stripe_client())
