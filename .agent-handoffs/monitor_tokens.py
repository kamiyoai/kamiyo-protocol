#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Token Monitor Script
Run this periodically to check token usage and trigger handoff if needed
"""

import sys
import os

# Add current directory to path to import token_tracker
sys.path.insert(0, os.path.dirname(__file__))

from token_tracker import get_token_status, manual_handoff_update

def main():
    """Check token usage and provide status"""
    status = get_token_status()
    
    print("Token Usage Monitor")
    print("Current Usage: {:,} tokens".format(status['total_tokens']))
    print("Context Limit: {:,} tokens".format(status['limit']))
    print("Usage Percentage: {:.1%}".format(status['usage_percentage']))
    print("Checkpoints Tracked: {}".format(status['checkpoints']))
    
    if status['usage_percentage'] >= 0.7:
        print("\n⚠️  WARNING: High token usage detected")
        if status['usage_percentage'] >= 0.8:
            print("🚨 CRITICAL: Approaching context window limit")
            print("Triggering automatic handoff update...")
            manual_handoff_update()
        else:
            print("Consider preparing handoff soon")
    else:
        print("\n✅ Token usage is within safe limits")

if __name__ == "__main__":
    main()
