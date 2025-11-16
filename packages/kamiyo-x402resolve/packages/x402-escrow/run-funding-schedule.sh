#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNDING_SCRIPT="$SCRIPT_DIR/fund-devnet.sh"
LOG_FILE="$SCRIPT_DIR/funding.log"
TARGET_WALLET="8j59xt1ofQak6j9vAGTU5cP4ftxrqCmJJZUJSmiVJK2q"

# Run 12 times over 24 hours (every 2 hours)
RUNS=12
INTERVAL_SECONDS=$((2 * 60 * 60))

echo "Starting funding schedule: $RUNS runs over 24 hours" | tee -a "$LOG_FILE"
echo "Target wallet: $TARGET_WALLET" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "----------------------------------------" | tee -a "$LOG_FILE"

for run in $(seq 1 $RUNS); do
    echo "" | tee -a "$LOG_FILE"
    echo "=== RUN $run of $RUNS ===" | tee -a "$LOG_FILE"
    echo "Time: $(date)" | tee -a "$LOG_FILE"

    # Check current balance
    BALANCE_BEFORE=$(solana balance "$TARGET_WALLET" --url devnet 2>/dev/null | awk '{print $1}')
    echo "Balance before: $BALANCE_BEFORE SOL" | tee -a "$LOG_FILE"

    # Run funding script
    bash "$FUNDING_SCRIPT" 2>&1 | tee -a "$LOG_FILE"

    # Check new balance
    BALANCE_AFTER=$(solana balance "$TARGET_WALLET" --url devnet 2>/dev/null | awk '{print $1}')
    echo "Balance after: $BALANCE_AFTER SOL" | tee -a "$LOG_FILE"

    # Calculate gain
    if [ ! -z "$BALANCE_BEFORE" ] && [ ! -z "$BALANCE_AFTER" ]; then
        GAIN=$(echo "$BALANCE_AFTER - $BALANCE_BEFORE" | bc)
        echo "Gained this run: $GAIN SOL" | tee -a "$LOG_FILE"
    fi

    # Wait until next run (unless this is the last run)
    if [ $run -lt $RUNS ]; then
        echo "Waiting 2 hours until next run..." | tee -a "$LOG_FILE"
        echo "Next run at: $(date -d '+2 hours' 2>/dev/null || date -v+2H 2>/dev/null)" | tee -a "$LOG_FILE"
        sleep $INTERVAL_SECONDS
    fi
done

echo "" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "Funding schedule complete!" | tee -a "$LOG_FILE"
echo "Finished at: $(date)" | tee -a "$LOG_FILE"
echo "Final balance: $(solana balance $TARGET_WALLET --url devnet)" | tee -a "$LOG_FILE"
