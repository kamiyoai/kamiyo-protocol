# -*- coding: utf-8 -*-
"""
Alerting System for Social Media Posting
Sends alerts for critical issues via webhooks (Slack, PagerDuty, Discord)
"""

import os
import time
import json
import requests
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict

from social.monitoring.structured_logging import get_logger

logger = get_logger(__name__)


class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class Alert:
    """Alert message"""
    title: str
    message: str
    severity: AlertSeverity
    timestamp: datetime = field(default_factory=datetime.utcnow)
    details: Dict = field(default_factory=dict)
    source: str = "social_media_poster"

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'title': self.title,
            'message': self.message,
            'severity': self.severity.value,
            'timestamp': self.timestamp.isoformat(),
            'details': self.details,
            'source': self.source
        }


class AlertManager:
    """
    Manages alerts and sends notifications via webhooks
    """

    # Color codes for different severities
    SEVERITY_COLORS = {
        AlertSeverity.INFO: "#36a64f",      # Green
        AlertSeverity.WARNING: "#ff9900",   # Orange
        AlertSeverity.ERROR: "#ff0000",     # Red
        AlertSeverity.CRITICAL: "#8b0000",  # Dark Red
    }

    # Emoji for different severities
    SEVERITY_EMOJI = {
        AlertSeverity.INFO: "ℹ️",
        AlertSeverity.WARNING: "⚠️",
        AlertSeverity.ERROR: "🚨",
        AlertSeverity.CRITICAL: "🔥",
    }

    def __init__(
        self,
        slack_webhook: Optional[str] = None,
        discord_webhook: Optional[str] = None,
        pagerduty_api_key: Optional[str] = None,
        pagerduty_routing_key: Optional[str] = None
    ):
        """
        Initialize alert manager

        Args:
            slack_webhook: Slack webhook URL
            discord_webhook: Discord webhook URL
            pagerduty_api_key: PagerDuty API key
            pagerduty_routing_key: PagerDuty routing key
        """
        self.slack_webhook = slack_webhook or os.getenv('SLACK_ALERT_WEBHOOK')
        self.discord_webhook = discord_webhook or os.getenv('DISCORD_ALERT_WEBHOOK')
        self.pagerduty_api_key = pagerduty_api_key or os.getenv('PAGERDUTY_API_KEY')
        self.pagerduty_routing_key = pagerduty_routing_key or os.getenv('PAGERDUTY_ROUTING_KEY')

        # Track consecutive failures for deduplication
        self.failure_counts: Dict[str, int] = defaultdict(int)
        self.last_alert_times: Dict[str, datetime] = {}
        self.alert_threshold = 5  # Alert after 5 consecutive failures
        self.alert_cooldown = timedelta(minutes=15)  # Don't re-alert within 15 minutes

    def send_alert(
        self,
        alert: Alert,
        channels: Optional[List[str]] = None
    ) -> Dict[str, bool]:
        """
        Send alert to configured channels

        Args:
            alert: Alert to send
            channels: List of channels (slack, discord, pagerduty). If None, sends to all configured.

        Returns:
            Dict mapping channel name to success status
        """
        if channels is None:
            channels = []
            if self.slack_webhook:
                channels.append('slack')
            if self.discord_webhook:
                channels.append('discord')
            if self.pagerduty_api_key and self.pagerduty_routing_key:
                channels.append('pagerduty')

        results = {}
        for channel in channels:
            try:
                if channel == 'slack':
                    success = self._send_slack_alert(alert)
                elif channel == 'discord':
                    success = self._send_discord_alert(alert)
                elif channel == 'pagerduty':
                    success = self._send_pagerduty_alert(alert)
                else:
                    logger.warning("unknown_alert_channel", channel=channel)
                    success = False

                results[channel] = success

                if success:
                    logger.info("alert_sent", channel=channel, alert=alert.title)
                else:
                    logger.error("alert_failed", channel=channel, alert=alert.title)

            except Exception as e:
                logger.error("alert_exception", channel=channel, error=str(e))
                results[channel] = False

        return results

    def _send_slack_alert(self, alert: Alert) -> bool:
        """Send alert to Slack"""
        if not self.slack_webhook:
            return False

        try:
            color = self.SEVERITY_COLORS[alert.severity]
            emoji = self.SEVERITY_EMOJI[alert.severity]

            payload = {
                "text": f"{emoji} {alert.title}",
                "attachments": [
                    {
                        "color": color,
                        "title": alert.title,
                        "text": alert.message,
                        "fields": [
                            {
                                "title": "Severity",
                                "value": alert.severity.value.upper(),
                                "short": True
                            },
                            {
                                "title": "Source",
                                "value": alert.source,
                                "short": True
                            },
                            {
                                "title": "Timestamp",
                                "value": alert.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
                                "short": False
                            }
                        ],
                        "footer": "Kamiyo Social Media Monitoring",
                        "ts": int(alert.timestamp.timestamp())
                    }
                ]
            }

            # Add detail fields
            if alert.details:
                for key, value in alert.details.items():
                    payload["attachments"][0]["fields"].append({
                        "title": key.replace('_', ' ').title(),
                        "value": str(value),
                        "short": True
                    })

            response = requests.post(
                self.slack_webhook,
                json=payload,
                timeout=10
            )

            return response.status_code == 200

        except Exception as e:
            logger.error("slack_alert_failed", error=str(e))
            return False

    def _send_discord_alert(self, alert: Alert) -> bool:
        """Send alert to Discord"""
        if not self.discord_webhook:
            return False

        try:
            color_hex = self.SEVERITY_COLORS[alert.severity]
            color_int = int(color_hex.replace('#', ''), 16)
            emoji = self.SEVERITY_EMOJI[alert.severity]

            embed = {
                "title": f"{emoji} {alert.title}",
                "description": alert.message,
                "color": color_int,
                "timestamp": alert.timestamp.isoformat(),
                "fields": [
                    {
                        "name": "Severity",
                        "value": alert.severity.value.upper(),
                        "inline": True
                    },
                    {
                        "name": "Source",
                        "value": alert.source,
                        "inline": True
                    }
                ],
                "footer": {
                    "text": "Kamiyo Social Media Monitoring"
                }
            }

            # Add detail fields
            if alert.details:
                for key, value in alert.details.items():
                    embed["fields"].append({
                        "name": key.replace('_', ' ').title(),
                        "value": str(value),
                        "inline": True
                    })

            payload = {
                "embeds": [embed]
            }

            response = requests.post(
                self.discord_webhook,
                json=payload,
                timeout=10
            )

            return response.status_code in [200, 204]

        except Exception as e:
            logger.error("discord_alert_failed", error=str(e))
            return False

    def _send_pagerduty_alert(self, alert: Alert) -> bool:
        """Send alert to PagerDuty"""
        if not self.pagerduty_api_key or not self.pagerduty_routing_key:
            return False

        try:
            # Map severity to PagerDuty severity
            pd_severity = {
                AlertSeverity.INFO: "info",
                AlertSeverity.WARNING: "warning",
                AlertSeverity.ERROR: "error",
                AlertSeverity.CRITICAL: "critical"
            }[alert.severity]

            payload = {
                "routing_key": self.pagerduty_routing_key,
                "event_action": "trigger",
                "payload": {
                    "summary": alert.title,
                    "severity": pd_severity,
                    "source": alert.source,
                    "timestamp": alert.timestamp.isoformat(),
                    "custom_details": {
                        "message": alert.message,
                        **alert.details
                    }
                }
            }

            response = requests.post(
                "https://events.pagerduty.com/v2/enqueue",
                json=payload,
                headers={
                    "Content-Type": "application/json"
                },
                timeout=10
            )

            return response.status_code == 202

        except Exception as e:
            logger.error("pagerduty_alert_failed", error=str(e))
            return False

    def track_failure(self, key: str, details: Optional[Dict] = None) -> bool:
        """
        Track a failure and alert if threshold reached

        Args:
            key: Unique key for the failure type (e.g., "reddit_post_failure")
            details: Optional details to include in alert

        Returns:
            True if alert was sent
        """
        self.failure_counts[key] += 1
        count = self.failure_counts[key]

        # Check if we should send alert
        should_alert = False

        # Alert on threshold
        if count == self.alert_threshold:
            should_alert = True

        # Check cooldown
        last_alert_time = self.last_alert_times.get(key)
        if last_alert_time:
            time_since_last = datetime.utcnow() - last_alert_time
            if time_since_last < self.alert_cooldown:
                should_alert = False

        if should_alert:
            alert = Alert(
                title=f"Consecutive Failures: {key}",
                message=f"Detected {count} consecutive failures for {key}",
                severity=AlertSeverity.ERROR if count < 10 else AlertSeverity.CRITICAL,
                details=details or {'failure_count': count}
            )
            self.send_alert(alert)
            self.last_alert_times[key] = datetime.utcnow()
            return True

        return False

    def reset_failure_count(self, key: str):
        """Reset failure count for a key (e.g., after success)"""
        if key in self.failure_counts:
            self.failure_counts[key] = 0

    def alert_rate_limit_exhaustion(
        self,
        platform: str,
        reset_time: Optional[str] = None
    ):
        """Alert that rate limit is exhausted"""
        alert = Alert(
            title=f"Rate Limit Exhausted: {platform}",
            message=f"Rate limit exhausted for {platform}. Posts will be delayed.",
            severity=AlertSeverity.WARNING,
            details={
                'platform': platform,
                'reset_time': reset_time or 'Unknown'
            }
        )
        self.send_alert(alert)

    def alert_authentication_failure(
        self,
        platform: str,
        error: str
    ):
        """Alert that authentication failed"""
        alert = Alert(
            title=f"Authentication Failure: {platform}",
            message=f"Failed to authenticate with {platform}: {error}",
            severity=AlertSeverity.CRITICAL,
            details={
                'platform': platform,
                'error': error
            }
        )
        self.send_alert(alert)

    def alert_system_health(
        self,
        check_name: str,
        status: str,
        message: str,
        details: Optional[Dict] = None
    ):
        """Alert about system health issues"""
        severity = {
            'healthy': AlertSeverity.INFO,
            'degraded': AlertSeverity.WARNING,
            'unhealthy': AlertSeverity.ERROR
        }.get(status, AlertSeverity.WARNING)

        alert = Alert(
            title=f"System Health Alert: {check_name}",
            message=message,
            severity=severity,
            details=details or {'status': status}
        )

        # Only alert for non-healthy status
        if status != 'healthy':
            self.send_alert(alert)


