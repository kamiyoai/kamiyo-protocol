#!/bin/bash
# Run Autonomous Growth Engine with Discord Bot
# Posts high-value exploits (>$1M) to Discord automatically

export KAMIYO_API_URL="https://api.kamiyo.ai"
export DISCORD_BOT_TOKEN="MTMzNjc5NDM1NzU0MTYzNDA1OA.GcntY9.iDpEBXLh71vwUu_hUor6fYUTU8On4n5340AuiA"
export DISCORD_CHANNEL_ID="1335910966205878393"
export SOCIAL_MIN_AMOUNT_USD="1000000"
export POLL_INTERVAL_SECONDS="300"  # Check every 5 minutes

echo "🚀 Starting Autonomous Growth Engine..."
echo "   API: $KAMIYO_API_URL"
echo "   Channel ID: $DISCORD_CHANNEL_ID"
echo "   Min Amount: \$$SOCIAL_MIN_AMOUNT_USD"
echo "   Poll Interval: ${POLL_INTERVAL_SECONDS}s"
echo ""

# Note: The current autonomous_growth_engine.py uses webhooks
# We need to adapt it to use the Discord bot instead
# For now, this is a placeholder

python3 test_full_social_post.py
