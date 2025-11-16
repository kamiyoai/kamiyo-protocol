# -*- coding: utf-8 -*-
"""
Email Notification Templates
HTML email templates for exploit alerts
"""

from typing import Dict
from datetime import datetime


class EmailTemplates:
    """Email templates for various notifications"""

    @staticmethod
    def exploit_alert(exploit_data: Dict) -> Dict[str, str]:
        """
        Generate exploit alert email

        Args:
            exploit_data: Exploit information dict

        Returns:
            dict with 'subject', 'html', 'text' keys
        """
        protocol = exploit_data.get('protocol', 'Unknown')
        chain = exploit_data.get('chain', 'Unknown')
        amount_usd = exploit_data.get('loss_amount_usd', 0)
        exploit_type = exploit_data.get('exploit_type', 'Unknown')
        tx_hash = exploit_data.get('tx_hash', 'N/A')
        timestamp = exploit_data.get('timestamp', datetime.utcnow().isoformat())
        description = exploit_data.get('description', 'No description available')
        recovery = exploit_data.get('recovery_status', 'Unknown')

        # Format amount
        if amount_usd >= 1_000_000:
            formatted_amount = f"${amount_usd / 1_000_000:.2f}M"
        else:
            formatted_amount = f"${amount_usd / 1_000:.1f}K"

        subject = f"🚨 {protocol} Exploit Alert - {formatted_amount} Lost"

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            background: #f8f9fa;
            padding: 30px;
            border-radius: 0 0 10px 10px;
        }}
        .alert-box {{
            background: white;
            border-left: 4px solid #dc3545;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
        }}
        .detail-row {{
            display: flex;
            padding: 10px 0;
            border-bottom: 1px solid #dee2e6;
        }}
        .detail-label {{
            font-weight: bold;
            min-width: 150px;
            color: #6c757d;
        }}
        .detail-value {{
            color: #212529;
        }}
        .tx-hash {{
            font-family: 'Courier New', monospace;
            font-size: 12px;
            background: #e9ecef;
            padding: 5px;
            border-radius: 3px;
            word-break: break-all;
        }}
        .cta-button {{
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
        }}
        .footer {{
            text-align: center;
            color: #6c757d;
            font-size: 12px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 Exploit Alert</h1>
        <p style="margin: 10px 0 0 0; font-size: 18px;">{protocol} - {formatted_amount}</p>
    </div>

    <div class="content">
        <div class="alert-box">
            <h2 style="margin-top: 0; color: #dc3545;">Security Incident Detected</h2>
            <p>{description}</p>
        </div>

        <div class="detail-row">
            <div class="detail-label">💰 Loss Amount:</div>
            <div class="detail-value"><strong>{formatted_amount}</strong> (${amount_usd:,.2f} USD)</div>
        </div>

        <div class="detail-row">
            <div class="detail-label">⛓️ Blockchain:</div>
            <div class="detail-value">{chain}</div>
        </div>

        <div class="detail-row">
            <div class="detail-label">🔥 Exploit Type:</div>
            <div class="detail-value">{exploit_type}</div>
        </div>

        <div class="detail-row">
            <div class="detail-label">⏰ Timestamp:</div>
            <div class="detail-value">{timestamp}</div>
        </div>

        <div class="detail-row">
            <div class="detail-label">♻️ Recovery Status:</div>
            <div class="detail-value">{recovery}</div>
        </div>

        <div style="margin-top: 20px;">
            <div class="detail-label" style="margin-bottom: 10px;">🔗 Transaction Hash:</div>
            <div class="tx-hash">{tx_hash}</div>
        </div>

        <div style="text-align: center;">
            <a href="https://kamiyo.ai/exploits/{tx_hash}" class="cta-button">
                View Full Details →
            </a>
        </div>

        <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <strong>⚠️ Stay Safe:</strong>
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Review your protocol's security if using similar patterns</li>
                <li>Check if your funds are affected</li>
                <li>Follow official channels for updates</li>
            </ul>
        </div>
    </div>

    <div class="footer">
        <p>
            This alert was sent by <strong>Kamiyo Intelligence Platform</strong><br>
            Real-time cryptocurrency exploit aggregation and monitoring
        </p>
        <p>
            <a href="https://kamiyo.ai">Visit Platform</a> |
            <a href="https://kamiyo.ai/settings">Manage Alerts</a> |
            <a href="https://kamiyo.ai/unsubscribe">Unsubscribe</a>
        </p>
    </div>
</body>
</html>
"""

        text = f"""
🚨 EXPLOIT ALERT: {protocol}

💰 Loss Amount: {formatted_amount} (${amount_usd:,.2f} USD)
⛓️ Blockchain: {chain}
🔥 Exploit Type: {exploit_type}
⏰ Timestamp: {timestamp}
♻️ Recovery Status: {recovery}

📝 Description:
{description}

🔗 Transaction Hash:
{tx_hash}

View full details: https://kamiyo.ai/exploits/{tx_hash}

---
Kamiyo Intelligence Platform
Real-time cryptocurrency exploit monitoring
https://kamiyo.ai
"""

        return {
            'subject': subject,
            'html': html,
            'text': text
        }

    @staticmethod
    def daily_digest(exploits: list, date: str) -> Dict[str, str]:
        """Generate daily digest email"""
        total_exploits = len(exploits)
        total_loss = sum(e.get('loss_amount_usd', 0) for e in exploits)

        subject = f"📊 Daily Exploit Digest - {date} ({total_exploits} incidents)"

        # Generate exploit list
        exploit_rows = ""
        for exploit in exploits[:10]:  # Top 10
            protocol = exploit.get('protocol', 'Unknown')
            amount = exploit.get('loss_amount_usd', 0)
            chain = exploit.get('chain', 'Unknown')

            if amount >= 1_000_000:
                formatted = f"${amount / 1_000_000:.2f}M"
            else:
                formatted = f"${amount / 1_000:.0f}K"

            exploit_rows += f"""
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">{protocol}</td>
                <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">{chain}</td>
                <td style="padding: 10px; border-bottom: 1px solid #dee2e6; text-align: right;"><strong>{formatted}</strong></td>
            </tr>
            """

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #667eea; color: white; padding: 20px; text-align: center; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th {{ background: #f8f9fa; padding: 10px; text-align: left; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Daily Exploit Digest</h1>
            <p>{date}</p>
        </div>

        <div style="padding: 20px; background: #f8f9fa;">
            <h2>Summary</h2>
            <p><strong>Total Incidents:</strong> {total_exploits}</p>
            <p><strong>Total Loss:</strong> ${total_loss:,.2f} USD</p>

            <h3 style="margin-top: 30px;">Top Exploits</h3>
            <table>
                <thead>
                    <tr>
                        <th>Protocol</th>
                        <th>Chain</th>
                        <th style="text-align: right;">Loss</th>
                    </tr>
                </thead>
                <tbody>
                    {exploit_rows}
                </tbody>
            </table>

            <div style="text-align: center; margin-top: 30px;">
                <a href="https://kamiyo.ai" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    View Full Report →
                </a>
            </div>
        </div>

        <div style="text-align: center; color: #6c757d; font-size: 12px; margin-top: 20px;">
            <p>Kamiyo Intelligence Platform | <a href="https://kamiyo.ai/unsubscribe">Unsubscribe</a></p>
        </div>
    </div>
</body>
</html>
"""

        return {
            'subject': subject,
            'html': html,
            'text': f"Daily Exploit Digest for {date}\n\nTotal Incidents: {total_exploits}\nTotal Loss: ${total_loss:,.2f}\n\nView full report: https://kamiyo.ai"
        }

    @staticmethod
    def welcome_email(user_email: str, tier: str) -> Dict[str, str]:
        """Generate welcome email for new users"""
        subject = "Welcome to Kamiyo Intelligence Platform! 🎉"

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px; }}
        .content {{ padding: 30px 20px; }}
        .feature {{ padding: 15px; margin: 10px 0; background: #f8f9fa; border-radius: 5px; }}
        .cta {{ background: #667eea; color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Kamiyo! 🎉</h1>
            <p>Your cryptocurrency security intelligence platform</p>
        </div>

        <div class="content">
            <p>Hi there,</p>

            <p>Welcome to Kamiyo Intelligence Platform! You're now part of a growing community staying ahead of cryptocurrency security threats.</p>

            <p><strong>Your Plan:</strong> {tier.title()}</p>

            <div class="feature">
                <h3>🔍 Real-Time Monitoring</h3>
                <p>Get instant alerts on exploits across 14+ security sources</p>
            </div>

            <div class="feature">
                <h3>📊 Comprehensive Data</h3>
                <p>Access detailed exploit information with transaction hashes, loss amounts, and recovery status</p>
            </div>

            <div class="feature">
                <h3>🚀 Developer API</h3>
                <p>Integrate exploit intelligence into your applications</p>
            </div>

            <div style="text-align: center;">
                <a href="https://kamiyo.ai/dashboard" class="cta">
                    Get Started →
                </a>
            </div>

            <p style="margin-top: 30px;">Need help? Check out our <a href="https://kamiyo.ai/docs">documentation</a> or <a href="mailto:support@kamiyo.ai">contact support</a>.</p>

            <p>Best regards,<br>The Kamiyo Team</p>
        </div>

        <div style="text-align: center; color: #6c757d; font-size: 12px; padding: 20px;">
            <p>© 2025 Kamiyo Intelligence Platform</p>
        </div>
    </div>
</body>
</html>
"""

        return {
            'subject': subject,
            'html': html,
            'text': f"Welcome to Kamiyo Intelligence Platform!\n\nYour Plan: {tier.title()}\n\nGet started: https://kamiyo.ai/dashboard"
        }
