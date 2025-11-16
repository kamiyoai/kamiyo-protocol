#!/bin/bash

TARGET_WALLET="8j59xt1ofQak6j9vAGTU5cP4ftxrqCmJJZUJSmiVJK2q"
NUM_WALLETS=10
AIRDROP_AMOUNT=1
DELAY_BETWEEN_AIRDROPS=45
WALLET_DIR="/tmp/devnet-wallets"

mkdir -p "$WALLET_DIR"

echo "Creating $NUM_WALLETS temporary wallets..."

# Create wallets
for i in $(seq 1 $NUM_WALLETS); do
    WALLET_PATH="$WALLET_DIR/wallet-$i.json"
    echo "Creating wallet $i..."
    solana-keygen new --outfile "$WALLET_PATH" --no-bip39-passphrase --force > /dev/null 2>&1
    WALLET_ADDR=$(solana-keygen pubkey "$WALLET_PATH")
    echo "  Wallet $i: $WALLET_ADDR"
done

echo ""
echo "Requesting airdrops (this will take a few minutes)..."

# Request airdrops with delays
for i in $(seq 1 $NUM_WALLETS); do
    WALLET_PATH="$WALLET_DIR/wallet-$i.json"
    WALLET_ADDR=$(solana-keygen pubkey "$WALLET_PATH")

    echo "Airdrop to wallet $i ($WALLET_ADDR)..."
    solana airdrop $AIRDROP_AMOUNT "$WALLET_ADDR" --url devnet 2>&1 | grep -E "(Signature|Error|SOL)"

    if [ $i -lt $NUM_WALLETS ]; then
        echo "Waiting $DELAY_BETWEEN_AIRDROPS seconds before next airdrop..."
        sleep $DELAY_BETWEEN_AIRDROPS
    fi
done

echo ""
echo "Waiting 10 seconds for transactions to confirm..."
sleep 10

echo ""
echo "Consolidating funds to target wallet..."

# Transfer all funds to target
TOTAL_RECEIVED=0
for i in $(seq 1 $NUM_WALLETS); do
    WALLET_PATH="$WALLET_DIR/wallet-$i.json"
    WALLET_ADDR=$(solana-keygen pubkey "$WALLET_PATH")

    BALANCE=$(solana balance "$WALLET_ADDR" --url devnet 2>/dev/null | awk '{print $1}')

    if [ -z "$BALANCE" ] || [ "$BALANCE" == "0" ]; then
        echo "Wallet $i: No balance to transfer"
        continue
    fi

    echo "Wallet $i balance: $BALANCE SOL"

    # Calculate amount to send (keep 0.001 for rent)
    SEND_AMOUNT=$(echo "$BALANCE - 0.001" | bc)

    if (( $(echo "$SEND_AMOUNT > 0" | bc -l) )); then
        echo "  Transferring $SEND_AMOUNT SOL to target..."
        solana transfer "$TARGET_WALLET" "$SEND_AMOUNT" \
            --from "$WALLET_PATH" \
            --url devnet \
            --allow-unfunded-recipient 2>&1 | grep -E "(Signature|Error)"

        TOTAL_RECEIVED=$(echo "$TOTAL_RECEIVED + $SEND_AMOUNT" | bc)
    fi
done

echo ""
echo "Final balance on target wallet:"
solana balance "$TARGET_WALLET" --url devnet

echo ""
echo "Total received from airdrops: ~$TOTAL_RECEIVED SOL"
echo ""
echo "Cleaning up temporary wallets..."
rm -rf "$WALLET_DIR"
echo "Done!"
