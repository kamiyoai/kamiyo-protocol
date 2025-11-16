#!/bin/bash

#==============================================================================
# Generate Solana Keypair Script
# Workaround for environments where solana-keygen is not available
#==============================================================================

set -e

KEYPAIR_PATH="${1:-$HOME/.config/solana/devnet.json}"

# Create directory if it doesn't exist
mkdir -p "$(dirname "$KEYPAIR_PATH")"

# Check if Anchor is available (it includes solana-keygen functionality)
if command -v anchor &> /dev/null; then
    echo "Using Anchor to generate keypair..."

    # Create a temporary Rust program to generate keypair
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"

    cat > Cargo.toml <<EOF
[package]
name = "keygen"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-sdk = "2.3"
serde_json = "1.0"
EOF

    mkdir -p src

    cat > src/main.rs <<'EOF'
use solana_sdk::signature::{Keypair, Signer};
use serde_json::json;
use std::fs::File;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let keypair = Keypair::new();
    let secret_bytes = keypair.to_bytes();

    // Format as JSON array (Solana keypair format)
    let json_data = json!(secret_bytes.to_vec());

    // Get output path from args or use default
    let args: Vec<String> = std::env::args().collect();
    let output_path = if args.len() > 1 {
        &args[1]
    } else {
        panic!("Output path required");
    };

    let mut file = File::create(output_path)?;
    file.write_all(json_data.to_string().as_bytes())?;

    println!("Generated keypair: {}", keypair.pubkey());
    println!("Saved to: {}", output_path);

    Ok(())
}
EOF

    cargo run --quiet -- "$KEYPAIR_PATH"

    # Clean up
    cd - > /dev/null
    rm -rf "$TEMP_DIR"

elif command -v solana-keygen &> /dev/null; then
    echo "Using solana-keygen..."
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase --force
else
    echo "ERROR: Neither Anchor nor solana-keygen is available"
    echo "Please install Solana CLI tools first"
    exit 1
fi

echo ""
echo "Keypair generated successfully!"
echo "Path: $KEYPAIR_PATH"
