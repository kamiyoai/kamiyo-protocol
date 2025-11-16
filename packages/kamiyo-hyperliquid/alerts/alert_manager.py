"""
Alert System for Hyperliquid Security Monitoring
Sends security alerts to Discord, Slack, Telegram, or email when critical events occur
"""

import os
import requests
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from enum import Enum

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class HyperliquidAlertManager:
    """Manages security alerts for Hyperliquid monitoring across multiple channels"""

    def __init__(self):
        self.discord_webhook = os.getenv('DISCORD_WEBHOOK_URL')
        self.slack_webhook = os.getenv('SLACK_WEBHOOK_URL')
        self.telegram_bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
        self.telegram_chat_id = os.getenv('TELEGRAM_CHAT_ID')
        self.webhook_url = os.getenv('WEBHOOK_URL')
        self.admin_email = os.getenv('ADMIN_EMAIL')

        # Alert configuration
        self.enabled_channels = {
            'discord': bool(self.discord_webhook),
            'slack': bool(self.slack_webhook),
            'telegram': bool(self.telegram_bot_token and self.telegram_chat_id),
            'webhook': bool(self.webhook_url),
            'email': bool(self.admin_email)
        }

        # Minimum severity to send alerts
        self.min_severity = os.getenv('ALERT_MIN_SEVERITY', 'high').lower()

        logger.info(f"Alert channels enabled: {self.enabled_channels}")
        logger.info(f"Minimum alert severity: {self.min_severity}")

    def should_send_alert(self, level: AlertLevel) -> bool:
        """Check if alert should be sent based on minimum severity"""
        severity_order = {
            'info': 0,
            'warning': 1,
            'error': 2,
            'critical': 3
        }

        min_level = severity_order.get(self.min_severity, 1)
        current_level = severity_order.get(level.value, 0)

        return current_level >= min_level

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

        if not self.should_send_alert(level):
            logger.debug(f"Skipping alert '{title}' (below minimum severity)")
            return

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

        # Send to Telegram
        if self.enabled_channels['telegram']:
            try:
                self._send_telegram(title, message, level, metadata)
            except Exception as e:
                logger.error(f"Failed to send Telegram alert: {e}")

        # Send to custom webhook
        if self.enabled_channels['webhook']:
            try:
                self._send_webhook(title, message, level, metadata)
            except Exception as e:
                logger.error(f"Failed to send webhook alert: {e}")

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

        severity_prefix = {
            AlertLevel.INFO: '[INFO]',
            AlertLevel.WARNING: '[WARNING]',
            AlertLevel.ERROR: '[ERROR]',
            AlertLevel.CRITICAL: '[CRITICAL]'
        }

        embed = {
            "title": f"{severity_prefix[level]} {title}",
            "description": message,
            "color": colors[level],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "footer": {
                "text": "Hyperliquid Security Monitor"
            }
        }

        # Add metadata fields
        if metadata:
            embed["fields"] = [
                {"name": key, "value": str(value), "inline": True}
                for key, value in metadata.items()
            ]

        payload = {
            "username": "Hyperliquid Monitor",
            "embeds": [embed]
        }

        response = requests.post(
            self.discord_webhook,
            json=payload,
            timeout=10
        )
        response.raise_for_status()

        logger.info(f"Discord alert sent: {title}")
        return True

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
        return True

    def _send_telegram(self,
                      title: str,
                      message: str,
                      level: AlertLevel,
                      metadata: Dict[str, Any] = None):
        """Send alert to Telegram bot"""

        if not self.telegram_bot_token or not self.telegram_chat_id:
            return

        severity_prefix = {
            AlertLevel.INFO: '[INFO]',
            AlertLevel.WARNING: '[WARNING]',
            AlertLevel.ERROR: '[ERROR]',
            AlertLevel.CRITICAL: '[CRITICAL]'
        }

        text = f"{severity_prefix[level]} *{title}*\n\n{message}"

        if metadata:
            text += "\n\n*Details:*\n"
            for key, value in metadata.items():
                text += f"• *{key}:* {value}\n"

        text += f"\n_Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC_"

        # Send via Telegram Bot API
        url = f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage"

        payload = {
            "chat_id": self.telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True
        }

        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()

        logger.info(f"Telegram alert sent: {title}")
        return True

    def _send_webhook(self,
                     title: str,
                     message: str,
                     level: AlertLevel,
                     metadata: Dict[str, Any] = None):
        """Send alert to custom webhook"""

        if not self.webhook_url:
            return

        payload = {
            "title": title,
            "message": message,
            "level": level.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
            "source": "hyperliquid-monitor"
        }

        response = requests.post(
            self.webhook_url,
            json=payload,
            timeout=10
        )
        response.raise_for_status()

        logger.info(f"Webhook alert sent: {title}")
        return True

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
            <h2 style="color: #d32f2f;">🚨 {title}</h2>
            <p>{message}</p>
            """

            if metadata:
                content += "<h3>Details:</h3><ul>"
                for key, value in metadata.items():
                    content += f"<li><strong>{key}:</strong> {value}</li>"
                content += "</ul>"

            content += f"<p><em>Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC</em></p>"

            mail = Mail(
                from_email=os.getenv('FROM_EMAIL', 'alerts@kamiyo.ai'),
                to_emails=self.admin_email,
                subject=f"[CRITICAL] Hyperliquid Alert: {title}",
                html_content=content
            )

            sg = SendGridAPIClient(sendgrid_key)
            response = sg.send(mail)

            logger.info(f"Email alert sent: {title}")

        except Exception as e:
            logger.error(f"Failed to send email: {e}")

    # ==========================================
    # HYPERLIQUID-SPECIFIC ALERT TYPES
    # ==========================================

    def alert_hlp_vault_anomaly(self, anomaly_score: float, account_value: float, pnl_24h: float, health_issues: list):
        """Alert when HLP vault shows anomalous behavior"""

        if anomaly_score >= 70:
            level = AlertLevel.CRITICAL
        elif anomaly_score >= 50:
            level = AlertLevel.ERROR
        elif anomaly_score >= 30:
            level = AlertLevel.WARNING
        else:
            return  # Don't alert for low scores

        self.send_alert(
            title=f"🏦 HLP Vault Anomaly Detected (Score: {anomaly_score:.1f}/100)",
            message=f"Hyperliquid HLP vault showing anomalous behavior. PnL (24h): ${pnl_24h:,.2f}",
            level=level,
            metadata={
                "Anomaly Score": f"{anomaly_score:.1f}/100",
                "Account Value": f"${account_value:,.2f}",
                "PnL (24h)": f"${pnl_24h:,.2f}",
                "Health Issues": ", ".join(health_issues) if health_issues else "None",
                "Action": "Review vault activity and check for exploitation"
            }
        )

    def alert_oracle_deviation(self, asset: str, deviation_pct: float, hl_price: float, reference_price: float, duration: float):
        """Alert when oracle price deviates significantly"""

        if deviation_pct >= 1.0:
            level = AlertLevel.CRITICAL
        elif deviation_pct >= 0.5:
            level = AlertLevel.WARNING
        else:
            return

        self.send_alert(
            title=f"Oracle Deviation: {asset} ({deviation_pct:.2f}%)",
            message=f"Hyperliquid price for {asset} deviating {deviation_pct:.2f}% from market. Potential manipulation detected.",
            level=level,
            metadata={
                "Asset": asset,
                "Deviation": f"{deviation_pct:.2f}%",
                "Hyperliquid Price": f"${hl_price:,.2f}",
                "Reference Price": f"${reference_price:,.2f}",
                "Duration": f"{duration:.0f}s",
                "Action": "Verify prices across multiple sources"
            }
        )

    def alert_flash_loan_attack(self, total_usd: float, duration: float, liquidation_count: int, assets: list):
        """Alert when flash loan attack pattern detected"""

        self.send_alert(
            title=f"Flash Loan Attack Detected (${total_usd:,.0f})",
            message=f"Potential flash loan attack: ${total_usd:,.0f} liquidated in {duration:.1f}s across {liquidation_count} positions.",
            level=AlertLevel.CRITICAL,
            metadata={
                "Total Value": f"${total_usd:,.0f}",
                "Duration": f"{duration:.1f}s",
                "Liquidations": liquidation_count,
                "Assets": ", ".join(assets),
                "Pattern": "Flash Loan Attack",
                "Action": "Investigate transaction sequence and wallet addresses"
            }
        )

    def alert_cascade_liquidation(self, total_usd: float, count: int, duration: float, price_impact: Dict[str, float]):
        """Alert when cascade liquidation detected"""

        self.send_alert(
            title=f"💥 Cascade Liquidation: {count} positions (${total_usd:,.0f})",
            message=f"Cascade liquidation detected: {count} positions liquidated totaling ${total_usd:,.0f} in {duration:.1f} seconds.",
            level=AlertLevel.ERROR,
            metadata={
                "Total Value": f"${total_usd:,.0f}",
                "Liquidation Count": count,
                "Duration": f"{duration/60:.1f} minutes",
                "Price Impact": ", ".join([f"{asset}: {impact:.2f}%" for asset, impact in price_impact.items()]),
                "Pattern": "Cascade Liquidation",
                "Action": "Monitor for market manipulation"
            }
        )

    def alert_large_loss(self, amount: float, source: str, description: str):
        """Alert for large losses detected"""

        if amount >= 2_000_000:
            level = AlertLevel.CRITICAL
        elif amount >= 1_000_000:
            level = AlertLevel.ERROR
        else:
            return

        self.send_alert(
            title=f"💸 Large Loss Detected: ${amount:,.0f}",
            message=f"{description}",
            level=level,
            metadata={
                "Amount": f"${amount:,.0f}",
                "Source": source,
                "Action": "Investigate cause and verify with official channels"
            }
        )

    def alert_system_health(self, component: str, status: str, error: str = None):
        """Alert for system health issues"""

        if status == "down":
            level = AlertLevel.CRITICAL
        elif status == "degraded":
            level = AlertLevel.WARNING
        else:
            level = AlertLevel.INFO

        self.send_alert(
            title=f"🔧 System Health: {component} {status.upper()}",
            message=f"Component '{component}' is {status}. {error or ''}",
            level=level,
            metadata={
                "Component": component,
                "Status": status,
                "Error": error or "None",
                "Action": "Check logs and restart component if needed"
            }
        )


# Singleton instance
_alert_manager = None

def get_alert_manager() -> HyperliquidAlertManager:
    """Get HyperliquidAlertManager singleton"""

    global _alert_manager
    if _alert_manager is None:
        _alert_manager = HyperliquidAlertManager()
    return _alert_manager


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print("\n=== Hyperliquid Alert System Test ===\n")

    # Set test webhook (replace with real webhook to test)
    # os.environ['DISCORD_WEBHOOK_URL'] = 'https://discord.com/api/webhooks/YOUR_WEBHOOK'
    # os.environ['TELEGRAM_BOT_TOKEN'] = 'your_bot_token'
    # os.environ['TELEGRAM_CHAT_ID'] = 'your_chat_id'

    alert_mgr = get_alert_manager()

    print("1. Testing HLP vault anomaly alert...")
    alert_mgr.alert_hlp_vault_anomaly(
        anomaly_score=75.5,
        account_value=577_000_000,
        pnl_24h=-2_500_000,
        health_issues=["Large loss detected: $2.5M in 24h"]
    )

    print("\n2. Testing oracle deviation alert...")
    alert_mgr.alert_oracle_deviation(
        asset="BTC",
        deviation_pct=1.25,
        hl_price=43250,
        reference_price=42700,
        duration=45
    )

    print("\n3. Testing flash loan attack alert...")
    alert_mgr.alert_flash_loan_attack(
        total_usd=750_000,
        duration=8.5,
        liquidation_count=3,
        assets=["BTC", "ETH"]
    )

    print("\nAlert system ready")
    print("Configure DISCORD_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, or SLACK_WEBHOOK_URL to enable alerts")
