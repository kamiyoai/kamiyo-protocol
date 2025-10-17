#!/usr/bin/env python3
"""
Test Discord Bot Posting
Uses discord.py to post directly via bot instead of webhook
"""
import os
import discord
from discord.ext import commands

# Configuration
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
CHANNEL_ID = int(os.getenv('DISCORD_CHANNEL_ID', '1335910966205878393'))

# Create bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'✅ Bot connected as {bot.user}')
    print(f'📤 Sending test message to channel {CHANNEL_ID}...')

    # Get channel
    channel = bot.get_channel(CHANNEL_ID)

    if not channel:
        print(f'❌ Could not find channel {CHANNEL_ID}')
        print('   Make sure:')
        print('   1. Bot is invited to your server')
        print('   2. Channel ID is correct')
        print('   3. Bot has permission to view the channel')
        await bot.close()
        return

    # Create embed (fancy Discord message)
    embed = discord.Embed(
        title="🚨 Test: Kamiyo Exploit Alert",
        description="Testing Discord bot integration for autonomous growth engine",
        color=discord.Color.red()
    )

    embed.add_field(
        name="Protocol",
        value="Test Protocol",
        inline=True
    )

    embed.add_field(
        name="Loss Amount",
        value="$1,000,000",
        inline=True
    )

    embed.add_field(
        name="Chain",
        value="Ethereum",
        inline=True
    )

    embed.add_field(
        name="Exploit Type",
        value="Reentrancy Attack",
        inline=False
    )

    embed.set_footer(text="Kamiyo.ai - Real-time Exploit Intelligence")

    try:
        await channel.send(embed=embed)
        print('✅ Test message sent successfully!')
        print('   Check your Discord channel!')
    except discord.Forbidden:
        print('❌ Permission denied - bot needs "Send Messages" permission')
    except Exception as e:
        print(f'❌ Error sending message: {e}')

    await bot.close()

# Run bot
print("=" * 80)
print("🤖 TESTING DISCORD BOT")
print("=" * 80)
print()

if BOT_TOKEN == 'YOUR_BOT_TOKEN_HERE':
    print("❌ ERROR: Bot token not set!")
    print()
    print("Set your bot token:")
    print("  export DISCORD_BOT_TOKEN='your_token_here'")
    print()
    print("Get token from:")
    print("  https://discord.com/developers/applications")
    print("  → Your App → Bot → Token")
else:
    print(f"Bot Token: {BOT_TOKEN[:20]}...{BOT_TOKEN[-5:]}")
    print(f"Channel ID: {CHANNEL_ID}")
    print()
    print("Connecting...")
    print()

    try:
        bot.run(BOT_TOKEN)
    except discord.LoginFailure:
        print("❌ Invalid bot token!")
        print("   Check your token from Discord Developer Portal")
    except Exception as e:
        print(f"❌ Error: {e}")
