#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Daily AI Agent Quote Tweet Scheduler
Runs once per day to post an AI-generated quote tweet
"""

import logging
import sys
import os
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.ai_agent_poster import AIAgentPoster

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/tmp/kamiyo_ai_agent_poster.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def main():
    """Run the daily AI agent quote tweet"""
    logger.info("=" * 80)
    logger.info(f"Starting AI Agent Quote Tweet - {datetime.now()}")
    logger.info("=" * 80)

    try:
        poster = AIAgentPoster()
        result = poster.post_daily_quote_tweet()

        if result['success']:
            logger.info("SUCCESS!")
            logger.info(f"Posted at: {result['url']}")
            logger.info(f"Quote tweet content: {result['content']}")
            logger.info(f"Original tweet from: @{result['original_author']}")
            return 0
        else:
            logger.error(f"FAILED: {result['error']}")
            return 1

    except Exception as e:
        logger.error(f"EXCEPTION: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
