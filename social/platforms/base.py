# -*- coding: utf-8 -*-
"""
Base Platform Poster
Abstract base class for all social media platform posters
"""

import logging
import time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class BasePlatformPoster(ABC):
    """Abstract base class for platform-specific posters"""

    def __init__(self, config: Dict):
        """
        Initialize platform poster

        Args:
            config: Platform configuration dict
        """
        self.config = config
        self.enabled = config.get('enabled', False)
        self.rate_limit = config.get('rate_limit', 10)  # Posts per hour
        self.retry_attempts = config.get('retry_attempts', 3)
        self.retry_delay = config.get('retry_delay', 60)  # Seconds

        # Rate limiting tracking
        self._post_times: List[datetime] = []

    @abstractmethod
    def authenticate(self) -> bool:
        """
        Authenticate with the platform

        Returns:
            bool: True if authentication successful
        """
        pass

    @abstractmethod
    def post(self, content: str, **kwargs) -> Dict:
        """
        Post content to the platform

        Args:
            content: Post content
            **kwargs: Platform-specific parameters

        Returns:
            dict: Result with 'success', 'post_id', 'url', 'error'
        """
        pass

    @abstractmethod
    def validate_content(self, content: str) -> bool:
        """
        Validate content meets platform requirements

        Args:
            content: Content to validate

        Returns:
            bool: True if valid
        """
        pass

    def check_rate_limit(self) -> bool:
        """
        Check if posting is within rate limits

        Returns:
            bool: True if can post
        """
        now = datetime.utcnow()
        hour_ago = now - timedelta(hours=1)

        # Remove old post times
        self._post_times = [t for t in self._post_times if t > hour_ago]

        # Check if under limit
        if len(self._post_times) >= self.rate_limit:
            logger.warning(f"Rate limit reached: {len(self._post_times)}/{self.rate_limit} posts in last hour")
            return False

        return True

    def record_post(self):
        """Record a post for rate limiting"""
        self._post_times.append(datetime.utcnow())

    def post_with_retry(self, content: str, **kwargs) -> Dict:
        """
        Post with retry logic

        Args:
            content: Post content
            **kwargs: Platform-specific parameters

        Returns:
            dict: Result
        """
        if not self.enabled:
            return {
                'success': False,
                'error': 'Platform posting is disabled'
            }

        if not self.check_rate_limit():
            return {
                'success': False,
                'error': 'Rate limit exceeded'
            }

        if not self.validate_content(content):
            return {
                'success': False,
                'error': 'Content validation failed'
            }

        last_error = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                logger.info(f"Posting attempt {attempt}/{self.retry_attempts}")
                result = self.post(content, **kwargs)

                if result.get('success'):
                    self.record_post()
                    logger.info(f"Successfully posted: {result.get('post_id')}")
                    return result
                else:
                    last_error = result.get('error', 'Unknown error')
                    logger.warning(f"Post attempt {attempt} failed: {last_error}")

                    # Check for rate limit error (429)
                    if '429' in str(last_error):
                        logger.error(f"Rate limit error detected (429) - aborting retries")
                        return {
                            'success': False,
                            'error': f'Rate limit exceeded (429): {last_error}',
                            'rate_limited': True
                        }

            except Exception as e:
                last_error = str(e)
                logger.error(f"Post attempt {attempt} error: {e}")

                # Check for rate limit error in exception
                if '429' in str(e):
                    logger.error(f"Rate limit error detected (429) in exception - aborting retries")
                    return {
                        'success': False,
                        'error': f'Rate limit exceeded (429): {e}',
                        'rate_limited': True
                    }

            # Wait before retry with exponential backoff
            if attempt < self.retry_attempts:
                delay = self.retry_delay * (2 ** (attempt - 1))  # Exponential backoff
                logger.info(f"Waiting {delay}s before retry...")
                time.sleep(delay)

        return {
            'success': False,
            'error': f'All retry attempts failed. Last error: {last_error}'
        }

    def get_status(self) -> Dict:
        """
        Get platform poster status

        Returns:
            dict: Status information
        """
        hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_posts = [t for t in self._post_times if t > hour_ago]

        return {
            'enabled': self.enabled,
            'authenticated': self.is_authenticated(),
            'rate_limit': self.rate_limit,
            'posts_last_hour': len(recent_posts),
            'can_post': self.check_rate_limit()
        }

    @abstractmethod
    def is_authenticated(self) -> bool:
        """
        Check if currently authenticated

        Returns:
            bool: True if authenticated
        """
        pass
