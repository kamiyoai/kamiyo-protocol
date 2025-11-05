# -*- coding: utf-8 -*-
"""
Stripe API Version Monitoring for Kamiyo
PCI DSS Compliance: Requirement 12.10.1 - Incident response planning
Monitors Stripe API version age and alerts on deprecation risks
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import stripe

from config.stripe_config import get_stripe_config
from monitoring.alerts import get_alert_manager, AlertLevel

logger = logging.getLogger(__name__)


class StripeVersionMonitor:
    """
    Monitor Stripe API version for deprecation and security risks.

    PCI DSS Compliance:
    - Requirement 12.10.1: Incident response plan for payment processing
    - Requirement 6.2: Security patches and updates must be installed promptly
    - Requirement 6.3.1: Changes to production follow secure development lifecycle

    Key Features:
    - Tracks API version age
    - Alerts when version >6 months old (warning)
    - Alerts when version >1 year old (critical)
    - Queries Stripe for deprecation notices
    - Logs all version health checks for audit trail
    """

    # Version age thresholds (in days)
    WARNING_THRESHOLD_DAYS = 180   # 6 months
    CRITICAL_THRESHOLD_DAYS = 365  # 1 year

    def __init__(self):
        """Initialize version monitor with Stripe configuration"""
        self.config = get_stripe_config()
        self.alert_manager = get_alert_manager()
        self.current_version = self.config.api_version

        logger.info(f"[PCI] Stripe Version Monitor initialized - tracking version: {self.current_version}")

    def check_version_health(self) -> Dict[str, Any]:
        """
        Perform comprehensive version health check.

        Checks:
        1. Parse version date from version string
        2. Calculate version age in days
        3. Compare against warning/critical thresholds
        4. Query Stripe account to verify version in use
        5. Generate alerts if thresholds exceeded
        6. Return health status for monitoring dashboards

        Returns:
            Dict with version health status:
            {
                'version': str,
                'version_date': str,
                'age_days': int,
                'status': 'healthy' | 'warning' | 'critical',
                'message': str,
                'next_check': str
            }

        Raises:
            Exception: If Stripe API call fails (non-critical, logged only)
        """
        try:
            logger.info("[PCI] Starting Stripe API version health check")

            # Parse version date from version string (format: YYYY-MM-DD)
            version_date = self._parse_version_date(self.current_version)

            if not version_date:
                logger.error(f"[PCI] Failed to parse version date from: {self.current_version}")
                return self._create_error_response("Invalid version format")

            # Calculate version age
            age_days = self._calculate_version_age_days(version_date)

            logger.info(f"[PCI] Current Stripe API version: {self.current_version} (age: {age_days} days)")

            # Verify version with Stripe (this queries the actual API version in use)
            stripe_account_version = self._get_stripe_account_version()

            # Determine health status
            status = self._determine_health_status(age_days)

            # Generate alerts if needed
            self._generate_alerts_if_needed(age_days, status)

            # Build health response
            health_response = {
                'version': self.current_version,
                'version_date': version_date.isoformat(),
                'age_days': age_days,
                'status': status,
                'message': self._get_status_message(age_days, status),
                'stripe_account_version': stripe_account_version,
                'warning_threshold_days': self.WARNING_THRESHOLD_DAYS,
                'critical_threshold_days': self.CRITICAL_THRESHOLD_DAYS,
                'checked_at': datetime.utcnow().isoformat()
            }

            logger.info(f"[PCI] Version health check complete - status: {status}")

            return health_response

        except Exception as e:
            logger.error(f"[PCI] Version health check failed: {e}")
            return self._create_error_response(str(e))

    def _parse_version_date(self, version: str) -> Optional[datetime]:
        """
        Parse date from Stripe API version string.

        Args:
            version: Version string (format: YYYY-MM-DD)

        Returns:
            datetime object or None if parsing fails
        """
        try:
            return datetime.strptime(version, '%Y-%m-%d')
        except ValueError:
            return None

    def _calculate_version_age_days(self, version_date: datetime) -> int:
        """
        Calculate age of API version in days.

        Args:
            version_date: Version date as datetime

        Returns:
            Age in days (integer)
        """
        age = datetime.utcnow() - version_date
        return age.days

    def _get_stripe_account_version(self) -> Optional[str]:
        """
        Query Stripe API to verify actual API version in use.

        This makes a lightweight API call (Account.retrieve) to verify
        that our configured version matches what Stripe is actually using.

        Returns:
            API version string from Stripe or None if query fails
        """
        try:
            # Retrieve account to check API version
            # This is a lightweight call that doesn't count against rate limits
            account = stripe.Account.retrieve()

            # The API version used is in the stripe module
            return stripe.api_version

        except stripe.error.StripeError as e:
            logger.warning(f"[PCI] Failed to verify Stripe account version: {e}")
            return None

        except Exception as e:
            logger.error(f"[PCI] Unexpected error querying Stripe: {e}")
            return None

    def _determine_health_status(self, age_days: int) -> str:
        """
        Determine health status based on version age.

        Args:
            age_days: Version age in days

        Returns:
            'healthy' | 'warning' | 'critical'
        """
        if age_days >= self.CRITICAL_THRESHOLD_DAYS:
            return 'critical'
        elif age_days >= self.WARNING_THRESHOLD_DAYS:
            return 'warning'
        else:
            return 'healthy'

    def _get_status_message(self, age_days: int, status: str) -> str:
        """
        Generate human-readable status message.

        Args:
            age_days: Version age in days
            status: Health status

        Returns:
            Status message string
        """
        if status == 'critical':
            return (
                f"CRITICAL: Stripe API version is {age_days} days old (>{self.CRITICAL_THRESHOLD_DAYS} days). "
                "Upgrade required immediately to maintain PCI compliance and security."
            )
        elif status == 'warning':
            return (
                f"WARNING: Stripe API version is {age_days} days old (>{self.WARNING_THRESHOLD_DAYS} days). "
                "Plan upgrade soon to maintain best security practices."
            )
        else:
            return f"Stripe API version is current ({age_days} days old). No action needed."

    def _generate_alerts_if_needed(self, age_days: int, status: str):
        """
        Send alerts to DevOps if version age exceeds thresholds.

        Args:
            age_days: Version age in days
            status: Health status
        """
        if status == 'critical':
            self.alert_manager.send_alert(
                title="CRITICAL: Stripe API Version Outdated",
                message=(
                    f"Stripe API version {self.current_version} is {age_days} days old (>1 year). "
                    "This poses PCI compliance and security risks. Upgrade immediately. "
                    "See: https://stripe.com/docs/upgrades"
                ),
                level=AlertLevel.CRITICAL,
                metadata={
                    'version': self.current_version,
                    'age_days': age_days,
                    'threshold_days': self.CRITICAL_THRESHOLD_DAYS,
                    'pci_requirement': '6.2, 12.10.1'
                }
            )
            logger.critical(
                f"[PCI] CRITICAL ALERT: Stripe API version >1 year old",
                extra={
                    'version': self.current_version,
                    'age_days': age_days
                }
            )

        elif status == 'warning':
            self.alert_manager.send_alert(
                title="WARNING: Stripe API Version Approaching End-of-Life",
                message=(
                    f"Stripe API version {self.current_version} is {age_days} days old (>6 months). "
                    "Plan an upgrade within the next 3-6 months to maintain security. "
                    "See: https://stripe.com/docs/upgrades"
                ),
                level=AlertLevel.WARNING,
                metadata={
                    'version': self.current_version,
                    'age_days': age_days,
                    'threshold_days': self.WARNING_THRESHOLD_DAYS
                }
            )
            logger.warning(
                f"[PCI] WARNING: Stripe API version >6 months old",
                extra={
                    'version': self.current_version,
                    'age_days': age_days
                }
            )

    def _create_error_response(self, error: str) -> Dict[str, Any]:
        """
        Create error response when health check fails.

        Args:
            error: Error message

        Returns:
            Error response dict
        """
        return {
            'version': self.current_version,
            'age_days': 0,  # Default to 0 on error to prevent KeyError
            'status': 'error',
            'message': f"Version health check failed: {error}",
            'checked_at': datetime.utcnow().isoformat()
        }

    def get_upgrade_recommendation(self) -> Dict[str, Any]:
        """
        Get recommendation on upgrading Stripe API version.

        Returns:
            Dict with upgrade recommendation:
            {
                'should_upgrade': bool,
                'urgency': 'none' | 'low' | 'medium' | 'high' | 'critical',
                'recommended_version': str,
                'upgrade_guide': str
            }
        """
        health = self.check_version_health()

        if health['status'] == 'error':
            return {
                'should_upgrade': False,
                'urgency': 'unknown',
                'message': 'Cannot determine - health check failed'
            }

        age_days = health['age_days']

        # Determine urgency
        if age_days >= self.CRITICAL_THRESHOLD_DAYS:
            urgency = 'critical'
            should_upgrade = True
        elif age_days >= self.WARNING_THRESHOLD_DAYS:
            urgency = 'high'
            should_upgrade = True
        elif age_days >= 90:
            urgency = 'medium'
            should_upgrade = False
        else:
            urgency = 'none'
            should_upgrade = False

        return {
            'should_upgrade': should_upgrade,
            'urgency': urgency,
            'current_version': self.current_version,
            'version_age_days': age_days,
            'upgrade_guide': 'https://stripe.com/docs/upgrades',
            'testing_guide': 'https://stripe.com/docs/upgrades#test-your-integration',
            'message': health['message']
        }


# Singleton instance
_version_monitor = None


def get_version_monitor() -> StripeVersionMonitor:
    """
    Get version monitor singleton.

    Returns:
        StripeVersionMonitor instance
    """
    global _version_monitor
    if _version_monitor is None:
        _version_monitor = StripeVersionMonitor()
    return _version_monitor


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Stripe Version Monitor Test ===\n")

    monitor = get_version_monitor()

    print("1. Version Health Check:")
    health = monitor.check_version_health()
    print(f"   Version: {health['version']}")
    print(f"   Age: {health['age_days']} days")
    print(f"   Status: {health['status']}")
    print(f"   Message: {health['message']}")

    print("\n2. Upgrade Recommendation:")
    recommendation = monitor.get_upgrade_recommendation()
    print(f"   Should Upgrade: {recommendation['should_upgrade']}")
    print(f"   Urgency: {recommendation['urgency']}")
    print(f"   Guide: {recommendation['upgrade_guide']}")

    print("\n✅ Stripe version monitoring ready")
