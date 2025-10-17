# -*- coding: utf-8 -*-
"""
Social Media Platform Adapters
"""

from social.platforms.reddit import RedditPoster
from social.platforms.discord import DiscordPoster
from social.platforms.telegram import TelegramPoster
from social.platforms.x_twitter import XTwitterPoster

__all__ = [
    'RedditPoster',
    'DiscordPoster',
    'TelegramPoster',
    'XTwitterPoster',
]
