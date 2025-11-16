# -*- coding: utf-8 -*-
"""
Discord Bot for Exploit Alerts
Sends real-time exploit notifications to Discord channels
"""

import os
import sys
import logging
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List

import discord
from discord import app_commands
from discord.ext import commands

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db

logger = logging.getLogger(__name__)

# Chain icons (emoji IDs or Unicode)
CHAIN_ICONS = {
    'ethereum': '⟠',
    'bsc': '🔶',
    'polygon': '🟣',
    'arbitrum': '🔵',
    'optimism': '🔴',
    'avalanche': '🔺',
    'fantom': '👻',
    'solana': '◎',
    'base': '🔷',
}

# Severity colors
SEVERITY_COLORS = {
    'critical': 0xDC143C,  # Crimson - $10M+
    'high': 0xFF4500,      # OrangeRed - $1M-$10M
    'medium': 0xFFA500,    # Orange - $100K-$1M
    'low': 0xFFD700,       # Gold - <$100K
    'info': 0x808080,      # Gray - No amount
}


def get_severity_from_amount(amount_usd: float) -> str:
    """Determine severity level based on loss amount"""
    if amount_usd >= 10_000_000:
        return 'critical'
    elif amount_usd >= 1_000_000:
        return 'high'
    elif amount_usd >= 100_000:
        return 'medium'
    elif amount_usd > 0:
        return 'low'
    else:
        return 'info'


def format_amount(amount_usd: float) -> str:
    """Format USD amount for display"""
    if amount_usd >= 1_000_000:
        return f"${amount_usd / 1_000_000:.2f}M"
    elif amount_usd >= 1_000:
        return f"${amount_usd / 1_000:.2f}K"
    else:
        return f"${amount_usd:.2f}"


