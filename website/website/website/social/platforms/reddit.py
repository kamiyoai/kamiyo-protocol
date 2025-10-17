# -*- coding: utf-8 -*-
"""
Reddit Platform Poster
Posts exploit alerts to Reddit subreddits
"""

import logging
from typing import Dict, List
import praw
from praw.exceptions import RedditAPIException

from social.platforms.base import BasePlatformPoster

logger = logging.getLogger(__name__)


class RedditPoster(BasePlatformPoster):
    """Posts to Reddit subreddits"""

    MAX_TITLE_LENGTH = 300
    MAX_BODY_LENGTH = 40000

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

    def authenticate(self) -> bool:
        """Authenticate with Reddit API"""
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
            logger.info(f"Authenticated to Reddit as {self.username}")
            return True

        except Exception as e:
            logger.error(f"Reddit authentication failed: {e}")
            self._authenticated = False
            return False

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    def validate_content(self, content: str) -> bool:
        """Validate content for Reddit"""
        if len(content) > self.MAX_BODY_LENGTH:
            logger.error(f"Content too long: {len(content)} > {self.MAX_BODY_LENGTH}")
            return False
        return True

    def post(self, content: str, **kwargs) -> Dict:
        """
        Post to Reddit subreddits

        Args:
            content: Post body (Markdown)
            **kwargs:
                - title: Post title (required)
                - subreddits: List of subreddit names (optional)
                - flair_id: Flair ID for post (optional)

        Returns:
            dict: Result
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        title = kwargs.get('title', 'Exploit Alert')
        target_subreddits = kwargs.get('subreddits', self.subreddits)
        flair_id = kwargs.get('flair_id')

        # Truncate title if needed
        if len(title) > self.MAX_TITLE_LENGTH:
            title = title[:self.MAX_TITLE_LENGTH - 3] + '...'

        results = []
        errors = []

        for subreddit_name in target_subreddits:
            try:
                subreddit = self.reddit.subreddit(subreddit_name)

                # Check if subreddit exists and we can post
                try:
                    subreddit.submit_gallery  # Check access
                except:
                    pass

                # Submit post
                submission = subreddit.submit(
                    title=title,
                    selftext=content,
                    flair_id=flair_id
                )

                results.append({
                    'subreddit': subreddit_name,
                    'post_id': submission.id,
                    'url': f"https://reddit.com{submission.permalink}",
                    'success': True
                })

                logger.info(f"Posted to r/{subreddit_name}: {submission.id}")

            except RedditAPIException as e:
                error_msg = f"Reddit API error in r/{subreddit_name}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    'subreddit': subreddit_name,
                    'success': False,
                    'error': str(e)
                })

            except Exception as e:
                error_msg = f"Error posting to r/{subreddit_name}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    'subreddit': subreddit_name,
                    'success': False,
                    'error': str(e)
                })

        # Overall success if at least one post succeeded
        success = any(r.get('success') for r in results)

        return {
            'success': success,
            'results': results,
            'errors': errors if errors else None,
            'post_count': sum(1 for r in results if r.get('success'))
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
            return []
