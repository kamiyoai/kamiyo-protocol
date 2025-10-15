# -*- coding: utf-8 -*-
"""
Payment System Test Suite
Tests for Stripe integration, subscriptions, webhooks, and billing
"""

import os
import sys

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