class DiscordAlertBot(commands.Bot):
    """Discord bot for sending exploit alerts"""

    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.guilds = True

        super().__init__(
            command_prefix='!',
            intents=intents,
            description='Kamiyo Exploit Intelligence Bot'
        )

        self.db = get_db()
        self.tree.on_error = self.on_app_command_error

    async def setup_hook(self):
        """Called when bot is starting up"""
        logger.info("Setting up Discord bot...")
        await self.tree.sync()
        logger.info("Command tree synced")

    async def on_ready(self):
        """Called when bot is ready"""
        logger.info(f'Bot connected as {self.user} (ID: {self.user.id})')
        logger.info(f'Connected to {len(self.guilds)} guilds')

        # Set activity status
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.watching,
                name="for exploits | /help"
            )
        )

    async def on_app_command_error(
        self,
        interaction: discord.Interaction,
        error: app_commands.AppCommandError
    ):
        """Handle slash command errors"""
        if isinstance(error, app_commands.CommandOnCooldown):
            await interaction.response.send_message(
                f"⏰ This command is on cooldown. Try again in {error.retry_after:.1f}s",
                ephemeral=True
            )
        else:
            logger.error(f"Command error: {error}")
            await interaction.response.send_message(
                "❌ An error occurred while executing this command.",
                ephemeral=True
            )

    def create_exploit_embed(self, exploit: Dict[str, Any]) -> discord.Embed:
        """Create rich embed for exploit alert"""
        severity = get_severity_from_amount(exploit.get('amount_usd', 0))
        color = SEVERITY_COLORS[severity]

        # Title with chain icon
        chain = exploit.get('chain', 'Unknown')
        chain_icon = CHAIN_ICONS.get(chain.lower(), '⚠️')
        title = f"{chain_icon} {exploit.get('protocol', 'Unknown')} Exploit"

        # Create embed
        embed = discord.Embed(
            title=title,
            description=exploit.get('description', 'No description available'),
            color=color,
            timestamp=datetime.fromisoformat(exploit['timestamp']) if isinstance(exploit['timestamp'], str) else exploit['timestamp']
        )

        # Add fields
        if exploit.get('amount_usd'):
            embed.add_field(
                name="💰 Loss Amount",
                value=format_amount(exploit['amount_usd']),
                inline=True
            )

        embed.add_field(
            name="⛓️ Chain",
            value=exploit.get('chain', 'Unknown'),
            inline=True
        )

        embed.add_field(
            name="🏷️ Category",
            value=exploit.get('category', 'Unknown'),
            inline=True
        )

        # Transaction hash with link
        tx_hash = exploit.get('tx_hash', 'N/A')
        if tx_hash and not tx_hash.startswith('generated-'):
            # Add blockchain explorer link
            explorer_url = self.get_explorer_url(chain, tx_hash)
            embed.add_field(
                name="🔍 Transaction",
                value=f"[{tx_hash[:10]}...{tx_hash[-8:]}]({explorer_url})" if explorer_url else tx_hash,
                inline=False
            )

        # Recovery status
        if exploit.get('recovery_status'):
            embed.add_field(
                name="♻️ Recovery",
                value=exploit['recovery_status'],
                inline=True
            )

        # Source
        source_url = exploit.get('source_url', '')
        if source_url:
            embed.add_field(
                name="📰 Source",
                value=f"[{exploit.get('source', 'Link')}]({source_url})",
                inline=True
            )

        # Footer with severity
        embed.set_footer(
            text=f"Severity: {severity.upper()} | Kamiyo Intelligence",
            icon_url="https://kamiyo.ai/icon.png"  # Your logo
        )

        return embed

    def get_explorer_url(self, chain: str, tx_hash: str) -> Optional[str]:
        """Get blockchain explorer URL for transaction"""
        explorers = {
            'ethereum': f'https://etherscan.io/tx/{tx_hash}',
            'bsc': f'https://bscscan.com/tx/{tx_hash}',
            'polygon': f'https://polygonscan.com/tx/{tx_hash}',
            'arbitrum': f'https://arbiscan.io/tx/{tx_hash}',
            'optimism': f'https://optimistic.etherscan.io/tx/{tx_hash}',
            'avalanche': f'https://snowtrace.io/tx/{tx_hash}',
            'fantom': f'https://ftmscan.com/tx/{tx_hash}',
            'base': f'https://basescan.org/tx/{tx_hash}',
        }
        return explorers.get(chain.lower())

    async def send_exploit_alert(
        self,
        channel_id: int,
        exploit: Dict[str, Any],
        create_thread: bool = False
    ) -> bool:
        """Send exploit alert to Discord channel"""
        try:
            channel = self.get_channel(channel_id)
            if not channel:
                logger.warning(f"Channel {channel_id} not found")
                return False

            # Create embed
            embed = self.create_exploit_embed(exploit)

            # Create view with button
            view = discord.ui.View()
            if exploit.get('source_url'):
                view.add_item(
                    discord.ui.Button(
                        label="View Details",
                        url=exploit['source_url'],
                        style=discord.ButtonStyle.link
                    )
                )

            # Send message
            message = await channel.send(embed=embed, view=view)

            # Create thread for high-value exploits
            if create_thread and exploit.get('amount_usd', 0) >= 1_000_000:
                thread_name = f"{exploit.get('protocol', 'Exploit')} - {format_amount(exploit['amount_usd'])}"
                await message.create_thread(
                    name=thread_name[:100],  # Discord limit
                    auto_archive_duration=1440  # 24 hours
                )

            logger.info(f"Alert sent to channel {channel_id} for exploit {exploit.get('tx_hash')}")
            return True

        except discord.Forbidden:
            logger.error(f"No permission to send message to channel {channel_id}")
            return False
        except Exception as e:
            logger.error(f"Error sending alert to channel {channel_id}: {e}")
            return False

    async def send_daily_digest(
        self,
        channel_id: int,
        exploits: List[Dict[str, Any]]
    ) -> bool:
        """Send daily digest of exploits"""
        try:
            channel = self.get_channel(channel_id)
            if not channel:
                return False

            # Create summary embed
            total_loss = sum(e.get('amount_usd', 0) for e in exploits)
            chains_affected = len(set(e.get('chain') for e in exploits))

            embed = discord.Embed(
                title="📊 Daily Exploit Digest",
                description=f"Summary of exploits in the last 24 hours",
                color=0x3498DB,
                timestamp=datetime.utcnow()
            )

            embed.add_field(
                name="Total Exploits",
                value=str(len(exploits)),
                inline=True
            )

            embed.add_field(
                name="Total Loss",
                value=format_amount(total_loss),
                inline=True
            )

            embed.add_field(
                name="Chains Affected",
                value=str(chains_affected),
                inline=True
            )

            # Top 5 exploits
            sorted_exploits = sorted(
                exploits,
                key=lambda x: x.get('amount_usd', 0),
                reverse=True
            )[:5]

            if sorted_exploits:
                exploit_list = "\n".join([
                    f"• **{e.get('protocol', 'Unknown')}** ({e.get('chain', 'Unknown')}): {format_amount(e.get('amount_usd', 0))}"
                    for e in sorted_exploits
                ])
                embed.add_field(
                    name="🔥 Top Exploits",
                    value=exploit_list,
                    inline=False
                )

            embed.set_footer(text="Kamiyo Intelligence")

            await channel.send(embed=embed)
            return True

        except Exception as e:
            logger.error(f"Error sending daily digest: {e}")
            return False


