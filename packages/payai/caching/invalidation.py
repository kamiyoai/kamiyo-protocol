# -*- coding: utf-8 -*-
"""
Cache Invalidation for Kamiyo
Event-driven and pattern-based cache invalidation
"""

import asyncio
import logging
import re
from typing import Any, Callable, Dict, List, Optional, Set
from datetime import datetime, timedelta
from enum import Enum

from .cache_manager import CacheManager, get_cache_manager

logger = logging.getLogger(__name__)


class InvalidationEvent(Enum):
    """Cache invalidation event types"""
    EXPLOIT_CREATED = "exploit.created"
    EXPLOIT_UPDATED = "exploit.updated"
    EXPLOIT_DELETED = "exploit.deleted"
    STATS_UPDATED = "stats.updated"
    USER_UPDATED = "user.updated"
    SUBSCRIPTION_UPDATED = "subscription.updated"
    PAYMENT_COMPLETED = "payment.completed"
    MANUAL = "manual"


class InvalidationRule:
    """Cache invalidation rule"""

    def __init__(
        self,
        event: InvalidationEvent,
        patterns: List[str],
        delay: int = 0,
        cascade: Optional[List[str]] = None
    ):
        """
        Initialize invalidation rule

        Args:
            event: Triggering event
            patterns: Cache key patterns to invalidate
            delay: Delay before invalidation (seconds)
            cascade: Additional patterns to invalidate cascading
        """
        self.event = event
        self.patterns = patterns
        self.delay = delay
        self.cascade = cascade or []

    def __repr__(self):
        return f"InvalidationRule(event={self.event}, patterns={self.patterns})"


