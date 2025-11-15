# x402 Facilitators Registry - KAMIYO Integration

This folder contains the files needed to add KAMIYO to the x402 facilitators registry at https://facilitators.x402.watch/

## Files

- `kamiyo.ts` - KAMIYO facilitator definition (goes in `src/facilitators/`)
- `index.ts` - Updated facilitators index with KAMIYO export (replaces `src/facilitators/index.ts`)
- `all.ts` - Updated facilitators list with KAMIYO (replaces `src/lists/all.ts`)
- `kamiyo.png` - KAMIYO logo (upload to x402scan.com)

## How to Submit

### Option 1: Via GitHub UI (Recommended)

1. Go to your fork: https://github.com/kamiyo-ai/x402facilitators
2. Create a new branch called `add-kamiyo-facilitator`
3. Upload/edit the following files:
   - `src/facilitators/kamiyo.ts` (new file - copy from this folder)
   - `src/facilitators/index.ts` (edit - copy from this folder)
   - `src/lists/all.ts` (edit - copy from this folder)
4. Commit with message: "Add KAMIYO facilitator"
5. Create Pull Request to https://github.com/Swader/x402facilitators

### Option 2: Via Command Line

```bash
# Clone your fork
cd /tmp
git clone https://github.com/kamiyo-ai/x402facilitators.git
cd x402facilitators

# Create branch
git checkout -b add-kamiyo-facilitator

# Copy files from this folder
cp /Users/dennisgoslar/Projekter/kamiyo/x402-watch/kamiyo.ts src/facilitators/
cp /Users/dennisgoslar/Projekter/kamiyo/x402-watch/index.ts src/facilitators/
cp /Users/dennisgoslar/Projekter/kamiyo/x402-watch/all.ts src/lists/

# Commit and push
git add .
git config user.email "dev@kamiyo.ai"
git config user.name "KAMIYO"
git commit -m "Add KAMIYO facilitator

KAMIYO is a multi-chain payment verification facilitator supporting BASE, POLYGON, and SOLANA networks.

- Facilitator URL: https://kamiyo.ai/api/v1/x402
- Access Type: Gated (requires API key)
- Fee: 0%
- Discovery support: Yes
- Documentation: https://kamiyo.ai/docs"

git push origin add-kamiyo-facilitator
```

Then go to https://github.com/kamiyo-ai/x402facilitators and create a Pull Request.

## Logo Upload

The `kamiyo.png` file needs to be uploaded to x402scan.com. Contact the x402scan maintainers or submit it alongside the PR.

## KAMIYO Facilitator Details

- **ID**: kamiyo
- **Name**: KAMIYO
- **Facilitator URL**: https://kamiyo.ai/api/v1/x402
- **Documentation**: https://kamiyo.ai/docs
- **Brand Color**: #00D4AA
- **Access Type**: Gated (API key required)
- **Fee**: 0%
- **Discovery**: Enabled

### Supported Networks

**BASE**
- Address: `0x742d35cc6634c0532925a3b844bc9e7595f0bee4`
- Token: USDC

**POLYGON**
- Address: `0x742d35cc6634c0532925a3b844bc9e7595f0bee4`
- Token: USDC

**SOLANA**
- Address: `KAMiYo7XwXVQcFhkfhC4RHApURAcqRHF8tF9WoZHkYR`
- Token: USDC
