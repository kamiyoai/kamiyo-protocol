# -*- coding: utf-8 -*-
"""
Social Media Post Models
Data models for social media posting system
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum


class PostStatus(Enum):
    """Post lifecycle status"""
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    POSTED = "posted"
    FAILED = "failed"


class Platform(Enum):
    """Supported social media platforms"""
    REDDIT = "reddit"
    DISCORD = "discord"
    TELEGRAM = "telegram"
    X_TWITTER = "x_twitter"
    LINKEDIN = "linkedin"  # Future
    FACEBOOK = "facebook"  # Future


class PostPriority(Enum):
    """Post urgency level"""
    LOW = "low"  # < $100k
    MEDIUM = "medium"  # $100k - $1M
    HIGH = "high"  # $1M - $10M
    CRITICAL = "critical"  # > $10M


@dataclass
class ExploitData:
    """Exploit information from Kamiyo platform"""
    tx_hash: str
    protocol: str
    chain: str
    loss_amount_usd: float
    exploit_type: str
    timestamp: datetime
    description: Optional[str] = None
    recovery_status: Optional[str] = None
    source: Optional[str] = None
    source_url: Optional[str] = None

    @property
    def priority(self) -> PostPriority:
        """Determine post priority based on loss amount"""
        if self.loss_amount_usd >= 10_000_000:
            return PostPriority.CRITICAL
        elif self.loss_amount_usd >= 1_000_000:
            return PostPriority.HIGH
        elif self.loss_amount_usd >= 100_000:
            return PostPriority.MEDIUM
        else:
            return PostPriority.LOW

    @property
    def formatted_amount(self) -> str:
        """Format loss amount for display"""
        if self.loss_amount_usd >= 1_000_000:
            return f"${self.loss_amount_usd / 1_000_000:.2f}M"
        elif self.loss_amount_usd >= 1_000:
            return f"${self.loss_amount_usd / 1_000:.1f}K"
        else:
            return f"${self.loss_amount_usd:.2f}"


@dataclass
class SocialPost:
    """Social media post with platform-specific content"""
    exploit_data: ExploitData
    post_id: Optional[str] = None
    status: PostStatus = PostStatus.DRAFT
    created_at: datetime = field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
    posted_at: Optional[datetime] = None

    # Platform-specific content
    content: Dict[Platform, str] = field(default_factory=dict)

    # Post metadata
    platforms: List[Platform] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    images: List[str] = field(default_factory=list)

    # Posting results
    posting_results: Dict[Platform, Dict] = field(default_factory=dict)

    @property
    def is_ready_for_review(self) -> bool:
        """Check if post is ready for human review"""
        return (
            self.status == PostStatus.DRAFT and
            len(self.content) > 0 and
            len(self.platforms) > 0
        )

    @property
    def is_approved(self) -> bool:
        """Check if post is approved for posting"""
        return self.status == PostStatus.APPROVED

    def mark_reviewed(self, approved: bool):
        """Mark post as reviewed"""
        self.reviewed_at = datetime.utcnow()
        self.status = PostStatus.APPROVED if approved else PostStatus.REJECTED

    def mark_posted(self):
        """Mark post as successfully posted"""
        self.posted_at = datetime.utcnow()
        self.status = PostStatus.POSTED

    def mark_failed(self):
        """Mark post as failed"""
        self.status = PostStatus.FAILED


@dataclass
class PostTemplate:
    """Template for generating platform-specific content"""
    platform: Platform
    template_type: str  # 'short', 'detailed', 'thread'
    template: str
    max_length: int
    supports_images: bool = True
    supports_links: bool = True
    supports_hashtags: bool = True

    def render(self, exploit: ExploitData, **kwargs) -> str:
        """Render template with exploit data"""
        context = {
            'protocol': exploit.protocol,
            'chain': exploit.chain,
            'amount': exploit.formatted_amount,
            'amount_raw': exploit.loss_amount_usd,
            'exploit_type': exploit.exploit_type,
            'tx_hash': exploit.tx_hash,
            'tx_short': exploit.tx_hash[:8] + '...' + exploit.tx_hash[-6:],
            'timestamp': exploit.timestamp.strftime('%Y-%m-%d %H:%M UTC'),
            'recovery': exploit.recovery_status or 'Unknown',
            'source': exploit.source or 'Kamiyo',
            'description': exploit.description or 'No description available',
            **kwargs
        }

        content = self.template.format(**context)

        # Truncate if needed
        if len(content) > self.max_length:
            content = content[:self.max_length - 3] + '...'

        return content


@dataclass
class PlatformConfig:
    """Configuration for a social media platform"""
    platform: Platform
    enabled: bool
    credentials: Dict[str, str]
    targets: List[str]  # Subreddits, channels, groups, etc.
    rate_limit: int  # Posts per hour
    retry_attempts: int = 3
    retry_delay: int = 60  # Seconds