class CacheInvalidator:
    """
    Manages cache invalidation with event-driven and pattern-based approaches
    """

    def __init__(self, cache_manager: Optional[CacheManager] = None):
        self.cache = cache_manager or get_cache_manager()

        # Invalidation rules
        self.rules: Dict[InvalidationEvent, List[InvalidationRule]] = {}

        # Invalidation log
        self.invalidation_log: List[Dict[str, Any]] = []
        self.max_log_size = 1000

        # Scheduled invalidations
        self.scheduled_tasks: Dict[str, asyncio.Task] = {}

        # Setup default rules
        self._setup_default_rules()

    def _setup_default_rules(self):
        """Setup default invalidation rules"""

        # Exploit events
        self.add_rule(InvalidationRule(
            event=InvalidationEvent.EXPLOIT_CREATED,
            patterns=[
                "exploits:*",
                "stats:*",
                "chains:*",
                "recent:*"
            ],
            cascade=["health:*"]
        ))

        self.add_rule(InvalidationRule(
            event=InvalidationEvent.EXPLOIT_UPDATED,
            patterns=[
                "exploit:*",
                "exploits:*",
                "stats:*"
            ]
        ))

        self.add_rule(InvalidationRule(
            event=InvalidationEvent.EXPLOIT_DELETED,
            patterns=[
                "exploit:*",
                "exploits:*",
                "stats:*"
            ]
        ))

        # Stats events
        self.add_rule(InvalidationRule(
            event=InvalidationEvent.STATS_UPDATED,
            patterns=[
                "stats:*"
            ]
        ))

        # User events
        self.add_rule(InvalidationRule(
            event=InvalidationEvent.USER_UPDATED,
            patterns=[
                "user:*"
            ]
        ))

        # Subscription events
        self.add_rule(InvalidationRule(
            event=InvalidationEvent.SUBSCRIPTION_UPDATED,
            patterns=[
                "subscription:*",
                "user:*:tier"
            ]
        ))

        # Payment events
        self.add_rule(InvalidationRule(
            event=InvalidationEvent.PAYMENT_COMPLETED,
            patterns=[
                "payment:*",
                "subscription:*"
            ]
        ))

    def add_rule(self, rule: InvalidationRule):
        """
        Add invalidation rule

        Args:
            rule: Invalidation rule
        """
        if rule.event not in self.rules:
            self.rules[rule.event] = []

        self.rules[rule.event].append(rule)
        logger.info(f"Added invalidation rule: {rule}")

    def remove_rule(self, event: InvalidationEvent, pattern: str):
        """
        Remove invalidation rule

        Args:
            event: Event type
            pattern: Cache key pattern
        """
        if event in self.rules:
            self.rules[event] = [
                rule for rule in self.rules[event]
                if pattern not in rule.patterns
            ]

    async def invalidate_by_event(
        self,
        event: InvalidationEvent,
        context: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Invalidate cache based on event

        Args:
            event: Invalidation event
            context: Event context (for dynamic patterns)

        Returns:
            Number of keys invalidated
        """
        if event not in self.rules:
            logger.debug(f"No rules for event: {event}")
            return 0

        total_invalidated = 0

        for rule in self.rules[event]:
            try:
                # Apply delay if specified
                if rule.delay > 0:
                    logger.debug(f"Scheduling invalidation with {rule.delay}s delay")
                    await asyncio.sleep(rule.delay)

                # Invalidate patterns
                for pattern in rule.patterns:
                    # Substitute context variables
                    if context:
                        pattern = self._substitute_pattern(pattern, context)

                    count = await self.cache.delete_pattern(pattern)
                    total_invalidated += count
                    logger.debug(f"Invalidated {count} keys for pattern: {pattern}")

                # Cascade invalidation
                for cascade_pattern in rule.cascade:
                    if context:
                        cascade_pattern = self._substitute_pattern(cascade_pattern, context)

                    count = await self.cache.delete_pattern(cascade_pattern)
                    total_invalidated += count
                    logger.debug(f"Cascade invalidated {count} keys for pattern: {cascade_pattern}")

                # Log invalidation
                self._log_invalidation(event, rule.patterns, total_invalidated, context)

            except Exception as e:
                logger.error(f"Error invalidating for event {event}: {e}")

        return total_invalidated

    async def invalidate_by_pattern(self, pattern: str, reason: str = "manual") -> int:
        """
        Manually invalidate by pattern

        Args:
            pattern: Cache key pattern
            reason: Reason for invalidation

        Returns:
            Number of keys invalidated
        """
        try:
            count = await self.cache.delete_pattern(pattern)
            logger.info(f"Manually invalidated {count} keys for pattern: {pattern}")

            # Log invalidation
            self._log_invalidation(
                InvalidationEvent.MANUAL,
                [pattern],
                count,
                {'reason': reason}
            )

            return count

        except Exception as e:
            logger.error(f"Error invalidating pattern {pattern}: {e}")
            return 0

    async def invalidate_by_key(self, key: str, reason: str = "manual") -> bool:
        """
        Manually invalidate specific key

        Args:
            key: Cache key
            reason: Reason for invalidation

        Returns:
            True if invalidated
        """
        try:
            success = await self.cache.delete(key)

            if success:
                logger.info(f"Manually invalidated key: {key}")

                # Log invalidation
                self._log_invalidation(
                    InvalidationEvent.MANUAL,
                    [key],
                    1,
                    {'reason': reason}
                )

            return success

        except Exception as e:
            logger.error(f"Error invalidating key {key}: {e}")
            return False

    async def schedule_invalidation(
        self,
        pattern: str,
        delay: int,
        task_id: Optional[str] = None
    ):
        """
        Schedule invalidation for later

        Args:
            pattern: Cache key pattern
            delay: Delay in seconds
            task_id: Unique task ID
        """
        task_id = task_id or f"scheduled_{pattern}_{datetime.now().timestamp()}"

        async def delayed_invalidation():
            await asyncio.sleep(delay)
            await self.invalidate_by_pattern(pattern, reason=f"scheduled:{task_id}")

            # Remove from scheduled tasks
            if task_id in self.scheduled_tasks:
                del self.scheduled_tasks[task_id]

        # Cancel existing task if any
        if task_id in self.scheduled_tasks:
            self.scheduled_tasks[task_id].cancel()

        # Schedule new task
        self.scheduled_tasks[task_id] = asyncio.create_task(delayed_invalidation())
        logger.info(f"Scheduled invalidation for pattern '{pattern}' in {delay}s")

    def cancel_scheduled_invalidation(self, task_id: str) -> bool:
        """
        Cancel scheduled invalidation

        Args:
            task_id: Task ID

        Returns:
            True if cancelled
        """
        if task_id in self.scheduled_tasks:
            self.scheduled_tasks[task_id].cancel()
            del self.scheduled_tasks[task_id]
            logger.info(f"Cancelled scheduled invalidation: {task_id}")
            return True

        return False

    async def invalidate_expired(self) -> int:
        """
        Invalidate all expired keys (Redis handles this automatically)

        Returns:
            Number of keys invalidated
        """
        # Redis automatically handles TTL expiration
        # This method is for manual cleanup if needed
        logger.debug("Redis handles expiration automatically")
        return 0

    async def invalidate_by_age(self, pattern: str, max_age_seconds: int) -> int:
        """
        Invalidate keys older than specified age

        Args:
            pattern: Cache key pattern
            max_age_seconds: Maximum age in seconds

        Returns:
            Number of keys invalidated
        """
        # This requires storing metadata about key creation time
        # For now, we'll use TTL as a proxy
        logger.warning("Age-based invalidation not fully implemented")
        return 0

    def _substitute_pattern(self, pattern: str, context: Dict[str, Any]) -> str:
        """
        Substitute variables in pattern

        Args:
            pattern: Pattern with variables (e.g., "user:{user_id}:*")
            context: Context variables

        Returns:
            Substituted pattern
        """
        result = pattern

        for key, value in context.items():
            placeholder = f"{{{key}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))

        return result

    def _log_invalidation(
        self,
        event: InvalidationEvent,
        patterns: List[str],
        count: int,
        context: Optional[Dict[str, Any]] = None
    ):
        """
        Log invalidation event

        Args:
            event: Event type
            patterns: Invalidated patterns
            count: Number of keys invalidated
            context: Event context
        """
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'event': event.value,
            'patterns': patterns,
            'count': count,
            'context': context
        }

        self.invalidation_log.append(log_entry)

        # Trim log if too large
        if len(self.invalidation_log) > self.max_log_size:
            self.invalidation_log = self.invalidation_log[-self.max_log_size:]

    def get_invalidation_log(
        self,
        limit: int = 100,
        event: Optional[InvalidationEvent] = None
    ) -> List[Dict[str, Any]]:
        """
        Get invalidation log

        Args:
            limit: Maximum number of entries
            event: Filter by event type

        Returns:
            Log entries
        """
        log = self.invalidation_log

        if event:
            log = [entry for entry in log if entry['event'] == event.value]

        return list(reversed(log[-limit:]))

    def get_stats(self) -> Dict[str, Any]:
        """
        Get invalidation statistics

        Returns:
            Statistics dictionary
        """
        total_invalidations = len(self.invalidation_log)
        total_keys_invalidated = sum(entry['count'] for entry in self.invalidation_log)

        # Count by event type
        by_event = {}
        for entry in self.invalidation_log:
            event = entry['event']
            if event not in by_event:
                by_event[event] = {'count': 0, 'keys': 0}

            by_event[event]['count'] += 1
            by_event[event]['keys'] += entry['count']

        return {
            'total_invalidations': total_invalidations,
            'total_keys_invalidated': total_keys_invalidated,
            'by_event': by_event,
            'scheduled_tasks': len(self.scheduled_tasks),
            'active_rules': sum(len(rules) for rules in self.rules.values())
        }


class WebhookInvalidator:
    """
    Webhook-based cache invalidation

    Allows external systems to trigger cache invalidation
    """

    def __init__(self, invalidator: CacheInvalidator, secret_key: str):
        self.invalidator = invalidator
        self.secret_key = secret_key

    async def handle_webhook(
        self,
        payload: Dict[str, Any],
        signature: str
    ) -> Dict[str, Any]:
        """
        Handle invalidation webhook

        Args:
            payload: Webhook payload
            signature: Request signature

        Returns:
            Response dictionary
        """
        # Verify signature
        if not self._verify_signature(payload, signature):
            return {
                'success': False,
                'error': 'Invalid signature'
            }

        # Extract invalidation parameters
        event_type = payload.get('event')
        patterns = payload.get('patterns', [])
        context = payload.get('context', {})

        try:
            # Map event type to InvalidationEvent
            if event_type in InvalidationEvent.__members__.values():
                event = InvalidationEvent(event_type)
                count = await self.invalidator.invalidate_by_event(event, context)
            else:
                # Manual pattern invalidation
                count = 0
                for pattern in patterns:
                    count += await self.invalidator.invalidate_by_pattern(
                        pattern,
                        reason=f"webhook:{event_type}"
                    )

            return {
                'success': True,
                'keys_invalidated': count,
                'patterns': patterns
            }

        except Exception as e:
            logger.error(f"Webhook invalidation error: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def _verify_signature(self, payload: Dict[str, Any], signature: str) -> bool:
        """
        Verify webhook signature

        Args:
            payload: Webhook payload
            signature: Request signature

        Returns:
            True if valid
        """
        import hmac
        import hashlib
        import json

        # Calculate expected signature
        payload_str = json.dumps(payload, sort_keys=True)
        expected_signature = hmac.new(
            self.secret_key.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).hexdigest()

        # Compare signatures
        return hmac.compare_digest(expected_signature, signature)


# Global invalidator instance
_invalidator: Optional[CacheInvalidator] = None


def get_invalidator() -> CacheInvalidator:
    """Get global invalidator instance"""
    global _invalidator
    if _invalidator is None:
        _invalidator = CacheInvalidator()
    return _invalidator


async def invalidate_on_event(event: InvalidationEvent, context: Optional[Dict[str, Any]] = None):
    """
    Convenience function to invalidate cache on event

    Args:
        event: Invalidation event
        context: Event context
    """
    invalidator = get_invalidator()
    await invalidator.invalidate_by_event(event, context)
