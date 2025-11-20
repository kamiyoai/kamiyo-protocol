# -*- coding: utf-8 -*-
"""
Alert System for Kamiyo
Sends alerts to Discord, Slack, or email when critical events occur
"""

import os
import requests
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertManager:
    """Manages alerts across multiple channels"""

    def __init__(self):
        self.discord_webhook = os.getenv('DISCORD_WEBHOOK_URL')
        self.slack_webhook = os.getenv('SLACK_WEBHOOK_URL')
        self.admin_email = os.getenv('ADMIN_EMAIL')

        # Alert configuration
        self.enabled_channels = {
            'discord': bool(self.discord_webhook),
            'slack': bool(self.slack_webhook),
            'email': bool(self.admin_email)
        }

        logger.info(f"Alert channels enabled: {self.enabled_channels}")

    def send_alert(self,
                   title: str,
                   message: str,
                   level: AlertLevel = AlertLevel.INFO,
                   metadata: Dict[str, Any] = None):
        """
        Send alert to all enabled channels

        Args:
            title: Alert title
            message: Alert message
            level: Alert severity
            metadata: Additional context
        """

        # Send to Discord
        if self.enabled_channels['discord']:
            try:
                self._send_discord(title, message, level, metadata)
            except Exception as e:
                logger.error(f"Failed to send Discord alert: {e}")

        # Send to Slack
        if self.enabled_channels['slack']:
            try:
                self._send_slack(title, message, level, metadata)
            except Exception as e:
                logger.error(f"Failed to send Slack alert: {e}")

        # Send email (for critical only)
        if self.enabled_channels['email'] and level == AlertLevel.CRITICAL:
            try:
                self._send_email(title, message, metadata)
            except Exception as e:
                logger.error(f"Failed to send email alert: {e}")

    def _send_discord(self,
                     title: str,
                     message: str,
                     level: AlertLevel,
                     metadata: Dict[str, Any] = None):
        """Send alert to Discord webhook"""

        if not self.discord_webhook:
            return

        # Color based on severity
        colors = {
            AlertLevel.INFO: 3447003,      # Blue
            AlertLevel.WARNING: 16776960,  # Yellow
            AlertLevel.ERROR: 15158332,    # Red
            AlertLevel.CRITICAL: 10038562  # Dark red
        }

        embed = {
            "title": f"🔔 {title}",
            "description": message,
            "color": colors[level],
            "timestamp": datetime.utcnow().isoformat(),
            "footer": {
                "text": "Kamiyo Alert System"
            }
        }

        # Add metadata fields
        if metadata:
            embed["fields"] = [
                {"name": key, "value": str(value), "inline": True}
                for key, value in metadata.items()
            ]

        payload = {
            "username": "Kamiyo Monitor",
            "embeds": [embed]
        }

        response = requests.post(
            self.discord_webhook,
            json=payload,
            timeout=10
        )
        response.raise_for_status()

        logger.info(f"Discord alert sent: {title}")

    def _send_slack(self,
                   title: str,
                   message: str,
                   level: AlertLevel,
                   metadata: Dict[str, Any] = None):
        """Send alert to Slack webhook"""

        if not self.slack_webhook:
            return

        # Icon based on severity
        icons = {
            AlertLevel.INFO: ":information_source:",
            AlertLevel.WARNING: ":warning:",
            AlertLevel.ERROR: ":x:",
            AlertLevel.CRITICAL: ":rotating_light:"
        }

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{icons[level]} {title}"
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": message
                }
            }
        ]

        # Add metadata
        if metadata:
            fields = [
                {
                    "type": "mrkdwn",
                    "text": f"*{key}:*\n{value}"
                }
                for key, value in metadata.items()
            ]

            blocks.append({
                "type": "section",
                "fields": fields
            })

        payload = {
            "blocks": blocks
        }

        response = requests.post(
            self.slack_webhook,
            json=payload,
            timeout=10
        )
        response.raise_for_status()

        logger.info(f"Slack alert sent: {title}")

    def _send_email(self,
                   title: str,
                   message: str,
                   metadata: Dict[str, Any] = None):
        """Send email alert (for critical alerts only)"""

        # Import SendGrid here to avoid dependency if not used
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail

            sendgrid_key = os.getenv('SENDGRID_API_KEY')
            if not sendgrid_key:
                logger.warning("SendGrid API key not set")
                return

            # Build email content
            content = f"""
            <h2>{title}</h2>
            <p>{message}</p>
            """

            if metadata:
                content += "<h3>Details:</h3><ul>"
                for key, value in metadata.items():
                    content += f"<li><strong>{key}:</strong> {value}</li>"
                content += "</ul>"

            mail = Mail(
                from_email=os.getenv('FROM_EMAIL', 'alerts@kamiyo.ai'),
                to_emails=self.admin_email,
                subject=f"[CRITICAL] Kamiyo Alert: {title}",
                html_content=content
            )

            sg = SendGridAPIClient(sendgrid_key)
            response = sg.send(mail)

            logger.info(f"Email alert sent: {title}")

        except Exception as e:
            logger.error(f"Failed to send email: {e}")

    # ==========================================
    # PREDEFINED ALERT TYPES
    # ==========================================

    def alert_aggregator_failure(self, source: str, error: str, retry_count: int):
        """Alert when aggregator fails multiple times"""

        if retry_count >= 3:
            self.send_alert(
                title=f"Aggregator Failure: {source}",
                message=f"Aggregator '{source}' has failed {retry_count} times consecutively.",
                level=AlertLevel.ERROR,
                metadata={
                    "Source": source,
                    "Error": error,
                    "Retry Count": retry_count,
                    "Action": "Check logs and source availability"
                }
            )

    def alert_api_slow_response(self, endpoint: str, duration: float, threshold: float = 2.0):
        """Alert when API responses are slow"""

        if duration > threshold:
            self.send_alert(
                title="Slow API Response",
                message=f"Endpoint '{endpoint}' took {duration:.2f}s to respond.",
                level=AlertLevel.WARNING,
                metadata={
                    "Endpoint": endpoint,
                    "Duration": f"{duration:.2f}s",
                    "Threshold": f"{threshold:.2f}s",
                    "Action": "Check database queries and server load"
                }
            )

    def alert_large_exploit(self, protocol: str, amount: float, chain: str, tx_hash: str):
        """Alert when large exploit detected (>$10M)"""

        if amount >= 10_000_000:
            self.send_alert(
                title=f"🚨 Large Exploit Detected: ${amount:,.0f}",
                message=f"Major exploit detected on {protocol} ({chain})",
                level=AlertLevel.CRITICAL,
                metadata={
                    "Protocol": protocol,
                    "Chain": chain,
                    "Amount": f"${amount:,.0f}",
                    "Transaction": tx_hash[:16] + "...",
                    "Action": "Verify and send alerts to users"
                }
            )

    def alert_database_connection_failure(self, error: str, retry_count: int):
        """Alert when database connection fails"""

        self.send_alert(
            title="Database Connection Failure",
            message=f"Failed to connect to database after {retry_count} attempts.",
            level=AlertLevel.CRITICAL,
            metadata={
                "Error": error,
                "Retry Count": retry_count,
                "Action": "Check PostgreSQL status and restart if needed"
            }
        )

    def alert_high_memory_usage(self, percentage: float, threshold: float = 85.0):
        """Alert when memory usage is high"""

        if percentage >= threshold:
            self.send_alert(
                title="High Memory Usage",
                message=f"Memory usage at {percentage:.1f}%",
                level=AlertLevel.WARNING if percentage < 95 else AlertLevel.ERROR,
                metadata={
                    "Usage": f"{percentage:.1f}%",
                    "Threshold": f"{threshold:.1f}%",
                    "Action": "Monitor for memory leaks, consider scaling"
                }
            )

    def alert_payment_failure(self, user_email: str, amount: float, error: str):
        """Alert when payment processing fails"""

        self.send_alert(
            title="Payment Processing Failed",
            message=f"Payment of ${amount:.2f} failed for {user_email}",
            level=AlertLevel.ERROR,
            metadata={
                "User": user_email,
                "Amount": f"${amount:.2f}",
                "Error": error,
                "Action": "Check Stripe dashboard and contact user"
            }
        )

    def alert_deployment_success(self, version: str, environment: str):
        """Alert when deployment succeeds"""

        self.send_alert(
            title=f"Deployment Successful: v{version}",
            message=f"Successfully deployed version {version} to {environment}",
            level=AlertLevel.INFO,
            metadata={
                "Version": version,
                "Environment": environment,
                "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        )


# Singleton instance
_alert_manager = None

def get_alert_manager() -> AlertManager:
    """Get AlertManager singleton"""

    global _alert_manager
    if _alert_manager is None:
        _alert_manager = AlertManager()
    return _alert_manager


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Kamiyo Alert System Test ===\n")

    # Set test webhook (replace with real webhook to test)
    os.environ['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/YOUR_WEBHOOK'

    alert_mgr = get_alert_manager()

    print("1. Testing info alert...")
    alert_mgr.send_alert(
        title="Test Info Alert",
        message="This is a test information alert",
        level=AlertLevel.INFO,
        metadata={"Test": "Value", "Number": 123}
    )

    print("\n2. Testing aggregator failure alert...")
    alert_mgr.alert_aggregator_failure(
        source="defillama",
        error="Connection timeout",
        retry_count=3
    )

    print("\n3. Testing large exploit alert...")
    alert_mgr.alert_large_exploit(
        protocol="Example Protocol",
        amount=15_000_000,
        chain="Ethereum",
        tx_hash="0x1234567890abcdef"
    )

    print("\n✅ Alert system ready")
    print("Set DISCORD_WEBHOOK_URL or SLACK_WEBHOOK_URL to enable alerts")
