# -*- coding: utf-8 -*-
"""
X (Twitter) Platform Poster
Posts exploit alerts to X/Twitter
"""

import logging
import time
from typing import Dict, List, Optional
import tweepy
from tweepy.errors import TweepyException

from social.platforms.base import BasePlatformPoster

logger = logging.getLogger(__name__)


class XTwitterPoster(BasePlatformPoster):
    """Posts to X (Twitter)"""

    MAX_TWEET_LENGTH = 280
    MAX_THREAD_TWEETS = 25

    def __init__(self, config: Dict):
        """
        Initialize X/Twitter poster

        Args:
            config: Configuration dict with:
                - api_key: Twitter API key (consumer key)
                - api_secret: Twitter API secret (consumer secret)
                - access_token: Twitter access token
                - access_secret: Twitter access token secret
                - bearer_token: Twitter bearer token (optional, for v2 API)
        """
        super().__init__(config)
        self.api_key = config.get('api_key')
        self.api_secret = config.get('api_secret')
        self.access_token = config.get('access_token')
        self.access_secret = config.get('access_secret')
        self.bearer_token = config.get('bearer_token')

        self.client = None
        self.api = None
        self._authenticated = False

    def authenticate(self) -> bool:
        """Authenticate with Twitter API"""
        try:
            # Authenticate with Twitter API v1.1 (for media upload)
            auth = tweepy.OAuth1UserHandler(
                self.api_key,
                self.api_secret,
                self.access_token,
                self.access_secret
            )
            self.api = tweepy.API(auth)

            # Authenticate with Twitter API v2 (for posting)
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_secret
            )

            # Test authentication
            self.client.get_me()
            self._authenticated = True
            logger.info("Authenticated to X/Twitter")
            return True

        except TweepyException as e:
            logger.error(f"X/Twitter authentication failed: {e}")
            self._authenticated = False
            return False

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    def validate_content(self, content: str) -> bool:
        """Validate content for Twitter"""
        if len(content) > self.MAX_TWEET_LENGTH:
            logger.warning(f"Content longer than {self.MAX_TWEET_LENGTH} chars, will need threading")
        return True

    def post(self, content: str, **kwargs) -> Dict:
        """
        Post tweet to X/Twitter

        Args:
            content: Tweet content
            **kwargs:
                - reply_to: Tweet ID to reply to
                - quote_tweet_id: Tweet ID to quote
                - media_ids: List of media IDs

        Returns:
            dict: Result
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        # If content is too long, auto-thread
        if len(content) > self.MAX_TWEET_LENGTH:
            return self.post_thread([content], **kwargs)

        try:
            response = self.client.create_tweet(
                text=content,
                in_reply_to_tweet_id=kwargs.get('reply_to'),
                quote_tweet_id=kwargs.get('quote_tweet_id'),
                media_ids=kwargs.get('media_ids')
            )

            tweet_id = response.data['id']
            url = f"https://twitter.com/i/web/status/{tweet_id}"

            logger.info(f"Posted tweet: {tweet_id}")

            return {
                'success': True,
                'tweet_id': tweet_id,
                'url': url
            }

        except TweepyException as e:
            error_msg = f"X/Twitter post error: {e}"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }

    def post_thread(self, tweets: List[str], **kwargs) -> Dict:
        """
        Post a thread of tweets

        Args:
            tweets: List of tweet contents
            **kwargs: Additional parameters

        Returns:
            dict: Result with all tweet IDs
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        if len(tweets) > self.MAX_THREAD_TWEETS:
            return {
                'success': False,
                'error': f'Thread too long: {len(tweets)} > {self.MAX_THREAD_TWEETS}'
            }

        tweet_ids = []
        urls = []
        reply_to = None

        for i, content in enumerate(tweets):
            try:
                # Truncate if needed
                if len(content) > self.MAX_TWEET_LENGTH:
                    content = content[:self.MAX_TWEET_LENGTH - 3] + '...'

                response = self.client.create_tweet(
                    text=content,
                    in_reply_to_tweet_id=reply_to
                )

                tweet_id = response.data['id']
                tweet_ids.append(tweet_id)
                urls.append(f"https://twitter.com/i/web/status/{tweet_id}")

                # Next tweet replies to this one
                reply_to = tweet_id

                logger.info(f"Posted thread tweet {i+1}/{len(tweets)}: {tweet_id}")

                # Add small delay between tweets to respect rate limits (3 seconds)
                if i < len(tweets) - 1:
                    time.sleep(3)

            except TweepyException as e:
                error_msg = f"Error posting thread tweet {i+1}: {e}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'error': error_msg,
                    'partial_tweet_ids': tweet_ids,
                    'completed': i
                }

        return {
            'success': True,
            'thread_id': tweet_ids[0],
            'tweet_ids': tweet_ids,
            'urls': urls,
            'tweet_count': len(tweet_ids),
            'thread_url': urls[0]
        }

    def split_into_tweets(self, content: str) -> List[str]:
        """
        Split long content into tweet-sized chunks

        Args:
            content: Long text content

        Returns:
            List of tweets
        """
        tweets = []
        paragraphs = content.split('\n\n')

        current_tweet = ""
        for paragraph in paragraphs:
            # If adding this paragraph exceeds limit, save current and start new
            if len(current_tweet) + len(paragraph) + 2 > self.MAX_TWEET_LENGTH:
                if current_tweet:
                    tweets.append(current_tweet.strip())
                current_tweet = paragraph
            else:
                if current_tweet:
                    current_tweet += "\n\n" + paragraph
                else:
                    current_tweet = paragraph

        # Add remaining
        if current_tweet:
            tweets.append(current_tweet.strip())

        # Add thread indicators
        if len(tweets) > 1:
            for i in range(len(tweets)):
                indicator = f"\n\n🧵 {i+1}/{len(tweets)}"
                if len(tweets[i]) + len(indicator) <= self.MAX_TWEET_LENGTH:
                    tweets[i] += indicator

        return tweets

    def upload_media(self, media_path: str) -> Optional[str]:
        """
        Upload media file

        Args:
            media_path: Path to media file

        Returns:
            Media ID string or None
        """
        if not self.api:
            logger.error("API v1.1 not authenticated")
            return None

        try:
            media = self.api.media_upload(media_path)
            logger.info(f"Uploaded media: {media.media_id}")
            return str(media.media_id)

        except TweepyException as e:
            logger.error(f"Media upload error: {e}")
            return None
