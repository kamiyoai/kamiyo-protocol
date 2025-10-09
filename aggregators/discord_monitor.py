# -*- coding: utf-8 -*-
"""
Discord Server Monitor Aggregator
Monitors public security Discord servers for exploit announcements
"""

import os
import sys
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

import discord
from discord.ext import tasks

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from aggregators.base import BaseAggregator

logger = logging.getLogger(__name__)


class DiscordMonitor(BaseAggregator, discord.Client):
    """
    Monitor Discord servers for exploit announcements

    Monitored Channels:
    - BlockSec official Discord
    - PeckShield announcements
    - DeFi security servers
    - Protocol-specific servers
    """

    def __init__(self):
        BaseAggregator.__init__(self, name='discord_monitor')

        intents = discord.Intents.default()
        intents.message_content = True
        intents.guilds = True

        discord.Client.__init__(self, intents=intents)

        # Channels to monitor (guild_id: channel_id)
        self.monitored_channels = self._parse_monitored_servers()

        # Message cache (prevent duplicates)
        self.processed_messages = set()

        # Exploits buffer
        self.exploits_buffer = []

    def _parse_monitored_servers(self) -> Dict[int, List[int]]:
        """Parse monitored servers from environment"""
        servers_str = os.getenv('DISCORD_MONITOR_SERVERS', '')

        # Format: guild_id:channel_id,guild_id:channel_id
        # Example: 123456:789012,345678:901234

        servers = {}
        if not servers_str:
            return servers

        try:
            for pair in servers_str.split(','):
                if ':' in pair:
                    guild_id, channel_id = pair.strip().split(':')
                    guild_id = int(guild_id)
                    channel_id = int(channel_id)

                    if guild_id not in servers:
                        servers[guild_id] = []
                    servers[guild_id].append(channel_id)
        except Exception as e:
            logger.error(f"Error parsing monitored servers: {e}")

        return servers

    async def on_ready(self):
        """Called when Discord client is ready"""
        logger.info(f'Discord monitor connected as {self.user}')
        logger.info(f'Monitoring {len(self.monitored_channels)} servers')

        # Start periodic fetch task
        if not self.periodic_fetch.is_running():
            self.periodic_fetch.start()

    async def on_message(self, message: discord.Message):
        """Called when message is received"""
        # Ignore bot messages
        if message.author.bot:
            return

        # Check if message is in monitored channel
        if message.guild.id not in self.monitored_channels:
            return

        if message.channel.id not in self.monitored_channels[message.guild.id]:
            return

        # Check if already processed
        if message.id in self.processed_messages:
            return

        # Try to extract exploit data
        exploit = self._extract_exploit_from_message(message)
        if exploit:
            self.exploits_buffer.append(exploit)
            self.processed_messages.add(message.id)
            logger.info(f"Extracted exploit from Discord message: {exploit.get('protocol')}")

    def _extract_exploit_from_message(self, message: discord.Message) -> Optional[Dict[str, Any]]:
        """Extract exploit data from Discord message"""
        content = message.content.lower()

        # Keywords that indicate exploit announcement
        exploit_keywords = [
            'exploit', 'hack', 'attack', 'breach', 'drain', 'stolen',
            'vulnerability', 'rug pull', 'rugpull', 'exit scam',
            'compromised', 'exploited', 'hacked'
        ]

        # Check if message contains exploit keywords
        if not any(keyword in content for keyword in exploit_keywords):
            return None

        # Extract protocol name (usually capitalized or in bold)
        protocol = self._extract_protocol(message.content)
        if not protocol:
            return None

        # Extract chain
        chain = self.extract_chain(message.content)
        if not chain:
            chain = 'Unknown'

        # Extract amount
        amount_usd = self._extract_amount(message.content)

        # Extract transaction hash
        tx_hash = self._extract_tx_hash(message.content)
        if not tx_hash:
            # Generate pseudo hash
            tx_hash = self.generate_tx_hash(
                'discord',
                protocol,
                message.created_at.isoformat()
            )

        # Categorize exploit type
        category = self._categorize_exploit(message.content)

        # Build exploit data
        exploit = {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': protocol,
            'amount_usd': amount_usd,
            'timestamp': message.created_at,
            'source': self.name,
            'source_url': message.jump_url,
            'category': category,
            'description': self._clean_description(message.content),
            'recovery_status': self._extract_recovery_status(message.content)
        }

        return exploit

    def _extract_protocol(self, text: str) -> Optional[str]:
        """Extract protocol name from text"""
        # Look for common patterns:
        # 1. **ProtocolName**
        # 2. Protocol: Name
        # 3. Capitalized words

        # Pattern 1: Bold text
        bold_match = re.search(r'\*\*([A-Z][a-zA-Z0-9\s]+?)\*\*', text)
        if bold_match:
            return bold_match.group(1).strip()

        # Pattern 2: "Protocol: Name" or "Project: Name"
        label_match = re.search(r'(?:protocol|project|platform):\s*([A-Z][a-zA-Z0-9\s]+?)(?:\s|$|\.)', text, re.IGNORECASE)
        if label_match:
            return label_match.group(1).strip()

        # Pattern 3: First capitalized word sequence
        cap_match = re.search(r'\b([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]+)?)\b', text)
        if cap_match:
            potential = cap_match.group(1).strip()
            # Filter out common false positives
            if potential.lower() not in ['the', 'this', 'that', 'with', 'from', 'alert', 'warning']:
                return potential

        return None

    def _extract_amount(self, text: str) -> float:
        """Extract loss amount from text"""
        # Use base class method
        return self.parse_amount(text)

    def _extract_tx_hash(self, text: str) -> Optional[str]:
        """Extract transaction hash from text"""
        # Ethereum-style tx hash (0x followed by 64 hex chars)
        eth_match = re.search(r'0x[a-fA-F0-9]{64}', text)
        if eth_match:
            return eth_match.group(0)

        # Solana-style tx hash (base58, ~88 chars)
        sol_match = re.search(r'\b[1-9A-HJ-NP-Za-km-z]{87,88}\b', text)
        if sol_match:
            return sol_match.group(0)

        return None

    def _categorize_exploit(self, text: str) -> str:
        """Categorize exploit type from text"""
        text_lower = text.lower()

        categories = {
            'Flash Loan': ['flash loan', 'flashloan'],
            'Reentrancy': ['reentrancy', 're-entrancy'],
            'Oracle Manipulation': ['oracle', 'price manipulation'],
            'Access Control': ['access control', 'unauthorized', 'admin key'],
            'Rug Pull': ['rug pull', 'rugpull', 'exit scam'],
            'Bridge Exploit': ['bridge', 'cross-chain'],
            'Smart Contract': ['smart contract', 'contract bug'],
            'Phishing': ['phish', 'social engineering'],
            'Private Key Compromise': ['private key', 'keys compromised'],
        }

        for category, keywords in categories.items():
            if any(keyword in text_lower for keyword in keywords):
                return category

        return 'Unknown'

    def _extract_recovery_status(self, text: str) -> Optional[str]:
        """Extract recovery status from text"""
        text_lower = text.lower()

        if 'funds recovered' in text_lower or 'fully recovered' in text_lower:
            return 'Funds Recovered'
        elif 'partially recovered' in text_lower:
            return 'Partially Recovered'
        elif 'white hat' in text_lower:
            return 'White Hat Return'
        elif 'bounty' in text_lower:
            return 'Bounty Program'

        return None

    def _clean_description(self, text: str) -> str:
        """Clean description text"""
        # Remove Discord formatting
        text = re.sub(r'\*\*', '', text)
        text = re.sub(r'__', '', text)
        text = re.sub(r'~~', '', text)

        # Remove URLs
        text = re.sub(r'http[s]?://\S+', '', text)

        # Remove mentions
        text = re.sub(r'<@!?\d+>', '', text)
        text = re.sub(r'<#\d+>', '', text)
        text = re.sub(r'<@&\d+>', '', text)

        # Truncate to reasonable length
        if len(text) > 500:
            text = text[:497] + '...'

        return text.strip()

    @tasks.loop(minutes=5)
    async def periodic_fetch(self):
        """Periodic task to return buffered exploits"""
        if self.exploits_buffer:
            logger.info(f"Discord monitor: {len(self.exploits_buffer)} exploits in buffer")

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch exploits from Discord (synchronous method for compatibility)

        Note: This returns buffered exploits collected via on_message.
        The actual monitoring happens asynchronously via Discord client.
        """
        # Return and clear buffer
        exploits = self.exploits_buffer.copy()
        self.exploits_buffer.clear()

        logger.info(f"Discord monitor returned {len(exploits)} exploits")
        return exploits

    def run_monitor(self):
        """Run Discord monitor (blocks until stopped)"""
        token = os.getenv('DISCORD_MONITOR_TOKEN')

        if not token:
            logger.error("DISCORD_MONITOR_TOKEN not set in environment")
            return

        if not self.monitored_channels:
            logger.warning("No Discord servers configured for monitoring")
            return

        try:
            logger.info("Starting Discord monitor...")
            self.run(token)
        except Exception as e:
            logger.error(f"Discord monitor error: {e}")


# Standalone runner
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)

    monitor = DiscordMonitor()
    monitor.run_monitor()
