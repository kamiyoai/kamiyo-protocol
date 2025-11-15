#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Random Schedule AI Agent Quote Tweet Poster
Posts twice daily at random times within specified windows
"""

import logging
import sys
import os
import time
import random
from datetime import datetime, timedelta

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


class RandomScheduler:
    """
    Schedules posts at random times within two daily windows:
    - Morning window: 8 AM - 12 PM
    - Evening window: 4 PM - 10 PM
    """

    def __init__(self):
        self.poster = AIAgentPoster()
        self.posts_today = {'morning': False, 'evening': False}
        self.last_date = datetime.now().date()

    def reset_daily_tracking(self):
        """Reset tracking for a new day"""
        current_date = datetime.now().date()
        if current_date != self.last_date:
            logger.info(f"New day detected: {current_date}")
            self.posts_today = {'morning': False, 'evening': False}
            self.last_date = current_date

    def get_random_time_in_window(self, start_hour: int, end_hour: int) -> datetime:
        """
        Get a random datetime within the specified hour window for today

        Args:
            start_hour: Start hour (0-23)
            end_hour: End hour (0-23)

        Returns:
            Random datetime within the window
        """
        now = datetime.now()

        # Random hour within window
        hour = random.randint(start_hour, end_hour - 1)

        # Random minute (0-59)
        minute = random.randint(0, 59)

        target_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # If the time has already passed today, schedule for tomorrow
        if target_time <= now:
            target_time += timedelta(days=1)

        return target_time

    def seconds_until(self, target_time: datetime) -> int:
        """Calculate seconds until target time"""
        now = datetime.now()
        delta = target_time - now
        return max(0, int(delta.total_seconds()))

    def should_post_morning(self) -> bool:
        """Check if we should post in morning window"""
        now = datetime.now()
        # Morning window: 8 AM - 12 PM
        return 8 <= now.hour < 12 and not self.posts_today['morning']

    def should_post_evening(self) -> bool:
        """Check if we should post in evening window"""
        now = datetime.now()
        # Evening window: 4 PM - 10 PM
        return 16 <= now.hour < 22 and not self.posts_today['evening']

    def post_tweet(self, window_name: str):
        """Post a quote tweet and mark window as complete"""
        logger.info("=" * 80)
        logger.info(f"Posting {window_name} quote tweet - {datetime.now()}")
        logger.info("=" * 80)

        try:
            result = self.poster.post_daily_quote_tweet()

            if result['success']:
                logger.info("SUCCESS!")
                logger.info(f"Posted at: {result['url']}")
                logger.info(f"Quote tweet content: {result['content']}")
                logger.info(f"Original tweet from: @{result['original_author']}")

                # Mark this window as posted
                self.posts_today[window_name] = True
                logger.info(f"{window_name.capitalize()} post complete for today")

            else:
                logger.error(f"FAILED: {result['error']}")

        except Exception as e:
            logger.error(f"EXCEPTION: {e}", exc_info=True)

    def run_forever(self):
        """Run the scheduler continuously"""
        logger.info("Starting Random AI Agent Quote Tweet Scheduler")
        logger.info("Morning window: 8 AM - 12 PM")
        logger.info("Evening window: 4 PM - 10 PM")
        logger.info("Posts will occur at random times within these windows")
        logger.info("=" * 80)

        # Schedule initial random times
        morning_time = self.get_random_time_in_window(8, 12)
        evening_time = self.get_random_time_in_window(16, 22)

        logger.info(f"Next morning post scheduled around: {morning_time.strftime('%Y-%m-%d %I:%M %p')}")
        logger.info(f"Next evening post scheduled around: {evening_time.strftime('%Y-%m-%d %I:%M %p')}")

        while True:
            try:
                # Reset daily tracking if it's a new day
                self.reset_daily_tracking()

                now = datetime.now()

                # Check if it's time for morning post
                if not self.posts_today['morning'] and now >= morning_time:
                    self.post_tweet('morning')
                    # Schedule next morning post
                    morning_time = self.get_random_time_in_window(8, 12)
                    logger.info(f"Next morning post scheduled around: {morning_time.strftime('%Y-%m-%d %I:%M %p')}")

                # Check if it's time for evening post
                if not self.posts_today['evening'] and now >= evening_time:
                    self.post_tweet('evening')
                    # Schedule next evening post
                    evening_time = self.get_random_time_in_window(16, 22)
                    logger.info(f"Next evening post scheduled around: {evening_time.strftime('%Y-%m-%d %I:%M %p')}")

                # Sleep for 5 minutes before checking again
                time.sleep(300)

            except KeyboardInterrupt:
                logger.info("Scheduler stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}", exc_info=True)
                # Sleep for 1 minute before retrying
                time.sleep(60)


def main():
    """Main entry point"""
    scheduler = RandomScheduler()
    scheduler.run_forever()


if __name__ == '__main__':
    sys.exit(main())