# Initialize bot instance
bot = DiscordAlertBot()


# Slash Commands

@bot.tree.command(name="subscribe", description="Subscribe channel to exploit alerts")
@app_commands.describe(
    min_amount="Minimum exploit amount (USD) to receive alerts (default: 0)",
    chains="Comma-separated list of chains to monitor (e.g., ethereum,bsc)"
)
async def subscribe(
    interaction: discord.Interaction,
    min_amount: Optional[float] = 0,
    chains: Optional[str] = None
):
    """Subscribe channel to exploit alerts"""
    # Check permissions
    if not interaction.user.guild_permissions.manage_channels:
        await interaction.response.send_message(
            "❌ You need 'Manage Channels' permission to use this command.",
            ephemeral=True
        )
        return

    try:
        guild_id = interaction.guild_id
        channel_id = interaction.channel_id

        # Parse chains
        chain_filter = None
        if chains:
            chain_filter = [c.strip().title() for c in chains.split(',')]

        # Store subscription in database
        # Note: This requires discord_channels table (created in migration)
        bot.db.execute("""
            INSERT INTO discord_channels (guild_id, channel_id, min_amount_usd, chain_filter, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(guild_id, channel_id) DO UPDATE SET
                min_amount_usd = excluded.min_amount_usd,
                chain_filter = excluded.chain_filter,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP
        """, (guild_id, channel_id, min_amount, ','.join(chain_filter) if chain_filter else None))
        bot.db.commit()

        # Send confirmation
        embed = discord.Embed(
            title="✅ Subscription Active",
            description=f"This channel will receive exploit alerts",
            color=0x2ECC71
        )

        embed.add_field(
            name="Minimum Amount",
            value=format_amount(min_amount) if min_amount > 0 else "All exploits",
            inline=True
        )

        if chain_filter:
            embed.add_field(
                name="Chains",
                value=", ".join(chain_filter),
                inline=True
            )

        await interaction.response.send_message(embed=embed)

    except Exception as e:
        logger.error(f"Error in subscribe command: {e}")
        await interaction.response.send_message(
            "❌ Failed to subscribe channel. Please try again.",
            ephemeral=True
        )


@bot.tree.command(name="unsubscribe", description="Unsubscribe channel from exploit alerts")
async def unsubscribe(interaction: discord.Interaction):
    """Unsubscribe channel from alerts"""
    if not interaction.user.guild_permissions.manage_channels:
        await interaction.response.send_message(
            "❌ You need 'Manage Channels' permission to use this command.",
            ephemeral=True
        )
        return

    try:
        guild_id = interaction.guild_id
        channel_id = interaction.channel_id

        # Deactivate subscription
        bot.db.execute("""
            UPDATE discord_channels
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ? AND channel_id = ?
        """, (guild_id, channel_id))
        bot.db.commit()

        await interaction.response.send_message("✅ Channel unsubscribed from exploit alerts.")

    except Exception as e:
        logger.error(f"Error in unsubscribe command: {e}")
        await interaction.response.send_message(
            "❌ Failed to unsubscribe. Please try again.",
            ephemeral=True
        )


