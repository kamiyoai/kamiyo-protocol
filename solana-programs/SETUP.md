# Solana Development Environment Setup

## Quick Start

Run the automated setup script:
```bash
cd /Users/dennisgoslar/Projekter/kamiyo
bash scripts/setup_solana_dev.sh
```

## Verification

Verify your setup:
```bash
bash scripts/verify_solana_setup.sh
```

## Current Status

As of Phase 2, Week 1:

### Installed Tools

- **Rust 1.90.0** - Installed via rustup
- **Anchor CLI 0.31.1** - Solana smart contract framework
- **SPL Token CLI** - Token program utilities (installing via cargo)

### Pending Installation

- **Solana CLI** - Currently blocked by SSL connection issues to release.solana.com on macOS Catalina (Darwin 19.6.0)

## Solana CLI Installation Workaround

Due to SSL connectivity issues with the official Solana installer on older macOS versions, you have several options:

### Option 1: Install via Pre-compiled Binary (Recommended)

1. Download the latest release directly from GitHub:
```bash
# Create temp directory
mkdir -p /tmp/solana_install
cd /tmp/solana_install

# Download release (replace version as needed)
curl -L https://github.com/solana-labs/solana/releases/download/v1.18.20/solana-release-x86_64-apple-darwin.tar.bz2 -o solana-release.tar.bz2

# Extract
tar -xf solana-release.tar.bz2

# Move to local directory
mkdir -p ~/.local/share/solana
mv solana-release ~/.local/share/solana/install

# Add to PATH
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Verify
solana --version
```

### Option 2: Use Anchor's Built-in Tools

Anchor CLI includes many Solana utilities built-in:

```bash
# Generate keypair using our custom script
bash scripts/generate_solana_keypair.sh ~/.config/solana/devnet.json

# Configure Solana settings in Anchor.toml
# (Already configured in this workspace)
```

### Option 3: Use Docker (For Development)

```bash
# Pull Solana Docker image
docker pull solanalabs/solana:v1.18.20

# Create alias for solana commands
alias solana='docker run --rm -v ~/.config/solana:/root/.config/solana solanalabs/solana:v1.18.20 solana'

# Test
solana --version
```

### Option 4: Upgrade macOS (Long-term Solution)

The SSL issue is related to the outdated LibreSSL version in macOS Catalina (10.15). Consider upgrading to:
- macOS Big Sur (11.0+)
- macOS Monterey (12.0+)
- macOS Ventura (13.0+)
- macOS Sonoma (14.0+)

## Development Workflow Without Solana CLI

You can still develop and test Solana programs using Anchor:

```bash
# Build programs
anchor build

# Test programs (uses local validator)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Generate new keypairs (using our script)
bash scripts/generate_solana_keypair.sh <output_path>
```

## Directory Structure

```
solana-programs/
├── Anchor.toml              # Anchor workspace configuration
├── Cargo.toml               # Rust workspace configuration
├── programs/                # Solana programs (smart contracts)
│   ├── kamiyo-token/       # Token-2022 implementation
│   ├── kamiyo-staking/     # Staking program
│   ├── kamiyo-airdrop/     # Merkle airdrop
│   └── kamiyo-vesting/     # Linear vesting
├── tests/                   # Integration tests
├── migrations/              # Deployment scripts
└── target/                  # Build artifacts
```

## Configuration

### Devnet Setup

1. **Keypair**: Located at `~/.config/solana/devnet.json`
2. **RPC URL**: `https://api.devnet.solana.com`
3. **Commitment**: `confirmed` (balance between speed and finality)

### Environment Variables

Update your `.env` file with Solana configuration:
```bash
# Copy from example
cp .env.example .env

# Edit Solana section
nano .env
```

Required variables:
- `SOLANA_DEVNET_KEYPAIR_PATH` - Path to your devnet keypair
- `SOLANA_NETWORK` - Network to use (devnet/testnet/mainnet-beta)
- `SOLANA_RPC_URL` - RPC endpoint URL

## Getting Devnet SOL

### Method 1: Anchor Test (Recommended)
```bash
# Anchor automatically airdrops SOL when running tests
anchor test
```

### Method 2: Faucet Websites
Visit these faucets to request devnet SOL:
- https://faucet.solana.com
- https://solfaucet.com

### Method 3: Web3.js Script
```javascript
const solanaWeb3 = require('@solana/web3.js');

async function requestAirdrop() {
  const connection = new solanaWeb3.Connection(
    'https://api.devnet.solana.com',
    'confirmed'
  );

  const keypair = solanaWeb3.Keypair.fromSecretKey(
    new Uint8Array(require('~/.config/solana/devnet.json'))
  );

  const signature = await connection.requestAirdrop(
    keypair.publicKey,
    2 * solanaWeb3.LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(signature);
  console.log('Airdrop successful!');
}

requestAirdrop();
```

## Next Steps

1. **Build Programs**: `anchor build`
2. **Write Tests**: Create test files in `tests/`
3. **Deploy to Devnet**: `anchor deploy`
4. **Update Program IDs**: Copy deployed program IDs to `.env` and `Anchor.toml`

## Troubleshooting

### "solana-keygen: command not found"
Use our custom script instead:
```bash
bash scripts/generate_solana_keypair.sh ~/.config/solana/my-keypair.json
```

### "Error: Airdrop request failed"
Devnet airdrop is rate-limited. Wait a few minutes and try again, or use a faucet website.

### "Error: Cluster unreachable"
Check your network connection and RPC URL. Try alternative RPC providers:
- Alchemy: https://www.alchemy.com/solana
- Helius: https://www.helius.dev/
- QuickNode: https://www.quicknode.com/chains/sol

### "Error: Insufficient funds"
Request more devnet SOL using one of the airdrop methods above.

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Token-2022 Guide](https://spl.solana.com/token-2022)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Stack Exchange](https://solana.stackexchange.com/)

## Support

For issues specific to KAMIYO development:
1. Check this setup guide
2. Review `scripts/verify_solana_setup.sh` output
3. Consult Phase 2 documentation
4. Contact the development team
