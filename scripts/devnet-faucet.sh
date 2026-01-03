#!/bin/bash

# Devnet SOL Faucet Script
# Requests 2 SOL every 12 hours to accumulate funds for deployment
# Run with: nohup ./scripts/devnet-faucet.sh &

WALLET=$(solana address 2>/dev/null)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/faucet.log"
INTERVAL=$((12 * 60 * 60))  # 12 hours in seconds

echo "Starting devnet faucet daemon for wallet: $WALLET" | tee -a "$LOG_FILE"
echo "Requesting 2 SOL every 12 hours" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "---" | tee -a "$LOG_FILE"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')

    echo "[$TIMESTAMP] Current balance: $BALANCE SOL" | tee -a "$LOG_FILE"
    echo "[$TIMESTAMP] Requesting airdrop..." | tee -a "$LOG_FILE"

    # Request airdrop
    RESULT=$(solana airdrop 2 2>&1)

    if echo "$RESULT" | grep -q "SOL"; then
        NEW_BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
        echo "[$TIMESTAMP] Success! New balance: $NEW_BALANCE SOL" | tee -a "$LOG_FILE"
    else
        echo "[$TIMESTAMP] Airdrop failed: $RESULT" | tee -a "$LOG_FILE"
        # Try smaller amount if rate limited
        sleep 5
        RESULT=$(solana airdrop 1 2>&1)
        if echo "$RESULT" | grep -q "SOL"; then
            NEW_BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
            echo "[$TIMESTAMP] Fallback success (1 SOL)! New balance: $NEW_BALANCE SOL" | tee -a "$LOG_FILE"
        fi
    fi

    echo "[$TIMESTAMP] Sleeping for 12 hours..." | tee -a "$LOG_FILE"
    echo "---" | tee -a "$LOG_FILE"

    sleep $INTERVAL
done
