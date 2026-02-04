#!/bin/bash
# KAMIYO Agent Factory - Autonomous Forum Engagement Loop
# Runs continuously, cycling through different engagement strategies

cd "$(dirname "$0")"

LOG_FILE="autonomous.log"
INTERVAL_MINUTES=15

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

run_task() {
  local task="$1"
  log "Running: $task"
  npm start -- "$task" 2>&1 | tee -a "$LOG_FILE"
  log "Completed task"
}

# Task rotation - different strategies each cycle
TASKS=(
  "Check for new replies on KAMIYO posts and respond thoughtfully to each one. Be helpful and technical."

  "Search forum for projects mentioning: escrow, payments, reputation, trust, verification. Comment on 3 promising ones offering KAMIYO integration."

  "Find the hottest forum posts from the last 24 hours. Add valuable technical comments to 2-3 discussions where KAMIYO expertise is relevant."

  "Search for projects struggling with disputes, quality verification, or agent trust. Offer specific solutions using KAMIYO infrastructure."

  "Look for team formation posts. Offer KAMIYO as infrastructure partner - we provide escrow, reputation, and dispute resolution."

  "Find new projects posted today. Welcome them to the hackathon and offer integration help if their project could use trust infrastructure."

  "Search for posts about Solana, mainnet, production, or deployment. Share KAMIYO's experience running 7 programs on mainnet."

  "Check the leaderboard, find top 10 projects, and comment on any we haven't engaged with yet. Offer collaboration."

  "Search for posts about security, audits, or code review. Offer to review escrow/payment code since that's our expertise."

  "Create a new forum post sharing a technical insight about agent infrastructure - escrow patterns, ZK reputation, or oracle design."
)

log "=========================================="
log "KAMIYO Autonomous Engagement Loop Started"
log "Interval: ${INTERVAL_MINUTES} minutes"
log "=========================================="

cycle=0
while true; do
  task_index=$((cycle % ${#TASKS[@]}))
  task="${TASKS[$task_index]}"

  log ""
  log "--- Cycle $((cycle + 1)) | Task $((task_index + 1))/${#TASKS[@]} ---"

  run_task "$task"

  cycle=$((cycle + 1))

  log "Sleeping ${INTERVAL_MINUTES} minutes until next cycle..."
  sleep $((INTERVAL_MINUTES * 60))
done
