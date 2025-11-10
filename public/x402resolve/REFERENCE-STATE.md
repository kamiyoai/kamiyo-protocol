# x402Resolve Demo - Reference State

## CRITICAL: Golden Commit Reference

**CANONICAL STATE: Commit `a052823d`**

This is the DEFINITIVE correct state of the x402resolve demo. All future changes should be based on this commit.

## How to Restore to Correct State

If the demo has been broken, restore from this commit:

```bash
cd /path/to/kamiyo
git show a052823d:public/x402resolve/index.html > public/x402resolve/index.html
git add public/x402resolve/index.html
git commit -m "Restore to canonical state from a052823d"
git push
```

## Verification Checklist

Run these commands to verify the correct state:

```bash
# 1. Check program ID (should return 1 match)
grep -c "E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n" public/x402resolve/index.html

# 2. Check font (should return 2 matches)
grep -c "Atkinson Hyperlegible Mono" public/x402resolve/index.html

# 3. Check phantom logo exists (should return 4 matches)
grep -c "phantom-logo.svg" public/x402resolve/index.html

# 4. Check animated dots on recent transactions (should return 1 match)
grep -c "Loading recent program transactions<span class=\"animated-dots\"></span>" public/x402resolve/index.html

# 5. Check NO old program ID (should return 0)
grep -c "AFmBBw7\|D9adezZ12cosX3GG2jK6PpbwMFLHzcCYVpcPCFcaciYP" public/x402resolve/index.html
```

## Expected State

### Program ID
- **MUST BE**: `E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n`
- Location: Line ~1832 in `checkProgramStatus()` function
- Explorer links: All should reference this ID

### Font
- **MUST BE**: `Atkinson Hyperlegible Mono`
- CSS variables (lines ~104-105):
  ```css
  --font-family-primary: 'Atkinson Hyperlegible Mono', monospace;
  --font-family-mono: 'Atkinson Hyperlegible Mono', monospace;
  ```

### Wallet Button
- **MUST HAVE**: Custom phantom logo SVG
- Path: `./media/phantom-logo.svg` or `/x402resolve/media/phantom-logo.svg`
- Initial HTML (line ~1347):
  ```html
  <img src="/x402resolve/media/phantom-logo.svg" alt="Phantom">
  CONNECT WALLET
  ```

### Animated Dots
- **MUST HAVE**: `<span class="animated-dots"></span>` on "Loading recent program transactions"
- Location: Line ~1482
- Full text: `Loading recent program transactions<span class="animated-dots"></span>`

### Link Hover Effect
- **MUST BE REMOVED**: No magenta hover color
- CSS (line ~482-484):
  ```css
  a:hover {
      /* Removed magenta hover color */
  }
  ```

### Cursor
- **MUST HAVE**: Custom cursor (`cursor: none;` on body)
- All custom cursor JavaScript and CSS should be present

## Quick Verification Script

Create and run this script to verify everything:

```bash
#!/bin/bash
echo "Verifying x402resolve demo state..."

cd /path/to/kamiyo/public/x402resolve

# Check all requirements
PROGRAM_ID=$(grep -c "E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n" index.html)
FONT=$(grep -c "Atkinson Hyperlegible Mono" index.html)
PHANTOM=$(grep -c "phantom-logo.svg" index.html)
ANIMATED=$(grep -c "Loading recent program transactions<span class=\"animated-dots\"></span>" index.html)
OLD_ID=$(grep -c "AFmBBw7\|D9adezZ12cosX3GG2jK6PpbwMFLHzcCYVpcPCFcaciYP" index.html)

echo "Program ID (expect 1): $PROGRAM_ID"
echo "Font (expect 2): $FONT"
echo "Phantom logo (expect 4): $PHANTOM"
echo "Animated dots (expect 1): $ANIMATED"
echo "Old IDs (expect 0): $OLD_ID"

if [ "$PROGRAM_ID" -eq 1 ] && [ "$FONT" -eq 2 ] && [ "$PHANTOM" -eq 4 ] && [ "$ANIMATED" -eq 1 ] && [ "$OLD_ID" -eq 0 ]; then
    echo "✓ ALL CHECKS PASSED - Demo is in correct state"
    exit 0
else
    echo "✗ CHECKS FAILED - Demo needs restoration"
    echo "Run: git show a052823d:public/x402resolve/index.html > index.html"
    exit 1
fi
```

## Repository Structure

**SINGLE SOURCE OF TRUTH:**
- Repository: `kamiyo-ai/kamiyo`
- Path: `/public/x402resolve/index.html`
- Deployed to: `https://x402resolve.kamiyo.ai/`

**DEPRECATED (DO NOT USE):**
- Repository: `kamiyo-ai/x402resolve`
- Path: `/docs/index.html`
- Status: Obsolete, contains incorrect configuration

## What Went Wrong Before

1. **Commit 92b8ba21** - Accidentally reverted font to JetBrains Mono and removed animated dots CSS
2. **Multiple manual edits** - Tried to fix issues piecemeal without restoring from known good state
3. **Wrong source** - Confused between deprecated `/docs` folder and canonical `/public/x402resolve`

## Prevention Strategy

1. **Always check this file first** before making changes
2. **Never copy** from deprecated `/docs` folder
3. **Always verify** state after making changes using checklist above
4. **Reference commit a052823d** as the golden source
5. **Run verification script** before and after changes

## Last Verified

- Date: 2025-11-11
- Commit: a052823d
- Verified by: Claude Code
- Live site check: ✓ https://x402resolve.kamiyo.ai/ confirmed correct

## Contact

If this file becomes outdated or you need to update the reference commit:
1. Verify the new state is 100% correct
2. Update the commit hash at the top of this file
3. Update the "Last Verified" section
4. Update verification commands if needed
