# -*- coding: utf-8 -*-
"""
Social Media Post Generator
Generates platform-specific content from exploit data
"""

import os
import sys
from typing import Dict, List
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.models import (
    ExploitData, SocialPost, PostTemplate, Platform,
    PostStatus, PostPriority
)


class PostGenerator:
    """Generates social media posts from exploit data"""

    # Platform templates
    TEMPLATES = {
        Platform.X_TWITTER: PostTemplate(
            platform=Platform.X_TWITTER,
            template_type='short',
            template=(
                "{protocol} on {chain} just got hit for {amount}. "
                "{exploit_type} exploit. "
                "TX: {tx_short}"
            ),
            max_length=280,
            supports_images=True,
            supports_links=True,
            supports_hashtags=True
        ),

        Platform.REDDIT: PostTemplate(
            platform=Platform.REDDIT,
            template_type='detailed',
            template=(
                "# 🚨 {protocol} Exploit - {amount} Lost\n\n"
                "**Chain:** {chain}\n\n"
                "**Loss Amount:** {amount} (${amount_raw:,.2f} USD)\n\n"
                "**Exploit Type:** {exploit_type}\n\n"
                "**Timestamp:** {timestamp}\n\n"
                "**Transaction Hash:** `{tx_hash}`\n\n"
                "**Recovery Status:** {recovery}\n\n"
                "---\n\n"
                "**Description:**\n\n"
                "{description}\n\n"
                "---\n\n"
                "*This exploit was detected and reported by [Kamiyo](https://kamiyo.ai) - "
                "Real-time cryptocurrency exploit intelligence aggregator.*\n\n"
                "*Source: {source}*"
            ),
            max_length=40000,
            supports_images=True,
            supports_links=True,
            supports_hashtags=False
        ),

        Platform.DISCORD: PostTemplate(
            platform=Platform.DISCORD,
            template_type='embed',
            template=(
                "🚨 **{protocol} Exploit Alert** 🚨\n\n"
                "💰 **Loss Amount:** {amount}\n"
                "⛓️ **Chain:** {chain}\n"
                "🔥 **Exploit Type:** {exploit_type}\n"
                "⏰ **Time:** {timestamp}\n"
                "♻️ **Recovery:** {recovery}\n\n"
                "🔗 **Transaction:** `{tx_hash}`\n\n"
                "📊 **Source:** {source}\n\n"
                "---\n"
                "*Detected by Kamiyo Intelligence Platform*"
            ),
            max_length=2000,
            supports_images=True,
            supports_links=True,
            supports_hashtags=False
        ),

        Platform.TELEGRAM: PostTemplate(
            platform=Platform.TELEGRAM,
            template_type='short',
            template=(
                "🚨 <b>{protocol} Exploit</b> 🚨\n\n"
                "💰 Loss: <b>{amount}</b>\n"
                "⛓️ Chain: {chain}\n"
                "🔥 Type: {exploit_type}\n"
                "⏰ {timestamp}\n\n"
                "🔗 TX: <code>{tx_hash}</code>\n\n"
                "♻️ Recovery: {recovery}\n\n"
                "📊 Source: {source}\n"
                "🤖 <a href='https://kamiyo.ai'>Kamiyo Intelligence</a>"
            ),
            max_length=4096,
            supports_images=True,
            supports_links=True,
            supports_hashtags=False
        ),
    }

    def __init__(self):
        """Initialize post generator"""
        self.emoji_map = {
            'Flash Loan': '⚡',
            'Reentrancy': '🔄',
            'Price Oracle': '📊',
            'Access Control': '🔐',
            'Integer Overflow': '🔢',
            'Logic Error': '🧠',
            'Front Running': '🏃',
            'Governance Attack': '🗳️',
            'Bridge Exploit': '🌉',
            'Unknown': '❓',
        }

        self.chain_emoji_map = {
            'Ethereum': '⟠',
            'BSC': '🔶',
            'Polygon': '🟣',
            'Arbitrum': '🔵',
            'Optimism': '🔴',
            'Avalanche': '🔺',
            'Fantom': '👻',
            'Solana': '🌐',
        }

    def generate_post(
        self,
        exploit: ExploitData,
        platforms: List[Platform]
    ) -> SocialPost:
        """
        Generate social media post from exploit data

        Args:
            exploit: Exploit data from Kamiyo platform
            platforms: List of platforms to generate content for

        Returns:
            SocialPost with platform-specific content
        """
        post = SocialPost(exploit_data=exploit)
        post.platforms = platforms
        post.status = PostStatus.DRAFT

        # Generate content for each platform
        for platform in platforms:
            template = self.TEMPLATES.get(platform)
            if template:
                content = self._generate_platform_content(exploit, template)
                post.content[platform] = content

        # Generate tags
        post.tags = self._generate_tags(exploit)

        # Mark as ready for review
        if post.is_ready_for_review:
            post.status = PostStatus.PENDING_REVIEW

        return post

    def _generate_platform_content(
        self,
        exploit: ExploitData,
        template: PostTemplate
    ) -> str:
        """Generate content for a specific platform"""

        # Add emojis to exploit type and chain
        exploit_emoji = self.emoji_map.get(exploit.exploit_type, '❓')
        chain_emoji = self.chain_emoji_map.get(exploit.chain, '⛓️')

        # Render template
        content = template.render(
            exploit,
            exploit_emoji=exploit_emoji,
            chain_emoji=chain_emoji
        )

        return content

    def _generate_tags(self, exploit: ExploitData) -> List[str]:
        """Generate relevant hashtags/tags"""
        tags = [
            'DeFi',
            'CryptoSecurity',
            exploit.chain.replace(' ', ''),
            'Exploit',
        ]

        # Add priority-based tags
        if exploit.priority == PostPriority.CRITICAL:
            tags.append('CriticalAlert')
        elif exploit.priority == PostPriority.HIGH:
            tags.append('HighSeverity')

        # Add exploit type tag
        exploit_type_tag = exploit.exploit_type.replace(' ', '')
        tags.append(exploit_type_tag)

        return tags

    def generate_thread(
        self,
        exploit: ExploitData,
        platform: Platform = Platform.X_TWITTER
    ) -> List[str]:
        """
        Generate a thread (multiple posts) for detailed exploit coverage

        Args:
            exploit: Exploit data
            platform: Platform to generate thread for

        Returns:
            List of post contents for the thread
        """
        thread = []

        # Thread post 1: Hook (conversational)
        thread.append(
            f"{exploit.protocol} on {exploit.chain} just got exploited for {exploit.formatted_amount}. Here's what happened..."
        )

        # Thread post 2: Details
        thread.append(
            f"Exploit Details:\n\n"
            f"Type: {exploit.exploit_type}\n"
            f"Chain: {exploit.chain}\n"
            f"Time: {exploit.timestamp.strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"TX: {exploit.tx_hash[:10]}...{exploit.tx_hash[-8:]}"
        )

        # Thread post 3: Description (if available)
        if exploit.description:
            desc = exploit.description[:250] + '...' if len(exploit.description) > 250 else exploit.description
            thread.append(
                f"What Happened:\n\n{desc}"
            )

        # Thread post 4: Recovery status
        thread.append(
            f"Recovery Status: {exploit.recovery_status or 'Unknown'}\n\n"
            f"Stay safe in #DeFi\n\n"
            f"Detected by Kamiyo Intelligence Platform"
        )

        return thread

    def customize_for_audience(
        self,
        post: SocialPost,
        platform: Platform,
        audience: str
    ) -> str:
        """
        Customize post content for specific audience/community

        Args:
            post: Generated post
            platform: Target platform
            audience: Audience type (e.g., 'technical', 'general', 'traders')

        Returns:
            Customized content
        """
        base_content = post.content.get(platform, '')

        if audience == 'technical':
            # Add more technical details
            exploit = post.exploit_data
            technical_note = (
                f"\n\n**Technical Details:**\n"
                f"Transaction: {exploit.tx_hash}\n"
                f"Block Explorer: [View Transaction]"
            )
            return base_content + technical_note

        elif audience == 'traders':
            # Add market impact context
            trader_note = (
                f"\n\n**Market Impact:**\n"
                f"Monitor {post.exploit_data.protocol} token price for potential volatility."
            )
            return base_content + trader_note

        elif audience == 'security':
            # Add security analysis context
            security_note = (
                f"\n\n**Security Analysis:**\n"
                f"Vulnerability Type: {post.exploit_data.exploit_type}\n"
                f"Recommend reviewing similar code patterns in your protocols."
            )
            return base_content + security_note

        return base_content