@bot.tree.command(name="status", description="Check subscription status for this channel")
async def status(interaction: discord.Interaction):
    """Check subscription status"""
    try:
        guild_id = interaction.guild_id
        channel_id = interaction.channel_id

        # Get subscription
        result = bot.db.execute("""
            SELECT min_amount_usd, chain_filter, is_active, created_at
            FROM discord_channels
            WHERE guild_id = ? AND channel_id = ?
        """, (guild_id, channel_id)).fetchone()

        if not result or not result['is_active']:
            await interaction.response.send_message(
                "❌ This channel is not subscribed to exploit alerts.\nUse `/subscribe` to start receiving alerts.",
                ephemeral=True
            )
            return

        # Create status embed
        embed = discord.Embed(
            title="📊 Subscription Status",
            color=0x3498DB
        )

        embed.add_field(
            name="Status",
            value="✅ Active",
            inline=True
        )

        embed.add_field(
            name="Minimum Amount",
            value=format_amount(result['min_amount_usd']) if result['min_amount_usd'] > 0 else "All exploits",
            inline=True
        )

        if result['chain_filter']:
            embed.add_field(
                name="Chains",
                value=result['chain_filter'],
                inline=True
            )

        embed.add_field(
            name="Subscribed Since",
            value=result['created_at'][:10],
            inline=True
        )

        await interaction.response.send_message(embed=embed)

    except Exception as e:
        logger.error(f"Error in status command: {e}")
        await interaction.response.send_message(
            "❌ Failed to check status.",
            ephemeral=True
        )


@bot.tree.command(name="filter", description="Update alert filters for this channel")
@app_commands.describe(
    min_amount="Minimum exploit amount (USD)",
    chains="Comma-separated list of chains (e.g., ethereum,bsc)"
)
async def filter_alerts(
    interaction: discord.Interaction,
    min_amount: Optional[float] = None,
    chains: Optional[str] = None
):
    """Update alert filters"""
    if not interaction.user.guild_permissions.manage_channels:
        await interaction.response.send_message(
            "❌ You need 'Manage Channels' permission to use this command.",
            ephemeral=True
        )
        return

    try:
        guild_id = interaction.guild_id
        channel_id = interaction.channel_id

        # Check if subscribed
        result = bot.db.execute("""
            SELECT is_active FROM discord_channels
            WHERE guild_id = ? AND channel_id = ?
        """, (guild_id, channel_id)).fetchone()

        if not result or not result['is_active']:
            await interaction.response.send_message(
                "❌ This channel is not subscribed. Use `/subscribe` first.",
                ephemeral=True
            )
            return

        # Update filters
        updates = []
        params = []

        if min_amount is not None:
            updates.append("min_amount_usd = ?")
            params.append(min_amount)

        if chains is not None:
            chain_filter = [c.strip().title() for c in chains.split(',')]
            updates.append("chain_filter = ?")
            params.append(','.join(chain_filter))

        if not updates:
            await interaction.response.send_message(
                "❌ No filters specified.",
                ephemeral=True
            )
            return

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([guild_id, channel_id])

        bot.db.execute(f"""
            UPDATE discord_channels
            SET {', '.join(updates)}
            WHERE guild_id = ? AND channel_id = ?
        """, params)
        bot.db.commit()

        await interaction.response.send_message("✅ Alert filters updated successfully.")

    except Exception as e:
        logger.error(f"Error in filter command: {e}")
        await interaction.response.send_message(
            "❌ Failed to update filters.",
            ephemeral=True
        )


