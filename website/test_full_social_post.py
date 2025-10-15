#!/usr/bin/env python3
"""
Test Full Social Engine with Discord Bot
Posts a real exploit from the API to Discord
"""
import os
import discord
import asyncio
from datetime import datetime
import requests

# Set API URL
os.environ['KAMIYO_API_URL'] = 'https://api.kamiyo.ai'

from social.models import ExploitData, Platform
from social.analysis import ReportGenerator
from social.post_generator import PostGenerator

# Configuration
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
CHANNEL_ID = int(os.getenv('DISCORD_CHANNEL_ID', '1335910966205878393'))

print("=" * 80)
print("🚀 AUTONOMOUS GROWTH ENGINE - FULL TEST")
print("=" * 80)
print()

# Step 1: Fetch real exploit
print("📡 Step 1: Fetching exploit from API...")
response = requests.get('https://api.kamiyo.ai/exploits?min_amount=1000000&page_size=1')
data = response.json()['data'][0]
print(f"✅ Got: {data['protocol']} - ${data['amount_usd']:,.0f} on {data['chain']}")
print()

# Step 2: Create exploit object
print("📝 Step 2: Creating exploit object...")
exploit = ExploitData(
    tx_hash=data['tx_hash'],
    protocol=data['protocol'],
    chain=data['chain'],
    loss_amount_usd=data['amount_usd'],
    exploit_type=data.get('category', 'Unknown'),
    timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
    description=data.get('description', 'Details under investigation'),
    source=data['source'],
    source_url=data.get('source_url', '')
)
print(f"✅ Exploit object created: {exploit.protocol}")
print()

# Step 3: Generate analysis
print("🧠 Step 3: Generating analysis report...")
report_gen = ReportGenerator()
report = report_gen.analyze_exploit(exploit)
print(f"✅ Report generated with severity: {report.impact.severity.indicator}")
print(f"   Executive summary: {len(report.executive_summary)} chars")
print(f"   Engagement hooks: {len(report.engagement_hooks)}")
print()

# Step 4: Generate post
print("✍️  Step 4: Creating Discord-optimized content...")
post_gen = PostGenerator()
post = post_gen.generate_post(exploit, platforms=[Platform.DISCORD])
discord_content = post.content[Platform.DISCORD]
print(f"✅ Discord post created: {len(discord_content)} chars")
print()

# Preview
print("-" * 80)
print("PREVIEW OF DISCORD POST:")
print("-" * 80)
print(discord_content[:300] + "...")
print("-" * 80)
print()

# Step 5: Post to Discord
print("📤 Step 5: Posting to Discord...")

# Create Discord embed
def create_discord_embed(exploit, report):
    embed = discord.Embed(
        title=f"{report.impact.severity.indicator} {exploit.protocol} Exploit",
        description=report.executive_summary[:300],
        color=discord.Color.red(),
        timestamp=exploit.timestamp
    )

    embed.add_field(
        name="💰 Loss Amount",
        value=exploit.formatted_amount,
        inline=True
    )

    embed.add_field(
        name="⛓️ Blockchain",
        value=exploit.chain,
        inline=True
    )

    embed.add_field(
        name="🔥 Exploit Type",
        value=exploit.exploit_type,
        inline=True
    )

    if report.engagement_hooks:
        embed.add_field(
            name="⚡ Key Insight",
            value=report.engagement_hooks[0],
            inline=False
        )

    if exploit.source_url:
        embed.add_field(
            name="🔗 Source",
            value=f"[{exploit.source}]({exploit.source_url})",
            inline=False
        )

    embed.set_footer(text="Kamiyo.ai - Real-time Exploit Intelligence | kamiyo.ai")

    return embed

# Send via bot
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"✅ Bot connected as {client.user}")

    channel = client.get_channel(CHANNEL_ID)
    if not channel:
        print(f"❌ Channel {CHANNEL_ID} not found")
        await client.close()
        return

    try:
        embed = create_discord_embed(exploit, report)
        await channel.send(embed=embed)
        print("✅ Posted to Discord successfully!")
        print(f"   Channel: #{channel.name if hasattr(channel, 'name') else CHANNEL_ID}")
        print()
        print("=" * 80)
        print("🎉 AUTONOMOUS GROWTH ENGINE TEST COMPLETE!")
        print("=" * 80)
        print()
        print("Next steps:")
        print("  1. Check your Discord channel for the post")
        print("  2. Deploy to Render for 24/7 operation")
        print("  3. Add more platforms (Telegram, Twitter, Reddit)")
        print("  4. Watch organic traffic grow!")
        print()
    except Exception as e:
        print(f"❌ Error posting: {e}")

    await client.close()

if BOT_TOKEN == 'YOUR_BOT_TOKEN_HERE':
    print("❌ Set DISCORD_BOT_TOKEN environment variable")
else:
    client.run(BOT_TOKEN)
