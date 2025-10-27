# Token Tracking & Handoff System Usage Guide

## Overview
This system automatically tracks token usage and updates handoff files when approaching context window limits, ensuring smooth transitions between sessions.

## Quick Start

### 1. Track Token Usage
```python
from token_tracker import track_tokens, get_token_status

# Track a text chunk
text = "Your conversation text here"
usage = track_tokens(text, "Description of this text chunk")

# Check current status
status = get_token_status()
print(f"Usage: {status['usage_percentage']:.1%}")
```

### 2. Manual Monitoring
```bash
# Check current token usage
python .agent-handoffs/monitor_tokens.py

# Manually trigger handoff update
python -c "from token_tracker import manual_handoff_update; manual_handoff_update()"
```

### 3. Automatic Integration
For automatic tracking, integrate token tracking into your workflow:

```python
# Example: Track each response
def generate_response(prompt):
    response = "Your AI response here"
    
    # Track both prompt and response
    track_tokens(prompt, "User prompt")
    track_tokens(response, "AI response")
    
    return response
```

## How It Works

### Token Estimation
- Uses rough approximation: ~4 characters per token
- Tracks cumulative usage across session
- Updates handoff file at 80% threshold (configurable)

### Automatic Handoff
When token usage reaches 80% of context window:
1. **Auto-updates** `CURRENT_SESSION.md`
2. **Adds token status** section
3. **Includes timestamp** of last update
4. **Provides context** for next session

### Files Created
- `.agent-handoffs/token_usage.json` - Token tracking data
- `.agent-handoffs/CURRENT_SESSION.md` - Auto-updated handoff
- `.agent-handoffs/token_tracker.py` - Main tracking logic
- `.agent-handoffs/monitor_tokens.py` - Monitoring script

## Configuration

### Context Window Limits
Edit `token_usage.json` to set different limits:
```json
{
    "context_window_limit": 128000,  // Claude 3.5 Sonnet
    "warning_threshold": 0.8         // 80% threshold
}
```

### Common Context Window Sizes
- **Claude 3.5 Sonnet**: 200,000 tokens
- **GPT-4**: 128,000 tokens  
- **Claude 3 Opus**: 200,000 tokens
- **DeepSeek Reasoner**: Varies

## Best Practices

1. **Track Early**: Start tracking from session beginning
2. **Monitor Regularly**: Run monitor script periodically
3. **Update Thresholds**: Adjust for your specific model
4. **Manual Check**: Use monitor before critical operations
5. **Clean Handoffs**: Review and update handoff files

## Troubleshooting

### Reset Token Tracking
```bash
rm .agent-handoffs/token_usage.json
```

### Force Handoff Update
```bash
python -c "from token_tracker import manual_handoff_update; manual_handoff_update()"
```

### Check System Health
```bash
python .agent-handoffs/monitor_tokens.py
```

## Integration with Continue

For Continue agents, you can:
1. Import token tracker in your agent scripts
2. Track each response and user input
3. Set up periodic monitoring
4. Use handoff files for context preservation

This system ensures you never lose context due to window limits!