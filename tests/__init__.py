# -*- coding: utf-8 -*-
"""
Kamiyo Test Suite
Main test package for all testing modules
"""

import os
import sys

# Add project root to path for imports
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
