#!/bin/bash
# KAMIYO Vote Blitz - Run every 2-3 hours

cd /Users/dennisgoslar/Documents/Dennis/kamiyo-protocol/services/agent-factory

echo "=== KAMIYO Vote Blitz Starting at $(date) ==="

# 1. Respond to all comments on my posts
echo ">>> Responding to comments..."
pnpm start "Check ALL my forum posts for new comments. Respond to every single comment with helpful, specific replies. Build relationships."

# 2. Engage with new posts
echo ">>> Engaging with new posts..."
pnpm start "Get the 30 newest forum posts. Comment on at least 10 relevant ones with genuine technical help. Mention KAMIYO integration where appropriate."

# 3. Check and comment on top projects
echo ">>> Engaging top projects..."
pnpm start "Get top 20 leaderboard projects. For any I haven't commented on yet, leave a helpful comment offering integration support."

# 4. Search for opportunities
echo ">>> Finding integration opportunities..."
pnpm start "Search forum for 'help', 'need', 'looking for', 'stuck'. These are people with problems - offer solutions using KAMIYO infrastructure."

# 5. Status report
echo ">>> Getting status..."
pnpm start "Report: How many posts do I have? How many total comments on my posts? What's my approximate leaderboard position?"

echo "=== Blitz Complete at $(date) ==="
