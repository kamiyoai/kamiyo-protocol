# -*- coding: utf-8 -*-
"""
Telegram Channel Monitor Aggregator
Monitors public Telegram security channels for exploit mentions
"""

import os
import logging
import asyncio
import re
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from telegram import Bot
from telegram.error import TelegramError
from aggregators.base import BaseAggregator

logger = logging.getLogger(__name__)


class TelegramMonitor(BaseAggregator):
    """
    Monitor public Telegram security channels for exploit information

    Channels to monitor:
    - @defisecurity
    - @rugdoc
    - @chaindefend
    - @exploitalerts
    """

    def __init__(self, bot_token: str, channels: List[str]):
        """
        Initialize Telegram monitor

        Args:
            bot_token: Telegram bot token
            channels: List of channel usernames to monitor (e.g., ['@defisecurity'])
        """
        super().__init__("telegram_monitor")
        self.bot_token = bot_token
        self.channels = channels
        self.bot = None
        self.last_message_ids: Dict[str, int] = {}

    async def initialize_bot(self):
        """Initialize Telegram bot"""
        if not self.bot:
            self.bot = Bot(token=self.bot_token)
            logger.info("Telegram bot initialized")

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch exploits from monitored Telegram channels
        Note: This is synchronous, so we wrap the async call
        """
        try:
            # Run async fetch in event loop
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Create new task if loop is already running
                future = asyncio.ensure_future(self._fetch_exploits_async())
                return []  # Return empty for now, will be processed in next cycle
            else:
                return loop.run_until_complete(self._fetch_exploits_async())
        except Exception as e:
            self.logger.error(f"Error fetching from Telegram: {e}")
            return []

    async def _fetch_exploits_async(self) -> List[Dict[str, Any]]:
        """Async implementation of exploit fetching"""
        await self.initialize_bot()

        exploits = []

        for channel in self.channels:
            try:
                channel_exploits = await self._monitor_channel(channel)
                exploits.extend(channel_exploits)
            except Exception as e:
                self.logger.error(f"Error monitoring channel {channel}: {e}")

        self.logger.info(f"Found {len(exploits)} exploits from Telegram channels")
        return exploits

    async def _monitor_channel(self, channel: str) -> List[Dict[str, Any]]:
        """
        Monitor a specific Telegram channel

        Args:
            channel: Channel username (e.g., '@defisecurity')

        Returns:
            List of exploits found in recent messages
        """
        exploits = []

        try:
            # Get channel info
            chat = await self.bot.get_chat(channel)

            # Note: Getting channel messages requires special permissions
            # For public channels, we need to use MTProto API (telethon)
            # This is a simplified version - in production, use telethon

            # For now, we'll simulate by showing the pattern
            # Real implementation would use telethon.sync.TelegramClient

            self.logger.warning(
                f"Telegram channel monitoring requires MTProto API. "
                f"Channel {channel} monitoring not implemented in this version. "
                f"Use telethon library for production."
            )

            # Example of what the real implementation would look like:
            # from telethon.sync import TelegramClient
            # async with TelegramClient('session', api_id, api_hash) as client:
            #     async for message in client.iter_messages(channel, limit=100):
            #         exploit = self._parse_message(message)
            #         if exploit:
            #             exploits.append(exploit)

        except TelegramError as e:
            self.logger.error(f"Telegram API error for {channel}: {e}")
        except Exception as e:
            self.logger.error(f"Error monitoring channel {channel}: {e}")

        return exploits

    def _parse_message(self, message_text: str, channel: str, message_date: datetime) -> Optional[Dict[str, Any]]:
        """
        Parse Telegram message for exploit information

        Args:
            message_text: Message content
            channel: Channel name
            message_date: Message timestamp

        Returns:
            Exploit dict if found, None otherwise
        """
        if not message_text:
            return None

        # Look for exploit indicators
        exploit_keywords = [
            'exploit', 'hack', 'attack', 'drain', 'rug pull',
            'vulnerability', 'breach', 'compromised', 'stolen'
        ]

        message_lower = message_text.lower()
        if not any(keyword in message_lower for keyword in exploit_keywords):
            return None

        # Extract chain
        chain = self.extract_chain(message_text)
        if not chain:
            chain = "Unknown"

        # Extract protocol name
        protocol = self._extract_protocol(message_text)
        if not protocol:
            protocol = "Unknown"

        # Extract amount
        amount = self.parse_amount(message_text)

        # Extract transaction hash
        tx_hash = self._extract_tx_hash(message_text)
        if not tx_hash:
            # Generate pseudo hash if not found
            tx_hash = self.generate_tx_hash(protocol, chain, message_date.isoformat())

        # Determine category
        category = self._determine_category(message_text)

        # Build exploit dict
        exploit = {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount,
            'timestamp': message_date,
            'source': f"telegram:{channel}",
            'source_url': f"https://t.me/{channel.lstrip('@')}",
            'category': category,
            'description': message_text[:500],  # First 500 chars
            'recovery_status': 'Unknown'
        }

        return exploit

    def _extract_protocol(self, text: str) -> Optional[str]:
        """Extract protocol/project name from text"""
        # Common DeFi protocol patterns
        protocols = [
            'uniswap', 'aave', 'compound', 'curve', 'balancer',
            'sushiswap', 'pancakeswap', 'venus', 'cream',
            'yearn', 'harvest', 'pickle', 'value defi',
            'beefy', 'autofarm', 'alpaca', 'mimo'
        ]

        text_lower = text.lower()
        for protocol in protocols:
            if protocol in text_lower:
                return protocol.title()

        # Try to extract capitalized words that might be protocol names
        # Look for words followed by "protocol", "finance", "DeFi"
        protocol_pattern = r'([A-Z][a-z]+(?:[A-Z][a-z]+)*)\s+(?:Protocol|Finance|DeFi|DEX)'
        match = re.search(protocol_pattern, text)
        if match:
            return match.group(1)

        return None

    def _extract_tx_hash(self, text: str) -> Optional[str]:
        """Extract transaction hash from text"""
        # Ethereum tx hash pattern (0x followed by 64 hex chars)
        eth_pattern = r'0x[a-fA-F0-9]{64}'
        match = re.search(eth_pattern, text)
        if match:
            return match.group(0)

        # Solana tx hash pattern (base58, ~88 chars)
        solana_pattern = r'\b[1-9A-HJ-NP-Za-km-z]{87,88}\b'
        match = re.search(solana_pattern, text)
        if match:
            # Verify it's likely a tx hash (not just any base58 string)
            if 'tx' in text.lower() or 'transaction' in text.lower():
                return match.group(0)

        return None

    def _determine_category(self, text: str) -> str:
        """Determine exploit category from text"""
        text_lower = text.lower()

        if any(word in text_lower for word in ['flash loan', 'flashloan']):
            return 'Flash Loan'
        elif any(word in text_lower for word in ['reentrancy', 're-entrancy']):
            return 'Reentrancy'
        elif any(word in text_lower for word in ['oracle', 'price manipulation']):
            return 'Oracle Manipulation'
        elif any(word in text_lower for word in ['rug pull', 'rugpull', 'exit scam']):
            return 'Rug Pull'
        elif any(word in text_lower for word in ['private key', 'access control']):
            return 'Access Control'
        elif any(word in text_lower for word in ['bridge', 'cross-chain']):
            return 'Bridge Exploit'
        elif any(word in text_lower for word in ['governance', 'voting']):
            return 'Governance Attack'
        else:
            return 'Other'


class TelegramMonitorTelethon(BaseAggregator):
    """
    Advanced Telegram monitor using Telethon (MTProto)
    This is the production-ready version that can actually read channel messages

    Requires: pip install telethon
    """

    def __init__(self, api_id: str, api_hash: str, channels: List[str]):
        """
        Initialize Telethon-based monitor

        Args:
            api_id: Telegram API ID (from https://my.telegram.org)
            api_hash: Telegram API Hash
            channels: List of channel usernames to monitor
        """
        super().__init__("telegram_monitor_telethon")
        self.api_id = api_id
        self.api_hash = api_hash
        self.channels = channels
        self.client = None
        self.last_check = datetime.now() - timedelta(hours=24)

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch exploits from Telegram channels"""
        try:
            # This requires telethon library
            from telethon.sync import TelegramClient
            from telethon.tl.types import Message

            exploits = []

            with TelegramClient('kamiyo_monitor', self.api_id, self.api_hash) as client:
                for channel in self.channels:
                    try:
                        # Get recent messages (last 24 hours)
                        messages = client.iter_messages(
                            channel,
                            limit=100,
                            offset_date=self.last_check
                        )

                        for message in messages:
                            if isinstance(message, Message) and message.text:
                                exploit = self._parse_telegram_message(
                                    message.text,
                                    channel,
                                    message.date
                                )
                                if exploit and self.validate_exploit(exploit):
                                    exploits.append(self.normalize_exploit(exploit))

                    except Exception as e:
                        self.logger.error(f"Error fetching from channel {channel}: {e}")

            self.last_check = datetime.now()
            self.logger.info(f"Found {len(exploits)} exploits from Telegram")
            return exploits

        except ImportError:
            self.logger.error(
                "Telethon library not installed. "
                "Install with: pip install telethon"
            )
            return []
        except Exception as e:
            self.logger.error(f"Error in Telethon monitor: {e}")
            return []

    def _parse_telegram_message(
        self,
        text: str,
        channel: str,
        date: datetime
    ) -> Optional[Dict[str, Any]]:
        """Parse Telegram message for exploit data"""
        # Reuse parsing logic from TelegramMonitor
        monitor = TelegramMonitor("", [])
        return monitor._parse_message(text, channel, date)


def get_telegram_monitor() -> BaseAggregator:
    """
    Factory function to get appropriate Telegram monitor based on config

    Returns:
        TelegramMonitor instance (basic or telethon version)
    """
    from dotenv import load_dotenv
    load_dotenv()

    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    channels_str = os.getenv('TELEGRAM_MONITOR_CHANNELS', '')
    channels = [ch.strip() for ch in channels_str.split(',') if ch.strip()]

    # Check if telethon config is available
    api_id = os.getenv('TELEGRAM_API_ID')
    api_hash = os.getenv('TELEGRAM_API_HASH')

    if api_id and api_hash and channels:
        logger.info("Using Telethon-based Telegram monitor (production)")
        return TelegramMonitorTelethon(api_id, api_hash, channels)
    elif bot_token and channels:
        logger.info("Using basic Telegram monitor (limited functionality)")
        return TelegramMonitor(bot_token, channels)
    else:
        logger.warning("Telegram monitor not configured")
        # Return a no-op aggregator
        class NoOpMonitor(BaseAggregator):
            def __init__(self):
                super().__init__("telegram_monitor_disabled")
            def fetch_exploits(self):
                return []
        return NoOpMonitor()


if __name__ == "__main__":
    # Test the monitor
    logging.basicConfig(level=logging.INFO)

    monitor = get_telegram_monitor()
    exploits = monitor.fetch_exploits()

    print(f"\nFound {len(exploits)} exploits:")
    for exploit in exploits:
        print(f"  - {exploit['protocol']} on {exploit['chain']}: ${exploit['amount_usd']:,.0f}")
