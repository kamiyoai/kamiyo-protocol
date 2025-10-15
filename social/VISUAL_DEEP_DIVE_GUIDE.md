# Visual Deep Dive Analysis Guide

## Overview

The KAMIYO deep dive analysis system now automatically generates **branded visualizations** alongside Claude AI-enhanced text content for high-impact exploits.

## What Gets Generated

For significant exploits ($1M+ losses), the system automatically creates:

### 1. Text Content (Claude AI Enhanced)
- **Executive Summary**: Conversational, engaging summary (2-3 sentences)
- **Twitter Thread**: 4-6 tweets optimized for engagement
- **Reddit Post**: Full markdown post (1000-3000 words)
- **Discord Embed**: Rich embed with fields

### 2. Visual Content (KAMIYO Branded)
- **Exploit Card**: 1200x675 social media card with:
  - Severity indicator (color-coded: 🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🟢 LOW)
  - Protocol name and loss amount
  - Chain and attack type
  - KAMIYO branding

- **Timeline Chart**: Visual timeline showing:
  - Attack execution time
  - Detection time
  - Key events (up to 5)
  - KAMIYO branded

- **Historical Chart**: Bar chart comparing:
  - Similar attacks (same type)
  - Loss amounts
  - Historical context

## How It Works

### Automatic Trigger

Deep dive analysis with visualizations is triggered when:

```python
# CRITICAL severity ($10M+)
exploit.loss_amount_usd >= 10_000_000

# HIGH severity ($1M+)
exploit.loss_amount_usd >= 1_000_000

# High-profile protocol (any amount)
exploit.protocol in ['Uniswap', 'Curve', 'Aave', 'Compound', ...]

# Novel attack type
exploit.exploit_type in ['Zero-Day', 'MEV', 'Bridge Exploit', ...]

# MEDIUM + interesting chain
exploit.loss_amount_usd >= 100_000 AND exploit.chain in ['Arbitrum', 'Optimism', ...]
```

### Processing Pipeline

```
1. Exploit Detected
   ↓
2. Significance Check (should_post_deep_dive)
   ↓
3. Generate Comprehensive Report (ReportGenerator)
   ↓
4. Generate Visualizations (VisualizationGenerator)
   │  ├─ Exploit Card (always)
   │  ├─ Timeline Chart (if timeline exists)
   │  └─ Historical Chart (if context exists)
   ↓
5. Enhance with Claude AI (ClaudeEnhancer)
   │  ├─ Executive Summary
   │  └─ Twitter Thread
   ↓
6. Format for Platforms (ReportFormatter)
   ↓
7. Save Draft (with visualization paths)
   ↓
8. Post (if auto_post enabled)
```

## Usage

### Basic Usage (Draft Mode)

```python
from social.automated_deep_dive_poster import AutomatedDeepDivePoster
from social.models import ExploitData
from datetime import datetime

# Initialize in draft mode (safe for testing)
poster = AutomatedDeepDivePoster(
    use_claude=True,      # Enable Claude AI
    auto_post=False       # Draft mode - won't post
)

# Process exploit
exploit = ExploitData(
    tx_hash="0xabc123...",
    protocol="Curve Finance",
    chain="Ethereum",
    loss_amount_usd=15_000_000,
    exploit_type="Reentrancy",
    timestamp=datetime.utcnow(),
    description="Reentrancy attack on Curve pools",
    source="Rekt News",
    source_url="https://rekt.news/..."
)

result = poster.process_exploit(exploit)

# Check results
print(f"Deep dive: {result['deep_dive']}")  # True
print(f"Reason: {result['reason']}")        # "CRITICAL severity ($15.0M)"
print(f"Visualizations: {result['visualizations_generated']}")  # 3
print(f"Paths: {result['visualization_paths']}")
# {
#   'exploit_card': 'social/visualizations/exploit_Curve_Finance_1234567890.png',
#   'timeline_chart': 'social/visualizations/timeline_1234567891.png',
#   'historical_chart': 'social/visualizations/chart_1234567892.png'
# }
```

### Production Usage (Auto-Post)

```python
# Initialize with auto-posting enabled
poster = AutomatedDeepDivePoster(
    db_connection=db,     # Database for historical context
    use_claude=True,      # Claude AI enhancement
    auto_post=True        # LIVE POSTING ENABLED
)

# Process exploit - will automatically post!
result = poster.process_exploit(exploit)

if result['posted']:
    print(f"✅ Posted to {', '.join(result['platforms'])}")
    print(f"📊 With {result['visualizations_generated']} visualizations")
```

## Generated Outputs

### Draft Files

Location: `social/drafts/{protocol}_{chain}_deep_dive.md`

Example content:
```markdown
# Deep Dive: Curve Finance Exploit

**Loss:** $15,000,000
**Chain:** Ethereum
**Type:** Reentrancy
**Generated:** 2025-01-15 14:32 UTC

## Visualizations

- **Exploit Card:** `social/visualizations/exploit_Curve_Finance_1736948520.png`
- **Timeline Chart:** `social/visualizations/timeline_1736948521.png`
- **Historical Chart:** `social/visualizations/chart_1736948522.png`

## Twitter Thread

### Tweet 1
🔴 CRITICAL EXPLOIT ALERT

Curve Finance on Ethereum
💰 $15,000,000 lost
🔥 Attack: Reentrancy

🧵 Thread 👇

### Tweet 2
...

## Reddit Post

[Full markdown post...]
```

### Visualization Files

Location: `social/visualizations/`

Files:
- `exploit_{protocol}_{timestamp}.png` - Social media card (1200x675)
- `timeline_{timestamp}.png` - Timeline chart (1200x800)
- `chart_{timestamp}.png` - Historical bar chart (1200x800)

