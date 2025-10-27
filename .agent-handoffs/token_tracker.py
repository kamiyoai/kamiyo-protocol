#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Token Window Limit Tracker for Session Handoff
Automatically updates CURRENT_SESSION.md when approaching context window limits
"""

import os
import time
import json
from datetime import datetime

class TokenTracker:
    def __init__(self, handoff_dir=".agent-handoffs"):
        # Use absolute path to avoid nested directory issues
        if not handoff_dir.startswith('/'):
            # Get the absolute path from project root
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.handoff_dir = os.path.join(project_root, handoff_dir)
        else:
            self.handoff_dir = handoff_dir
        
        self.token_file = os.path.join(self.handoff_dir, "token_usage.json")
        self.current_session_file = os.path.join(self.handoff_dir, "CURRENT_SESSION.md")
        self.template_file = os.path.join(self.handoff_dir, "SESSION_HANDOFF_TEMPLATE.md")
        
        # Initialize token tracking
        self.initialize_token_tracking()
    
    def initialize_token_tracking(self):
        """Initialize token tracking file if it doesn't exist"""
        if not os.path.exists(self.token_file):
            initial_data = {
                "session_start": datetime.now().isoformat(),
                "total_tokens_estimated": 0,
                "token_checkpoints": [],
                "context_window_limit": 128000,  # Default for Claude 3.5 Sonnet
                "warning_threshold": 0.8,  # 80% of context window
                "last_handoff_update": None
            }
            self.save_token_data(initial_data)
    
    def load_token_data(self):
        """Load current token usage data"""
        try:
            with open(self.token_file, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.initialize_token_tracking()
            return self.load_token_data()
    
    def save_token_data(self, data):
        """Save token usage data"""
        if not os.path.exists(self.handoff_dir):
            os.makedirs(self.handoff_dir)
        with open(self.token_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def estimate_token_usage(self, text):
        """
        Rough estimation of token usage
        Note: This is an approximation - actual token counts may vary
        """
        # Rough approximation: ~4 characters per token for English text
        return len(text) // 4
    
    def add_token_checkpoint(self, text_chunk, description=""):
        """
        Add a token usage checkpoint and check if we're approaching limits
        """
        data = self.load_token_data()
        
        # Estimate tokens for this chunk
        tokens_this_chunk = self.estimate_token_usage(text_chunk)
        data["total_tokens_estimated"] += tokens_this_chunk
        
        # Add checkpoint
        checkpoint = {
            "timestamp": datetime.now().isoformat(),
            "tokens": tokens_this_chunk,
            "description": description,
            "cumulative_total": data["total_tokens_estimated"]
        }
        data["token_checkpoints"].append(checkpoint)
        
        # Check if we're approaching limits
        current_usage = data["total_tokens_estimated"]
        limit = data["context_window_limit"]
        threshold = data["warning_threshold"]
        
        usage_percentage = current_usage / limit
        
        print("Token usage: {}/{:.1%}".format(current_usage, usage_percentage))
        
        if usage_percentage >= threshold:
            print("WARNING: Approaching context window limit ({:.1%})".format(usage_percentage))
            self.trigger_handoff_update(data)
        
        self.save_token_data(data)
        return usage_percentage
    
    def trigger_handoff_update(self, data):
        """Update CURRENT_SESSION.md when approaching limits"""
        print("Updating handoff file...")
        
        # Read current session file if it exists
        current_content = ""
        if os.path.exists(self.current_session_file):
            with open(self.current_session_file, 'r') as f:
                current_content = f.read()
        
        # Update or create handoff file
        handoff_content = self.generate_handoff_content(data, current_content)
        
        with open(self.current_session_file, 'w') as f:
            f.write(handoff_content)
        
        data["last_handoff_update"] = datetime.now().isoformat()
        self.save_token_data(data)
        
        print("Handoff file updated successfully")
    
    def generate_handoff_content(self, data, current_content):
        """Generate handoff content based on current state"""
        
        # If we have existing content, update the token status
        if current_content and "Token Status:" in current_content:
            # Update the token status section
            lines = current_content.split('\n')
            updated_lines = []
            
            for line in lines:
                if line.startswith("**Token Usage:**"):
                    usage_percent = data['total_tokens_estimated']/data['context_window_limit']
                    updated_lines.append("**Token Usage:** {}/{} ({:.1%})".format(data['total_tokens_estimated'], data['context_window_limit'], usage_percent))
                elif line.startswith("**Last Handoff Update:**"):
                    updated_lines.append("**Last Handoff Update:** {}".format(datetime.now().strftime('%Y-%m-%d %H:%M:%S CET')))
                else:
                    updated_lines.append(line)
            
            return '\n'.join(updated_lines)
        else:
            # Create new handoff content
            usage_percent = data['total_tokens_estimated']/data['context_window_limit']
            threshold_percent = data['warning_threshold']*100
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S CET')
            
            return """# CURRENT SESSION HANDOFF - AUTO-UPDATED

**Session Start:** {}
**Session End:** Ongoing
**Context Window:** DeepSeek Reasoner
**Token Usage:** {}/{} ({:.1%})
**Last Handoff Update:** {}

---

## TOKEN STATUS
**APPROACHING CONTEXT WINDOW LIMIT** - Auto-handoff triggered at {}% threshold

## CURRENT FOCUS AREA
[Session interrupted due to context window limits - please check recent work]

## RECOMMENDED ACTIONS
1. Read this handoff file to understand current state
2. Check git status for recent changes
3. Continue from where previous session left off
4. Update handoff file with new progress

---

**Auto-generated handoff at:** {}
**Ready for Handoff:** YES (Context window limit approaching)
""".format(data['session_start'], data['total_tokens_estimated'], data['context_window_limit'], usage_percent, current_time, threshold_percent, current_time)

    def get_current_usage(self):
        """Get current token usage statistics"""
        data = self.load_token_data()
        return {
            "total_tokens": data["total_tokens_estimated"],
            "limit": data["context_window_limit"],
            "usage_percentage": data["total_tokens_estimated"] / data["context_window_limit"],
            "checkpoints": len(data["token_checkpoints"])
        }

# Global instance for easy access
tracker = TokenTracker()

# Convenience functions
def track_tokens(text, description=""):
    """Track token usage for a text chunk"""
    return tracker.add_token_checkpoint(text, description)

def get_token_status():
    """Get current token usage status"""
    return tracker.get_current_usage()

def manual_handoff_update():
    """Manually trigger handoff update"""
    data = tracker.load_token_data()
    tracker.trigger_handoff_update(data)

if __name__ == "__main__":
    # Test the token tracker
    status = get_token_status()
    print("Current token usage: {}/{} ({:.1%})".format(status['total_tokens'], status['limit'], status['usage_percentage']))
    print("Checkpoints: {}".format(status['checkpoints']))