# Example usage
if __name__ == "__main__":
    # Example exploit data
    exploit = ExploitData(
        tx_hash="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        protocol="Uniswap",
        chain="Ethereum",
        loss_amount_usd=2_500_000.00,
        exploit_type="Flash Loan",
        timestamp=datetime.utcnow(),
        description="Flash loan attack exploited price oracle manipulation vulnerability",
        recovery_status="Partial Recovery - 60% recovered",
        source="Rekt News",
        source_url="https://rekt.news/example"
    )

    # Generate post
    generator = PostGenerator()
    post = generator.generate_post(
        exploit,
        platforms=[Platform.X_TWITTER, Platform.REDDIT, Platform.DISCORD, Platform.TELEGRAM]
    )

    # Print generated content
    print("="*60)
    print("GENERATED SOCIAL MEDIA POST")
    print("="*60)
    print(f"\nExploit: {exploit.protocol} - {exploit.formatted_amount}")
    print(f"Priority: {exploit.priority.value}")
    print(f"Status: {post.status.value}\n")

    for platform, content in post.content.items():
        print(f"\n{'-'*60}")
        print(f"{platform.value.upper()} POST:")
        print(f"{'-'*60}")
        print(content)

    print(f"\n{'-'*60}")
    print(f"TAGS: {', '.join(post.tags)}")
    print(f"{'-'*60}")