All images use KAMIYO brand colors:
- Background: #0A0A0B (void)
- Accent: #4fe9ea (amaterasu cyan)
- Text: #FFFFFF (white)
- Severity colors: #FF0844 (critical), #F97316 (high), etc.

## Integration with Social Media

### Twitter/X

Attach visualizations to thread:
```python
# Post thread with images
for i, tweet in enumerate(twitter_thread):
    if i == 0:
        # First tweet gets exploit card
        api.post(tweet, media=[visualizations['exploit_card']])
    elif i == 2 and 'timeline_chart' in visualizations:
        # Timeline tweet gets timeline chart
        api.post(tweet, media=[visualizations['timeline_chart']])
    else:
        api.post(tweet)
```

### Reddit

Include images in post:
```markdown
![Exploit Card](./visualizations/exploit_Curve_Finance_123.png)

## Timeline

![Timeline](./visualizations/timeline_123.png)

## Historical Context

![Chart](./visualizations/chart_123.png)
```

## Customization

### Adjust Thresholds

```python
class AutomatedDeepDivePoster:
    # Customize these for your needs
    CRITICAL_THRESHOLD = 10_000_000   # Lower to 5M for more criticals
    HIGH_THRESHOLD = 1_000_000        # Lower to 500K for more deep dives
    MEDIUM_THRESHOLD = 100_000        # Lower to 50K
```

### Customize Visualizations

```python
# In _generate_visualizations method

# Custom exploit card
card_path = self.viz_generator.generate_exploit_card(
    protocol=exploit.protocol,
    chain=exploit.chain,
    loss_amount=exploit.loss_amount_usd,
    exploit_type=exploit.exploit_type,
    severity='critical',
    timestamp=exploit.timestamp
)

# Custom timeline with more events
timeline_path = self.viz_generator.generate_timeline_chart(
    events=timeline_events[:10],  # Show 10 events instead of 5
    title=f"{exploit.protocol} Attack Timeline"
)
```

## Requirements

### Python Dependencies

```bash
pip install anthropic  # Claude AI
pip install Pillow     # Image generation
```

### Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # Claude AI API key
```

## Testing

### Run Example

```bash
cd ~/project/Projekter/kamiyo

# Test the automated deep dive poster
python3 social/automated_deep_dive_poster.py

# Expected output:
# ================================================================================
# KAMIYO Automated Deep Dive Poster - Test
# ================================================================================
#
# AutomatedDeepDivePoster initialized. Claude: enabled, Visualizations: enabled, Auto-post: disabled (draft mode)
#
# 1. Testing HIGH IMPACT exploit:
# --------------------------------------------------------------------------------
# 🔥 HIGH IMPACT EXPLOIT: Curve Finance - $15,000,000. Reason: CRITICAL severity ($15.0M)
# Generating deep dive report for Curve Finance...
# Generating branded visualizations...
# ✅ Generated exploit card: social/visualizations/exploit_Curve_Finance_1234567890.png
# ✅ Generated timeline chart: social/visualizations/timeline_1234567891.png
# Generated 2 visualization(s)
# Enhancing with Claude AI...
# Draft saved: social/drafts/Curve_Finance_Ethereum_deep_dive.md
# Deep dive: True
# Reason: CRITICAL severity ($15.0M)
# Posted: False
```

### View Generated Files

```bash
# Check drafts
ls -la social/drafts/
# Curve_Finance_Ethereum_deep_dive.md

# Check visualizations
ls -la social/visualizations/
# exploit_Curve_Finance_1234567890.png
# timeline_1234567891.png
```

### Open Visualizations

```bash
# macOS
open social/visualizations/exploit_Curve_Finance_*.png

# Linux
xdg-open social/visualizations/exploit_Curve_Finance_*.png
```

## Best Practices

### 1. Start in Draft Mode
Always test with `auto_post=False` first to review generated content.

### 2. Review Visualizations
Check that generated images look correct before posting.

### 3. Monitor Quality
Track engagement metrics for visualizations vs text-only posts.

### 4. Customize for Audience
Adjust severity thresholds based on your audience's interests.

### 5. Brand Consistency
All visualizations use KAMIYO brand colors and typography.

## Troubleshooting

### No Visualizations Generated

**Problem**: `visualizations_generated: 0`

**Causes**:
- PIL/Pillow not installed
- Font files not found (uses fallback)
- Visualization directory not writable

**Fix**:
```bash
pip install Pillow
chmod +w social/visualizations/
```

### Claude Enhancement Failed

**Problem**: `claude_enhanced: false`

**Causes**:
- No `ANTHROPIC_API_KEY` environment variable
- Invalid API key
- Rate limit exceeded

**Fix**:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# Or set in .env file
```

### Timeline Chart Not Generated

**Problem**: Only exploit card generated

**Cause**: Report has no timeline data

**Expected**: This is normal for exploits without timeline info

### Historical Chart Not Generated

**Problem**: Only exploit card + timeline generated

**Cause**: Report has no historical context

**Expected**: This is normal for new exploit types

## Summary

The visual deep dive system provides:

✅ **Automated** - Triggers on high-impact exploits
✅ **Branded** - Uses KAMIYO colors and style
✅ **Multi-format** - Cards, timelines, charts
✅ **AI-Enhanced** - Claude makes text engaging
✅ **Social-ready** - Optimized for Twitter/Reddit
✅ **Safe** - Draft mode prevents accidental posting

For high-impact exploits ($1M+), you now get:
- Professional visualizations
- Engaging Claude AI text
- Multi-platform content
- Automatic posting (if enabled)

All with KAMIYO brand consistency and quality! 🎨
