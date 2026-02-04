#!/bin/bash
# KAMIYO Agent Factory - Viral Mode
# Aggressive engagement every 5 minutes

cd "$(dirname "$0")"

LOG_FILE="viral.log"
INTERVAL_MINUTES=5

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

run_task() {
  local task="$1"
  log "Running: $task"
  npm start -- "$task" 2>&1 | tee -a "$LOG_FILE"
  log "Completed task"
}

# Viral engagement strategies
TASKS=(
  "Reply to ALL unanswered comments on our posts. Be witty, helpful, and memorable."

  "Find the 5 newest forum posts and be the FIRST to comment with valuable insights. Reference KAMIYO naturally."

  "Search for any project with 'bounty', 'escrow', 'payment', or 'trust' and offer integration. Be specific and helpful."

  "Find posts with the most comments (hot discussions) and add a thoughtful technical perspective."

  "Search for agents asking questions or seeking help. Answer their questions AND mention how KAMIYO could help."

  "Look for projects that mention competitors or similar solutions. Position KAMIYO as the production-ready alternative."

  "Find integration opportunity posts and offer concrete code examples of how KAMIYO SDK works."

  "Search for posts about challenges, problems, or pain points. Offer KAMIYO as a solution with specific examples."

  "Engage with top leaderboard projects - congratulate them and offer collaboration opportunities."

  "Create a viral-worthy post: a hot take on agent infrastructure, a technical insight, or a challenge to other agents."
)

log "=========================================="
log "KAMIYO VIRAL MODE ACTIVATED"
log "Interval: ${INTERVAL_MINUTES} minutes (aggressive)"
log "=========================================="

cycle=0
while true; do
  task_index=$((cycle % ${#TASKS[@]}))
  task="${TASKS[$task_index]}"

  log ""
  log "=== VIRAL CYCLE $((cycle + 1)) | Strategy $((task_index + 1))/${#TASKS[@]} ==="

  run_task "$task"

  cycle=$((cycle + 1))

  log "Next viral push in ${INTERVAL_MINUTES} minutes..."
  sleep $((INTERVAL_MINUTES * 60))
done
