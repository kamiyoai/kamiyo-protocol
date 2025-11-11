# x402Resolve Demo Website - Critical Configuration Checklist

## Single Source of Truth

**IMPORTANT**: The ONLY maintained version of the demo website is in:
```
kamiyo-ai/kamiyo repository
Location: /public/x402resolve/index.html
Deployed to: https://x402resolve.kamiyo.ai/
```

Any other copies (such as in kamiyo-ai/x402resolve/docs/) are DEPRECATED and must NOT be edited.

## Critical Configuration Items

Before any deployment or commit, verify ALL of these items are correct:

### 1. Font Configuration
**MUST use Atkinson Hyperlegible Mono**

Required in HTML head:
```html
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;700&display=swap" rel="stylesheet">
```

Required in CSS variables:
```css
--font-family-primary: 'Atkinson Hyperlegible Mono', monospace;
--font-family-mono: 'Atkinson Hyperlegible Mono', monospace;
```

**DO NOT use**: JetBrains Mono, Monaco, or any other font family

### 2. Program ID
**MUST use the correct deployed program ID**

```javascript
const programId = new solanaWeb3.PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
```

All Solana Explorer links must use:
```
https://explorer.solana.com/address/E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n?cluster=devnet
```

**DO NOT use**: AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR or any other program ID

### 3. Wallet Connect Button
**MUST NOT display wallet provider logos**

Correct HTML (initial state):
```html
<button id="walletBtn" class="wallet-connect-btn" onclick="connectWallet()">
    Connect Wallet
</button>
```

Correct JavaScript (disconnected state):
```javascript
btn.innerHTML = 'Connect Wallet';
```

Correct JavaScript (connected state):
```javascript
btn.innerHTML = `✓ ${shortAddress}`;
```

**DO NOT use**:
- `<img src="./media/Phantom-Icon_Transparent_White.svg">`
- Any wallet provider logos (Phantom, Solflare, etc.)

### 4. SDK Package Name
**MUST use @kamiyo/x402-sdk**

SDK Integration tab TypeScript code example:
```javascript
import { EscrowClient, KamiyoClient } from '@kamiyo/x402-sdk';
```

**DO NOT use**: @x402resolve/sdk or any other package name

### 5. Animated Dots for Loading Messages
**MUST include animated dots CSS and markup**

Required CSS (after @keyframes pulse):
```css
.animated-dots {
    display: inline-block;
    width: 1.5em;
    text-align: left;
}

.animated-dots::after {
    content: '';
    animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
    0%, 20% { content: '\00a0\00a0\00a0'; }
    40% { content: '.\00a0\00a0'; }
    60% { content: '..\00a0'; }
    80%, 100% { content: '...'; }
}
```

Required markup for all loading messages:
```html
<!-- Network status -->
<span id="programStatus">Program: Loading<span class="animated-dots"></span></span>
<span id="oracleStatus">Oracle: Checking<span class="animated-dots"></span></span>
<span id="networkStatus">Network: Connecting<span class="animated-dots"></span></span>

<!-- Recent oracle transactions -->
Loading recent Switchboard oracle transactions<span class="animated-dots"></span>

<!-- Recent transactions in Live Analytics -->
Loading recent program transactions<span class="animated-dots"></span>
```

## Pre-Deployment Checklist

Before pushing to production or main branch, verify:

- [ ] Font is Atkinson Hyperlegible Mono (NOT JetBrains Mono)
- [ ] Program ID is E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n
- [ ] No wallet logos in Connect Wallet button
- [ ] SDK package name is @kamiyo/x402-sdk (NOT @x402resolve/sdk)
- [ ] Animated dots CSS exists in style section
- [ ] All loading messages have `<span class="animated-dots"></span>`
- [ ] Build meta comment includes current date and "All Fixes Applied"

## Quick Verification Commands

From the kamiyo repository root:

```bash
# Check font
grep -n "Atkinson Hyperlegible Mono" public/x402resolve/index.html

# Check program ID (should return 3 matches)
grep -c "E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n" public/x402resolve/index.html

# Check for old program ID (should return 0 matches)
grep -c "AFmBBw7" public/x402resolve/index.html

# Check SDK package name (should return 1+ matches)
grep -c "@kamiyo/x402-sdk" public/x402resolve/index.html

# Check for old SDK package name (should return 0 matches)
grep -c "@x402resolve/sdk" public/x402resolve/index.html

# Check animated dots CSS exists
grep -n "@keyframes dots" public/x402resolve/index.html

# Check for Phantom logo (should only find references in JS detection code, NOT in innerHTML assignments)
grep -n "Phantom-Icon" public/x402resolve/index.html
```

## Build Metadata

The HTML file includes a build comment in the head section:
```html
<!-- Build: YYYY-MM-DDTHH:MM:SSZ - Atkinson Font, Animated Dots, All Fixes Applied -->
```

Update this timestamp on every deployment to track when changes were made.

## Deployment Process

1. Make changes to `/public/x402resolve/index.html` in kamiyo-ai/kamiyo repository
2. Run verification commands above
3. Update build metadata comment with current timestamp
4. Commit with descriptive message
5. Push to main branch
6. Verify deployment at https://x402resolve.kamiyo.ai/
7. Test in browser:
   - Font should be Atkinson Hyperlegible Mono
   - Loading dots should animate
   - Wallet button should NOT show Phantom logo
   - Program transactions link should go to correct address

## Common Mistakes to Avoid

1. **DO NOT** copy files from x402resolve/docs/ to kamiyo/public/x402resolve/
   - The docs/ folder is deprecated and contains old, incorrect configuration

2. **DO NOT** change the font to JetBrains Mono
   - This was a temporary change that was later reverted

3. **DO NOT** add wallet provider logos to the Connect Wallet button
   - The button should be generic and work with any Solana wallet

4. **DO NOT** remove animated dots CSS or markup
   - These provide important visual feedback for loading states

5. **DO NOT** use old program IDs
   - Always use E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n

## Troubleshooting

If the deployed site shows incorrect configuration:

1. Verify you edited the correct file: `kamiyo-ai/kamiyo/public/x402resolve/index.html`
2. Check the build metadata comment to see when it was last updated
3. Run verification commands to confirm all fixes are present
4. Check git history to see if changes were accidentally reverted
5. If needed, restore from this checklist's reference implementations

## Contact

If you find configuration issues or need to make changes, refer to this document first.
Last updated: 2025-11-11
