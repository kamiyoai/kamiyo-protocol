# -*- coding: utf-8 -*-
"""
Discord Platform Poster
Posts exploit alerts to Discord channels via webhooks
"""

import logging
from typing import Dict, List
import requests

from social.platforms.base import BasePlatformPoster

logger = logging.getLogger(__name__)


class DiscordPoster(BasePlatformPoster):
    """Posts to Discord channels via webhooks"""

    MAX_CONTENT_LENGTH = 2000
    MAX_EMBED_LENGTH = 6000

    SEVERITY_COLORS = {
        'critical': 0xDC143C,  # Crimson
        'high': 0xFF4500,      # OrangeRed
        'medium': 0xFFA500,    # Orange
        'low': 0xFFD700,       # Gold
    }

    def __init__(self, config: Dict):
        """
        Initialize Discord poster

        Args:
            config: Configuration dict with:
                - webhooks: Dict of {channel_name: webhook_url}
                - username: Bot username (optional)
                - avatar_url: Bot avatar URL (optional)
        """
        super().__init__(config)
        # Ensure webhooks is always a dict, never None
        webhooks = config.get('webhooks', {})
        self.webhooks = webhooks if webhooks is not None else {}
        self.username = config.get('username', 'Kamiyo Intelligence')
        self.avatar_url = config.get('avatar_url', 'https://kamiyo.ai/logo.png')

    def authenticate(self) -> bool:
        """Discord webhooks don't require authentication"""
        return len(self.webhooks) > 0

    def is_authenticated(self) -> bool:
        """Check if webhooks configured"""
        return len(self.webhooks) > 0

    def validate_content(self, content: str) -> bool:
        """Validate content for Discord"""
        if len(content) > self.MAX_CONTENT_LENGTH:
            logger.error(f"Content too long: {len(content)} > {self.MAX_CONTENT_LENGTH}")
            return False
        return True

    def create_embed(self, **kwargs) -> Dict:
        """
        Create Discord embed

        Args:
            **kwargs:
                - title: Embed title
                - description: Embed description
                - color: Embed color (hex)
                - fields: List of {name, value, inline} dicts
                - footer: Footer text
                - timestamp: ISO timestamp
                - url: Title URL

        Returns:
            dict: Embed object
        """
        embed = {}

        if kwargs.get('title'):
            embed['title'] = kwargs['title'][:256]  # Max 256 chars

        if kwargs.get('description'):
            embed['description'] = kwargs['description'][:4096]  # Max 4096 chars

        if kwargs.get('color'):
            embed['color'] = kwargs['color']

        if kwargs.get('url'):
            embed['url'] = kwargs['url']

        if kwargs.get('timestamp'):
            embed['timestamp'] = kwargs['timestamp']

        if kwargs.get('footer'):
            embed['footer'] = {'text': kwargs['footer'][:2048]}

        if kwargs.get('fields'):
            # Max 25 fields
            fields = kwargs['fields'][:25]
            embed['fields'] = []
            for field in fields:
                embed['fields'].append({
                    'name': field.get('name', '')[:256],
                    'value': field.get('value', '')[:1024],
                    'inline': field.get('inline', False)
                })

        return embed

    def post(self, content: str, **kwargs) -> Dict:
        """
        Post to Discord webhooks

        Args:
            content: Message content
            **kwargs:
                - webhooks: List of webhook URLs or names (optional)
                - embed: Embed data dict (optional)
                - embeds: List of embed dicts (optional)

        Returns:
            dict: Result
        """
        # Safety check: ensure self.webhooks is not None
        if self.webhooks is None:
            logger.warning("self.webhooks was None, initializing to empty dict")
            self.webhooks = {}

        # Debug logging
        logger.debug(f"Discord post() called with content length: {len(content) if content else 0}")
        logger.debug(f"self.webhooks type: {type(self.webhooks)}, value: {self.webhooks}")
        logger.debug(f"kwargs.get('webhooks'): {kwargs.get('webhooks')}")

        target_webhooks = kwargs.get('webhooks', self.webhooks)

        # If list of names provided, get URLs
        if isinstance(target_webhooks, list):
            # Extra safety: ensure self.webhooks is dict before using it
            if self.webhooks and isinstance(self.webhooks, dict):
                target_webhooks = {
                    name: self.webhooks.get(name)
                    for name in target_webhooks
                    if name in self.webhooks
                }
            else:
                target_webhooks = {}
        elif target_webhooks is None:
            target_webhooks = {}

        if not target_webhooks:
            return {'success': False, 'error': 'No webhooks configured'}

        # Build payload
        payload = {
            'content': content[:self.MAX_CONTENT_LENGTH],
            'username': self.username,
            'avatar_url': self.avatar_url
        }

        # Add embeds if provided
        if kwargs.get('embed'):
            payload['embeds'] = [kwargs['embed']]
        elif kwargs.get('embeds'):
            payload['embeds'] = kwargs['embeds'][:10]  # Max 10 embeds

        results = []
        errors = []

        try:
            items_to_iterate = target_webhooks.items() if target_webhooks else []
        except (AttributeError, TypeError) as e:
            logger.error(f"Error calling .items() on target_webhooks: {e}, type: {type(target_webhooks)}, value: {target_webhooks}")
            return {'success': False, 'error': f'Invalid webhooks configuration: {e}'}

        for name, webhook_url in items_to_iterate:
            if not webhook_url:
                errors.append(f"No webhook URL for {name}")
                continue

            try:
                response = requests.post(
                    webhook_url,
                    json=payload,
                    timeout=10
                )

                if response.status_code in [200, 204]:
                    results.append({
                        'channel': name,
                        'success': True,
                        'webhook_url': webhook_url[:50] + '...'
                    })
                    logger.info(f"Posted to Discord channel: {name}")
                else:
                    error_msg = f"Discord webhook error {response.status_code}: {response.text}"
                    logger.error(error_msg)
                    errors.append(error_msg)
                    results.append({
                        'channel': name,
                        'success': False,
                        'error': error_msg
                    })

            except requests.exceptions.RequestException as e:
                error_msg = f"Request error for {name}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    'channel': name,
                    'success': False,
                    'error': str(e)
                })

        success = any(r.get('success') for r in results)

        return {
            'success': success,
            'results': results,
            'errors': errors if errors else None,
            'post_count': sum(1 for r in results if r.get('success'))
        }

    def post_exploit_alert(self, exploit_data: Dict) -> Dict:
        """
        Post formatted exploit alert with rich embed

        Args:
            exploit_data: Exploit information dict

        Returns:
            dict: Result
        """
        # Determine severity color
        amount = exploit_data.get('loss_amount_usd', 0)
        if amount >= 10_000_000:
            color = self.SEVERITY_COLORS['critical']
            severity = 'CRITICAL'
        elif amount >= 1_000_000:
            color = self.SEVERITY_COLORS['high']
            severity = 'HIGH'
        elif amount >= 100_000:
            color = self.SEVERITY_COLORS['medium']
            severity = 'MEDIUM'
        else:
            color = self.SEVERITY_COLORS['low']
            severity = 'LOW'

        # Format amount
        if amount >= 1_000_000:
            formatted_amount = f"${amount / 1_000_000:.2f}M"
        else:
            formatted_amount = f"${amount / 1_000:.1f}K"

        # Create embed (no emojis)
        embed = self.create_embed(
            title=f"{exploit_data.get('protocol')} Exploit Alert",
            description=exploit_data.get('description', 'Exploit detected'),
            color=color,
            url=exploit_data.get('source_url'),
            timestamp=exploit_data.get('timestamp', ''),
            fields=[
                {
                    'name': 'Loss Amount',
                    'value': formatted_amount,
                    'inline': True
                },
                {
                    'name': 'Chain',
                    'value': exploit_data.get('chain', 'Unknown'),
                    'inline': True
                },
                {
                    'name': 'Type',
                    'value': exploit_data.get('exploit_type', 'Unknown'),
                    'inline': True
                },
                {
                    'name': 'Transaction',
                    'value': f"`{exploit_data.get('tx_hash', 'N/A')[:16]}...`",
                    'inline': False
                },
                {
                    'name': 'Recovery',
                    'value': exploit_data.get('recovery_status', 'Unknown'),
                    'inline': True
                },
                {
                    'name': 'Severity',
                    'value': severity,
                    'inline': True
                }
            ],
            footer='Kamiyo Intelligence Platform'
        )

        return self.post(
            content=f"**EXPLOIT ALERT: {exploit_data.get('protocol')}**",
            embeds=[embed]
        )
