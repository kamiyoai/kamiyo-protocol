# -*- coding: utf-8 -*-
"""
Telegram Platform Poster
Posts exploit alerts to Telegram channels/groups
"""

import logging
from typing import Dict, List
import telegram
from telegram.error import TelegramError

from social.platforms.base import BasePlatformPoster

logger = logging.getLogger(__name__)


class TelegramPoster(BasePlatformPoster):
    """Posts to Telegram channels/groups"""

    MAX_MESSAGE_LENGTH = 4096

    def __init__(self, config: Dict):
        """
        Initialize Telegram poster

        Args:
            config: Configuration dict with:
                - bot_token: Telegram bot token
                - chat_ids: Dict of {channel_name: chat_id}
                - parse_mode: Message parse mode (HTML, Markdown, etc.)
        """
        super().__init__(config)
        self.bot_token = config.get('bot_token')
        self.chat_ids = config.get('chat_ids', {})
        self.parse_mode = config.get('parse_mode', 'HTML')

        self.bot = None
        self._authenticated = False

    def authenticate(self) -> bool:
        """Authenticate with Telegram Bot API"""
        try:
            self.bot = telegram.Bot(token=self.bot_token)
            # Test authentication
            bot_info = self.bot.get_me()
            self._authenticated = True
            logger.info(f"Authenticated to Telegram as @{bot_info.username}")
            return True

        except TelegramError as e:
            logger.error(f"Telegram authentication failed: {e}")
            self._authenticated = False
            return False

    def is_authenticated(self) -> bool:
        """Check if authenticated"""
        return self._authenticated

    def validate_content(self, content: str) -> bool:
        """Validate content for Telegram"""
        if len(content) > self.MAX_MESSAGE_LENGTH:
            logger.error(f"Content too long: {len(content)} > {self.MAX_MESSAGE_LENGTH}")
            return False
        return True

    def post(self, content: str, **kwargs) -> Dict:
        """
        Post to Telegram chats

        Args:
            content: Message content (HTML or Markdown)
            **kwargs:
                - chat_ids: List of chat IDs or names (optional)
                - parse_mode: Override default parse mode
                - disable_web_page_preview: Disable link previews
                - disable_notification: Send silently

        Returns:
            dict: Result
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        target_chats = kwargs.get('chat_ids', self.chat_ids)

        # If list of names provided, get IDs
        if isinstance(target_chats, list):
            target_chats = {
                name: self.chat_ids.get(name)
                for name in target_chats
                if name in self.chat_ids
            }

        if not target_chats:
            return {'success': False, 'error': 'No chat IDs configured'}

        parse_mode = kwargs.get('parse_mode', self.parse_mode)
        disable_web_page_preview = kwargs.get('disable_web_page_preview', False)
        disable_notification = kwargs.get('disable_notification', False)

        results = []
        errors = []

        for name, chat_id in target_chats.items():
            if not chat_id:
                errors.append(f"No chat ID for {name}")
                continue

            try:
                message = self.bot.send_message(
                    chat_id=chat_id,
                    text=content[:self.MAX_MESSAGE_LENGTH],
                    parse_mode=parse_mode,
                    disable_web_page_preview=disable_web_page_preview,
                    disable_notification=disable_notification
                )

                results.append({
                    'chat': name,
                    'message_id': message.message_id,
                    'chat_id': chat_id,
                    'success': True
                })

                logger.info(f"Posted to Telegram chat: {name} (ID: {chat_id})")

            except TelegramError as e:
                error_msg = f"Telegram error for {name}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    'chat': name,
                    'success': False,
                    'error': str(e)
                })

        success = any(r.get('success') for r in results)

        return {
            'success': success,
            'results': results,
            'errors': errors if errors else None,
            'post_count': sum(1 for r in results if r.get('success'))
        }

    def post_with_image(self, content: str, image_url: str, **kwargs) -> Dict:
        """
        Post message with image

        Args:
            content: Caption text
            image_url: Image URL
            **kwargs: Same as post()

        Returns:
            dict: Result
        """
        if not self.is_authenticated():
            if not self.authenticate():
                return {'success': False, 'error': 'Not authenticated'}

        target_chats = kwargs.get('chat_ids', self.chat_ids)

        if isinstance(target_chats, list):
            target_chats = {
                name: self.chat_ids.get(name)
                for name in target_chats
                if name in self.chat_ids
            }

        if not target_chats:
            return {'success': False, 'error': 'No chat IDs configured'}

        parse_mode = kwargs.get('parse_mode', self.parse_mode)

        results = []
        errors = []

        for name, chat_id in target_chats.items():
            if not chat_id:
                continue

            try:
                message = self.bot.send_photo(
                    chat_id=chat_id,
                    photo=image_url,
                    caption=content[:1024],  # Caption max 1024 chars
                    parse_mode=parse_mode
                )

                results.append({
                    'chat': name,
                    'message_id': message.message_id,
                    'success': True
                })

                logger.info(f"Posted image to Telegram chat: {name}")

            except TelegramError as e:
                error_msg = f"Telegram error for {name}: {e}"
                logger.error(error_msg)
                errors.append(error_msg)
                results.append({
                    'chat': name,
                    'success': False,
                    'error': str(e)
                })

        success = any(r.get('success') for r in results)

        return {
            'success': success,
            'results': results,
            'errors': errors if errors else None
        }