@bot.tree.command(name="stats", description="Get exploit statistics")
@app_commands.describe(
    days="Number of days to analyze (default: 1)"
)
async def stats(interaction: discord.Interaction, days: Optional[int] = 1):
    """Get exploit statistics"""
    try:
        # Get stats from database
        if days == 1:
            stats_data = bot.db.get_stats_24h()
        else:
            stats_data = bot.db.get_stats_custom(days=days)

        # Create embed
        embed = discord.Embed(
            title=f"📊 Exploit Statistics ({days} day{'s' if days > 1 else ''})",
            color=0x3498DB,
            timestamp=datetime.utcnow()
        )

        embed.add_field(
            name="Total Exploits",
            value=str(stats_data.get('total_exploits', 0)),
            inline=True
        )

        embed.add_field(
            name="Total Loss",
            value=format_amount(stats_data.get('total_loss_usd', 0)),
            inline=True
        )

        embed.add_field(
            name="Chains Affected",
            value=str(stats_data.get('chains_affected', 0)),
            inline=True
        )

        embed.add_field(
            name="Protocols Affected",
            value=str(stats_data.get('protocols_affected', 0)),
            inline=True
        )

        if stats_data.get('avg_loss_usd'):
            embed.add_field(
                name="Average Loss",
                value=format_amount(stats_data['avg_loss_usd']),
                inline=True
            )

        embed.set_footer(text="Kamiyo Intelligence")

        await interaction.response.send_message(embed=embed)

    except Exception as e:
        logger.error(f"Error in stats command: {e}")
        await interaction.response.send_message(
            "❌ Failed to fetch statistics.",
            ephemeral=True
        )


@bot.tree.command(name="recent", description="Show recent exploits")
@app_commands.describe(
    count="Number of exploits to show (default: 5, max: 10)"
)
async def recent(interaction: discord.Interaction, count: Optional[int] = 5):
    """Show recent exploits"""
    try:
        count = min(count, 10)  # Limit to 10

        # Get recent exploits
        exploits = bot.db.get_recent_exploits(limit=count)

        if not exploits:
            await interaction.response.send_message(
                "ℹ️ No recent exploits found.",
                ephemeral=True
            )
            return

        # Create embed
        embed = discord.Embed(
            title=f"🔥 Recent Exploits (Last {count})",
            color=0xE74C3C,
            timestamp=datetime.utcnow()
        )

        for exploit in exploits:
            chain_icon = CHAIN_ICONS.get(exploit.get('chain', '').lower(), '⚠️')
            value = f"{chain_icon} **{exploit.get('chain', 'Unknown')}** | {format_amount(exploit.get('amount_usd', 0))}"

            if exploit.get('category'):
                value += f" | {exploit.get('category')}"

            embed.add_field(
                name=exploit.get('protocol', 'Unknown'),
                value=value,
                inline=False
            )

        embed.set_footer(text="Kamiyo Intelligence")

        await interaction.response.send_message(embed=embed)

    except Exception as e:
        logger.error(f"Error in recent command: {e}")
        await interaction.response.send_message(
            "❌ Failed to fetch recent exploits.",
            ephemeral=True
        )


@bot.tree.command(name="help", description="Show help information")
async def help_command(interaction: discord.Interaction):
    """Show help information"""
    embed = discord.Embed(
        title="📚 Kamiyo Bot Help",
        description="Exploit intelligence aggregation for crypto",
        color=0x3498DB
    )

    embed.add_field(
        name="/subscribe",
        value="Subscribe channel to exploit alerts",
        inline=False
    )

    embed.add_field(
        name="/unsubscribe",
        value="Unsubscribe channel from alerts",
        inline=False
    )

    embed.add_field(
        name="/status",
        value="Check subscription status",
        inline=False
    )

    embed.add_field(
        name="/filter",
        value="Update alert filters (min amount, chains)",
        inline=False
    )

    embed.add_field(
        name="/stats",
        value="Get exploit statistics",
        inline=False
    )

    embed.add_field(
        name="/recent",
        value="Show recent exploits",
        inline=False
    )

    embed.add_field(
        name="🔗 Links",
        value="[Website](https://kamiyo.ai) | [Dashboard](https://app.kamiyo.ai) | [API Docs](https://api.kamiyo.ai/docs)",
        inline=False
    )

    embed.set_footer(text="Kamiyo Intelligence")

    await interaction.response.send_message(embed=embed)


def run_bot():
    """Run Discord bot"""
    token = os.getenv('DISCORD_BOT_TOKEN')

    if not token:
        logger.error("DISCORD_BOT_TOKEN not set in environment")
        return

    try:
        bot.run(token)
    except Exception as e:
        logger.error(f"Failed to start bot: {e}")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    run_bot()