# Global alert manager instance
alert_manager = AlertManager()


# Convenience functions
def send_alert(
    title: str,
    message: str,
    severity: AlertSeverity = AlertSeverity.INFO,
    details: Optional[Dict] = None
):
    """Send an alert"""
    alert = Alert(
        title=title,
        message=message,
        severity=severity,
        details=details or {}
    )
    alert_manager.send_alert(alert)


def track_failure(key: str, details: Optional[Dict] = None) -> bool:
    """Track a failure and alert if threshold reached"""
    return alert_manager.track_failure(key, details)


def reset_failure_count(key: str):
    """Reset failure count"""
    alert_manager.reset_failure_count(key)


# Example usage
if __name__ == "__main__":
    from social.monitoring.structured_logging import configure_logging

    configure_logging(log_level="INFO", json_format=False)

    # Create alert manager
    manager = AlertManager(
        slack_webhook=os.getenv('SLACK_ALERT_WEBHOOK'),
        discord_webhook=os.getenv('DISCORD_ALERT_WEBHOOK')
    )

    # Send test alerts
    print("Sending test alerts...")

    # Info alert
    info_alert = Alert(
        title="Test Info Alert",
        message="This is an informational alert",
        severity=AlertSeverity.INFO,
        details={'test': True}
    )
    manager.send_alert(info_alert)

    # Warning alert
    warning_alert = Alert(
        title="Test Warning Alert",
        message="This is a warning alert",
        severity=AlertSeverity.WARNING,
        details={'test': True, 'platform': 'reddit'}
    )
    manager.send_alert(warning_alert)

    # Error alert
    error_alert = Alert(
        title="Test Error Alert",
        message="This is an error alert",
        severity=AlertSeverity.ERROR,
        details={'test': True, 'error': 'Connection timeout'}
    )
    manager.send_alert(error_alert)

    # Critical alert
    critical_alert = Alert(
        title="Test Critical Alert",
        message="This is a critical alert",
        severity=AlertSeverity.CRITICAL,
        details={'test': True, 'platform': 'all'}
    )
    manager.send_alert(critical_alert)

    print("Test alerts sent!")

    # Test failure tracking
    print("\nTesting failure tracking...")
    for i in range(6):
        is_alerting = manager.track_failure('test_failure', {'attempt': i+1})
        if is_alerting:
            print(f"Alert triggered on attempt {i+1}")
