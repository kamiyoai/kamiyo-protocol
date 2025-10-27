# Fix Claude AI Deep Dive Thread Generation

## 🔍 Issue Identified

Claude AI-enhanced deep dive threads are **not being generated** for $1M+ exploits.

**Current Output:**
```
HyperVault on Hyperliquid L1 suffered a Drain Vaults attack resulting in $3,600,000 in losses.

Key Insight:
Drain Vaults attacks trend: ➡️ STABLE 0.0%
```

**Expected Output:**
A 5-7 tweet thread with:
- Technical analysis
- Timeline breakdown
- Historical context
- Recovery status
- Source attribution

## 🔧 Root Cause

**ANTHROPIC_API_KEY is missing from environment variables.**

Without this key, the ClaudeEnhancer falls back to the basic template thread:

```python
# In claude_enhancer.py:
if not api_key:
    logger.warning("No ANTHROPIC_API_KEY found. Claude enhancement disabled.")
    self.client = None  # ❌ This causes fallback to basic threads
```

## ✅ Solution

### Step 1: Get Your Anthropic API Key

1. Go to: https://console.anthropic.com/
2. Sign in (or create account)
3. Navigate to: **API Keys**
4. Click: **Create Key**
5. Copy the key (starts with `sk-ant-api03-...`)

### Step 2: Add to Local Environment

Add to `/Users/dennisgoslar/Projekter/kamiyo/website/.env`:

```bash
# Claude AI for Deep Dive Analysis
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_ACTUAL_KEY_HERE
```

### Step 3: Add to Render Production

1. Go to: **Render Dashboard** → **kamiyo-social-watcher** service
2. Click: **Environment**
3. Add new variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-YOUR_ACTUAL_KEY_HERE`
4. Click: **Save**
5. Render will automatically redeploy

### Step 4: Verify Installation

Check if the `anthropic` library is installed:

```bash
pip list | grep anthropic
```

If not installed:

```bash
pip install anthropic
```

Add to `requirements.txt` if missing:

```bash
anthropic>=0.34.0
```

## 📊 How It Works

### Before (No API Key):
```
claude_enhancer.client = None
↓
Falls back to _generate_basic_thread()
↓
Basic 2-tweet template:
- Tweet 1: Alert
- Tweet 2: "Key Insight: trend" (not engaging)
```

### After (With API Key):
```
claude_enhancer.client = anthropic.Anthropic(api_key)
↓
generate_twitter_thread() called
↓
Claude AI generates 5-7 tweet thread:
- Tweet 1: Alert with context
- Tweet 2: Technical breakdown
- Tweet 3: Timeline
- Tweet 4: Impact analysis
- Tweet 5: Recovery status
- Tweet 6: Historical context
- Tweet 7: Source + CTA
```

## 🧪 Testing

### Test Locally

Run the deep dive test script:

```bash
cd /Users/dennisgoslar/Projekter/kamiyo/website
python social/test_deep_dive.py
```

Expected output:
```
✅ Claude AI connected
Model: claude-3-5-sonnet-20241022

Generating Claude AI-enhanced Twitter thread
Generated 6-tweet thread with Claude
```

### Test in Production

After adding API key to Render:

1. Wait for new $1M+ exploit
2. Check Twitter @KamiyoAI
3. Should see full thread instead of 2-tweet alert

## 📝 Configuration Details

### Current Settings

**Threshold:** $1,000,000 USD
- Set in render.yaml: `DEEP_DIVE_THRESHOLD_USD=1000000`
- Only exploits >= $1M get Claude AI enhancement

**Model:** claude-3-5-sonnet-20241022
- Latest Sonnet model
- Defined in `social/analysis/claude_enhancer.py:54`

**Thread Requirements:**
- 5-7 tweets
- Each ≤280 characters
- NO emojis (per brand guidelines)
- Professional, analytical tone
- Always credit source
- End with "Detected by KAMIYO Intelligence Platform"

### Prompt Template

The Claude enhancer uses this prompt structure:

```python
f"""Create an engaging Twitter thread about this confirmed blockchain exploit.

EXPLOIT DATA:
Protocol: {protocol}
Chain: {chain}
Loss: ${amount:,.0f}
Type: {exploit_type}

REQUIREMENTS:
1. Create a 5-7 tweet thread
2. Each tweet MUST be ≤280 characters
3. ABSOLUTELY NO EMOJIS
4. Professional, analytical, data-driven tone
5. Credit source in final tweet
...
"""
```

## 🚨 Common Issues

### Issue: "anthropic library not installed"

**Fix:**
```bash
pip install anthropic
```

### Issue: "Invalid API key"

**Fix:**
- Verify key starts with `sk-ant-api03-`
- Check for typos
- Regenerate key in Anthropic Console

### Issue: "Rate limit exceeded"

**Fix:**
- Anthropic has usage limits per tier
- Check: https://console.anthropic.com/settings/limits
- Upgrade plan if needed

### Issue: Thread still basic after adding key

**Fix:**
1. Restart the watcher service on Render
2. Check Render logs for "Claude AI connected"
3. Verify DEEP_DIVE_THRESHOLD_USD is set correctly
4. Ensure exploit is >= $1M

## 📈 Expected Improvement

### Before (Basic Template):
- 2 tweets
- Generic "Key Insight: trend" message
- Low engagement
- No technical depth

### After (Claude AI):
- 5-7 tweets
- Technical analysis
- Timeline breakdown
- Historical context
- Recovery information
- Source attribution
- **Much higher engagement**

## ✅ Checklist

- [ ] Get API key from https://console.anthropic.com/
- [ ] Add `ANTHROPIC_API_KEY` to local `.env`
- [ ] Add `ANTHROPIC_API_KEY` to Render environment (kamiyo-social-watcher)
- [ ] Verify `anthropic` in requirements.txt
- [ ] Test locally with `python social/test_deep_dive.py`
- [ ] Wait for Render redeploy
- [ ] Monitor next $1M+ exploit post
- [ ] Verify full thread on Twitter

---

**Cost Note:** Claude API calls cost money. Monitor usage at https://console.anthropic.com/settings/usage

**Estimated cost:** $0.003 per thread (very low)
