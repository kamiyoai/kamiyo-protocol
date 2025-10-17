# -*- coding: utf-8 -*-
"""
Reddit Platform Poster - WITH MONITORING
Example implementation showing how to integrate monitoring
"""

import logging
import time
from typing import Dict, List
import praw
from praw.exceptions import RedditAPIException

from social.platforms.base import BasePlatformPoster
from social.monitoring import (
    track_post,
    track_api_call,
    track_api_error,
    set_platform_authentication,
    set_rate_limit_remaining,
    social_logger,
    alert_manager,
    metrics
)

logger = logging.getLogger(__name__)


class RedditPosterMonitored(BasePlatformPoster):
    """Posts to Reddit subreddits - with comprehensive monitoring"""

    MAX_TITLE_LENGTH = 300
    MAX_BODY_LENGTH = 40000
    PLATFORM_NAME = "reddit"

    def __init__(self, config: Dict):
        """
        Initialize Reddit poster

        Args:
            config: Configuration dict with:
                - client_id: Reddit API client ID
                - client_secret: Reddit API client secret
                - user_agent: Reddit API user agent
                - username: Reddit username
                - password: Reddit password
                - subreddits: List of subreddit names
        """
        super().__init__(config)
        self.client_id = config.get('client_id')
        self.client_secret = config.get('client_secret')
        self.user_agent = config.get('user_agent', 'Kamiyo Exploit Intelligence Bot')
        self.username = config.get('username')
        self.password = config.get('password')
        self.subreddits = config.get('subreddits', ['defi', 'CryptoCurrency'])

        self.reddit = None
        self._authenticated = False
        self._consecutive_failures = 0

    def authenticate(self) -> bool:
        """Authenticate with Reddit API - with monitoring"""
        start_time = time.time()

        try:
            self.reddit = praw.Reddit(
                client_id=self.client_id,
                client_secret=self.client_secret,
                user_agent=self.user_agent,
                username=self.username,
                password=self.password
            )

            # Test authentication
            self.reddit.user.me()
            self._authenticated = True
            duration = time.time() - start_time

            # Update metrics
            set_platform_authentication(self.PLATFORM_NAME, True)

            # Log success
            social_logger.log_authentication(
                platform=self.PLATFORM_NAME,
                success=True,
                duration_seconds=duration,
                username=self.username
            )

            logger.info(f"Authenticated to Reddit as {self.username}")

            # Reset consecutive failures on successful auth
            self._consecutive_failures = 0
            alert_manager.reset_failure_count(f"{self.PLATFORM_NAME}_auth")

            return True

        except Exception as e:
            duration = time.time() - start_time
            self._authenticated = False

            # Update metrics
            set_platform_authentication(self.PLATFORM_NAME, False)
            track_api_error(self.PLATFORM_NAME, 'auth_failed')

            # Log failure
            social_logger.log_authentication(
                platform=self.PLATFORM_NAME,
                success=False,
                error=str(e),
                duration_seconds=duration,
                username=self.username
            )

            logger.error(f"Reddit authentication failed: {e}")

            # Track consecutive failures and alert if threshold reached
            self._consecutive_failures += 1
            alert_manager.track_failure(
                f"{self.PLATFORM_NAME}_auth",
                details={
                    'platform': self.PLATFORM_NAME,
                    'error': str(e),
                    'username': self.username
                }
            )

            return False

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    def validate_content(self, content: str) -> bool:
        """Validate content for Reddit - with monitoring"""
        if len(content) > self.MAX_BODY_LENGTH:
            # Track validation failure
            metrics.record_validation_failure(
                self.PLATFORM_NAME,
                'content_too_long'
            )

            social_logger.log_validation_error(
                platform=self.PLATFORM_NAME,
                exploit_tx_hash='unknown',
                validation_error=f'Content too long: {len(content)} > {self.MAX_BODY_LENGTH}',
                content_length=len(content)
            )

            logger.error(f"Content too long: {len(content)} > {self.MAX_BODY_LENGTH}")
            return False

        return True

    def post(self, content: str, **kwargs) -> Dict:
        """
        Post to Reddit subreddits - with comprehensive monitoring

        Args:
            content: Post body (Markdown)
            **kwargs:
                - title: Post title (required)
                - subreddits: List of subreddit names (optional)
                - flair_id: Flair ID for post (optional)
                - exploit_tx_hash: Transaction hash (for tracking)

        Returns:
            dict: Result
        """
        exploit_tx_hash = kwargs.get('exploit_tx_hash', 'unknown')
        title = kwargs.get('title', 'Exploit Alert')
        target_subreddits = kwargs.get('subreddits', self.subreddits)
        flair_id = kwargs.get('flair_id')

        # Log attempt
        social_logger.log_post_attempt(
            platform=self.PLATFORM_NAME,
            exploit_tx_hash=exploit_tx_hash,
            subreddits=target_subreddits
        )

        # Check authentication
        if not self.is_authenticated():
            if not self.authenticate():
                track_post(self.PLATFORM_NAME, 'failed')
                return {'success': False, 'error': 'Not authenticated'}

        # Truncate title if needed
        if len(title) > self.MAX_TITLE_LENGTH:
            title = title[:self.MAX_TITLE_LENGTH - 3] + '...'

        overall_start_time = time.time()
        results = []
        errors = []

        for subreddit_name in target_subreddits:
            post_start_time = time.time()

            try:
                subreddit = self.reddit.subreddit(subreddit_name)

                # Check if subreddit exists and we can post
                try:
                    subreddit.submit_gallery  # Check access
                except:
                    pass

                # Track API call duration
                with track_api_call(self.PLATFORM_NAME):
                    submission = subreddit.submit(
                        title=title,
                        selftext=content,
                        flair_id=flair_id
                    )

                post_duration = time.time() - post_start_time
                post_url = f"https://reddit.com{submission.permalink}"

                results.append({
                    'subreddit': subreddit_name,
                    'post_id': submission.id,
                    'url': post_url,
                    'success': True
                })

                # Track successful post
                track_post(self.PLATFORM_NAME, 'success')

                # Log success
                social_logger.log_post_success(
                    platform=self.PLATFORM_NAME,
                    exploit_tx_hash=exploit_tx_hash,
                    post_id=submission.id,
                    post_url=post_url,
                    duration_seconds=post_duration,
                    subreddit=subreddit_name
                )

                logger.info(f"Posted to r/{subreddit_name}: {submission.id}")

                # Update rate limit info if available
                try:
                    # Reddit doesn't expose rate limit directly via PRAW,
                    # but we track post times for our own rate limiting
                    remaining = self.rate_limit - len(self._post_times)
                    set_rate_limit_remaining(self.PLATFORM_NAME, remaining)
                except:
                    pass

            except RedditAPIException as e:
                post_duration = time.time() - post_start_time
                error_msg = f"Reddit API error in r/{subreddit_name}: {e}"

                # Determine error type
                error_type = 'api_error'
                if 'RATELIMIT' in str(e).upper():
                    error_type = 'rate_limit'
                    # Alert rate limit exhaustion
                    alert_manager.alert_rate_limit_exhaustion(
                        platform=self.PLATFORM_NAME,
                        reset_time='unknown'
                    )
                    # Set rate limit to 0
                    set_rate_limit_remaining(self.PLATFORM_NAME, 0)

                # Track error
                track_post(self.PLATFORM_NAME, 'failed')
                track_api_error(self.PLATFORM_NAME, error_type)
                metrics.record_retry(self.PLATFORM_NAME)

                # Log failure
                social_logger.log_post_failure(
                    platform=self.PLATFORM_NAME,
                    exploit_tx_hash=exploit_tx_hash,
                    error=str(e),
                    error_type=error_type,
                    subreddit=subreddit_name,
                    duration_seconds=post_duration
                )

                logger.error(error_msg)
                errors.append(error_msg)

                results.append({
                    'subreddit': subreddit_name,
                    'success': False,
                    'error': str(e)
                })

                # Track consecutive failures
                self._consecutive_failures += 1
                alert_manager.track_failure(
                    f"{self.PLATFORM_NAME}_post",
                    details={
                        'platform': self.PLATFORM_NAME,
                        'subreddit': subreddit_name,
                        'error': str(e),
                        'error_type': error_type,
                        'exploit_tx': exploit_tx_hash
                    }
                )

            except Exception as e:
                post_duration = time.time() - post_start_time
                error_msg = f"Error posting to r/{subreddit_name}: {e}"

                # Track error
                track_post(self.PLATFORM_NAME, 'failed')
                track_api_error(self.PLATFORM_NAME, 'unknown_error')

                # Log failure
                social_logger.log_post_failure(
                    platform=self.PLATFORM_NAME,
                    exploit_tx_hash=exploit_tx_hash,
                    error=str(e),
                    error_type='unknown_error',
                    subreddit=subreddit_name,
                    duration_seconds=post_duration
                )

                logger.error(error_msg)
                errors.append(error_msg)

                results.append({
                    'subreddit': subreddit_name,
                    'success': False,
                    'error': str(e)
                })

                # Track consecutive failures
                self._consecutive_failures += 1
                alert_manager.track_failure(
                    f"{self.PLATFORM_NAME}_post",
                    details={
                        'platform': self.PLATFORM_NAME,
                        'subreddit': subreddit_name,
                        'error': str(e),
                        'exploit_tx': exploit_tx_hash
                    }
                )

        # Overall success if at least one post succeeded
        success = any(r.get('success') for r in results)

        # Reset consecutive failures on any success
        if success:
            self._consecutive_failures = 0
            alert_manager.reset_failure_count(f"{self.PLATFORM_NAME}_post")

        overall_duration = time.time() - overall_start_time

        return {
            'success': success,
            'results': results,
            'errors': errors if errors else None,
            'post_count': sum(1 for r in results if r.get('success')),
            'duration_seconds': overall_duration
        }

    def get_subreddit_rules(self, subreddit_name: str) -> List[str]:
        """
        Get rules for a subreddit

        Args:
            subreddit_name: Subreddit name

        Returns:
            List of rule descriptions
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return []

        try:
            subreddit = self.reddit.subreddit(subreddit_name)
            return [rule.short_name for rule in subreddit.rules]
        except Exception as e:
            logger.error(f"Error fetching rules for r/{subreddit_name}: {e}")
            track_api_error(self.PLATFORM_NAME, 'api_error')
            return []

    def get_status(self) -> Dict:
        """
        Get platform poster status - enhanced with monitoring

        Returns:
            dict: Status information
        """
        base_status = super().get_status()

        # Add monitoring-specific status
        base_status.update({
            'consecutive_failures': self._consecutive_failures,
            'username': self.username,
            'subreddits': self.subreddits,
            'max_title_length': self.MAX_TITLE_LENGTH,
            'max_body_length': self.MAX_BODY_LENGTH
        })

        return base_status
