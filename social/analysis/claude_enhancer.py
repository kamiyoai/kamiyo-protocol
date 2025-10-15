# -*- coding: utf-8 -*-
"""
Claude AI-Enhanced Exploit Analysis
Uses Anthropic's Claude to make exploit reports more engaging and conversational

CRITICAL: This module still ONLY works with confirmed exploit data.
Claude enhances presentation, NOT security analysis.
"""

import os
import sys
from typing import Optional
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logger = logging.getLogger(__name__)

try:
    import anthropic
    CLAUDE_AVAILABLE = True
except ImportError:
    CLAUDE_AVAILABLE = False
    logger.warning("Anthropic library not installed. Claude enhancement disabled.")


class ClaudeEnhancer:
    """
    Enhance exploit reports with Claude AI for more engaging, conversational content

    This enhancer takes structured exploit data and makes it more readable
    and engaging for social media audiences while maintaining factual accuracy.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Claude enhancer

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
        """
        if not CLAUDE_AVAILABLE:
            logger.error("Anthropic library not installed. Install with: pip install anthropic")
            self.client = None
            return

        api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            logger.warning("No ANTHROPIC_API_KEY found. Claude enhancement disabled.")
            self.client = None
            return

        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-3-5-sonnet-20241022"  # Latest model

        # Brand guidelines
        self.brand_voice = """
KAMIYO Brand Voice Guidelines:
- Professional, analytical, data-driven
- NO emojis (except severity indicators: 🟢🟡🟠🔴)
- NO hype or sensationalism
- Clear, concise, fact-based
- Always credit sources
- Never speculate or predict
- Use "KAMIYO" (all caps) for brand name
"""

    def enhance_executive_summary(
        self,
        exploit_data: dict,
        base_summary: str,
        historical_context: Optional[dict] = None
    ) -> str:
        """
        Enhance executive summary with Claude for better engagement

        Args:
            exploit_data: Dictionary with exploit details
            base_summary: Template-generated summary
            historical_context: Optional historical context data

        Returns:
            Enhanced, conversational summary
        """
        if not self.client:
            logger.debug("Claude client not available. Returning base summary.")
            return base_summary

        try:
            # Build context for Claude
            context_info = ""
            if historical_context:
                if historical_context.get('ranking'):
                    context_info += f"\nHistorical Ranking: {historical_context['ranking']}"
                if historical_context.get('trend_direction'):
                    context_info += f"\nTrend: {historical_context['trend_direction']} {historical_context.get('trend_percentage', 0):.1f}%"

            prompt = f"""Transform this exploit report into an engaging, professional summary suitable for crypto Twitter.

CONFIRMED EXPLOIT DATA:
Protocol: {exploit_data.get('protocol', 'Unknown')}
Chain: {exploit_data.get('chain', 'Unknown')}
Loss Amount: ${exploit_data.get('loss_amount_usd', 0):,.0f}
Exploit Type: {exploit_data.get('exploit_type', 'Unknown')}
Source: {exploit_data.get('source', 'Unknown')}
{context_info}

BASE SUMMARY:
{base_summary}

REQUIREMENTS:
1. Make it engaging and readable for crypto Twitter audience
2. Keep it factual - use ONLY the confirmed data provided
3. Professional tone, data-driven
4. NO emojis except severity indicators (🟢🟡🟠🔴)
5. 2-3 sentences maximum
6. Include specific numbers ($X loss, Xth largest, etc.)
7. Credit the source
8. Use "KAMIYO" (all caps) if mentioning the platform
9. Never speculate or predict

OUTPUT:
Enhanced executive summary (2-3 sentences):"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=512,
                temperature=0.7,  # Some creativity, but not too much
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )

            enhanced = response.content[0].text.strip()
            logger.info(f"Enhanced summary with Claude for {exploit_data.get('protocol')}")
            return enhanced

        except Exception as e:
            logger.error(f"Claude enhancement failed: {e}. Using base summary.")
            return base_summary

    def generate_twitter_thread(
        self,
        exploit_data: dict,
        timeline: list,
        impact: dict,
        historical_context: Optional[dict] = None,
        engagement_hooks: Optional[list] = None
    ) -> list:
        """
        Generate an engaging Twitter thread with Claude

        Args:
            exploit_data: Exploit details
            timeline: List of timeline events
            impact: Impact summary data
            historical_context: Historical context
            engagement_hooks: Interesting facts

        Returns:
            List of tweets (each ≤280 chars)
        """
        if not self.client:
            logger.debug("Claude client not available. Generating template thread.")
            return self._generate_template_thread(exploit_data, impact)

        try:
            # Build timeline text
            timeline_text = "\n".join([
                f"- {event.get('time', 'Unknown')}: {event.get('description', '')}"
                for event in timeline[:4]  # First 4 events
            ])

            # Build context
            context_text = ""
            if historical_context:
                if historical_context.get('ranking'):
                    context_text += f"\n- {historical_context['ranking']}"
                if historical_context.get('trend_direction'):
                    context_text += f"\n- Trend: {historical_context['trend_direction']}"

            # Build hooks
            hooks_text = ""
            if engagement_hooks:
                hooks_text = "\n".join([f"- {hook}" for hook in engagement_hooks[:3]])

            prompt = f"""Create an engaging Twitter thread about this confirmed blockchain exploit.

EXPLOIT DATA:
Protocol: {exploit_data.get('protocol')}
Chain: {exploit_data.get('chain')}
Loss: ${exploit_data.get('loss_amount_usd', 0):,.0f}
Type: {exploit_data.get('exploit_type')}
Severity: {impact.get('severity_indicator', '🟠')}
Source: {exploit_data.get('source')}

TIMELINE:
{timeline_text}

HISTORICAL CONTEXT:
{context_text}

ENGAGEMENT HOOKS:
{hooks_text}

REQUIREMENTS:
1. Create a 4-6 tweet thread
2. Each tweet MUST be ≤280 characters (critical!)
3. Tweet 1: Alert with severity, protocol, loss amount
4. Tweet 2: What happened (attack type, how it worked)
5. Tweet 3: Timeline of events
6. Tweet 4: Historical context & significance
7. Tweet 5-6 (optional): Recovery status, implications
8. NO emojis except severity (🟢🟡🟠🔴)
9. Professional, data-driven tone
10. Credit source in thread
11. Use "KAMIYO" (all caps) for brand mentions
12. End with "Detected by KAMIYO Intelligence Platform"

OUTPUT FORMAT:
Tweet 1: [text]
Tweet 2: [text]
Tweet 3: [text]
etc."""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                temperature=0.7,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )

            thread_text = response.content[0].text.strip()

            # Parse tweets
            tweets = []
            for line in thread_text.split('\n'):
                line = line.strip()
                if line.startswith('Tweet '):
                    # Extract tweet text after "Tweet X:"
                    if ':' in line:
                        tweet = line.split(':', 1)[1].strip()
                        # Ensure ≤280 chars
                        if len(tweet) > 280:
                            tweet = tweet[:277] + '...'
                        tweets.append(tweet)

            if tweets:
                logger.info(f"Generated {len(tweets)}-tweet thread with Claude")
                return tweets
            else:
                logger.warning("Failed to parse Claude thread. Using template.")
                return self._generate_template_thread(exploit_data, impact)

        except Exception as e:
            logger.error(f"Claude thread generation failed: {e}. Using template.")
            return self._generate_template_thread(exploit_data, impact)

    def _generate_template_thread(self, exploit_data: dict, impact: dict) -> list:
        """Fallback template-based thread if Claude is unavailable"""
        severity = impact.get('severity_indicator', '🟠')
        amount = f"${exploit_data.get('loss_amount_usd', 0):,.0f}"

        tweets = [
            f"{severity} EXPLOIT ALERT\n\n{exploit_data.get('protocol')} on {exploit_data.get('chain')}\n💰 {amount} lost\n🔥 Attack: {exploit_data.get('exploit_type')}\n\n🧵 Thread 👇",
            f"What Happened:\n\n{exploit_data.get('protocol')} suffered a {exploit_data.get('exploit_type')} attack resulting in {amount} in losses. Reported by {exploit_data.get('source', 'external sources')}.",
            f"This incident highlights ongoing security challenges in the {exploit_data.get('chain')} DeFi ecosystem.\n\nDetected by KAMIYO Intelligence Platform.",
        ]

        return tweets

    def enhance_reddit_post(
        self,
        exploit_data: dict,
        base_post: str,
        max_length: int = 3000
    ) -> str:
        """
        Enhance Reddit post with Claude for better engagement

        Args:
            exploit_data: Exploit details
            base_post: Template-generated Reddit post
            max_length: Maximum post length

        Returns:
            Enhanced Reddit post
        """
        if not self.client:
            return base_post

        try:
            prompt = f"""Enhance this Reddit post about a blockchain exploit for r/CryptoCurrency.

BASE POST:
{base_post[:1000]}...  # First 1000 chars as example

EXPLOIT DATA:
Protocol: {exploit_data.get('protocol')}
Chain: {exploit_data.get('chain')}
Loss: ${exploit_data.get('loss_amount_usd', 0):,.0f}

REQUIREMENTS:
1. Make it more engaging while keeping all factual data
2. Use markdown formatting (headers, lists, bold, code blocks)
3. Add a brief "Key Takeaways" section at the top
4. Keep professional tone
5. NO speculation or predictions
6. Credit sources properly
7. Target length: {max_length} characters
8. Use "KAMIYO" (all caps) for brand

OUTPUT:
Enhanced Reddit post (markdown):"""

            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                temperature=0.7,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )

            enhanced = response.content[0].text.strip()

            # Truncate if needed
            if len(enhanced) > max_length:
                enhanced = enhanced[:max_length-3] + '...'

            logger.info(f"Enhanced Reddit post with Claude")
            return enhanced

        except Exception as e:
            logger.error(f"Claude Reddit enhancement failed: {e}")
            return base_post


# Example usage
if __name__ == "__main__":
    print("=" * 80)
    print("KAMIYO Claude AI Enhancer - Example")
    print("=" * 80)

    enhancer = ClaudeEnhancer()

    if not enhancer.client:
        print("\n⚠️  Claude not available (missing API key or library)")
        print("Set ANTHROPIC_API_KEY environment variable to enable")
        print("\nExample output with template fallback:\n")
    else:
        print("\n✅ Claude AI connected")
        print(f"Model: {enhancer.model}\n")

    # Example exploit data
    exploit_data = {
        'protocol': 'Curve Finance',
        'chain': 'Ethereum',
        'loss_amount_usd': 15_000_000,
        'exploit_type': 'Reentrancy',
        'source': 'Rekt News',
        'tx_hash': '0x1234567890abcdef'
    }

    base_summary = (
        "Curve Finance on Ethereum suffered a Reentrancy attack "
        "resulting in $15,000,000 in losses. The exploit was confirmed "
        "via transaction 0x12345678... and reported by Rekt News."
    )

    print("BASE SUMMARY:")
    print("-" * 80)
    print(base_summary)
    print()

    enhanced = enhancer.enhance_executive_summary(
        exploit_data,
        base_summary,
        historical_context={
            'ranking': 'This is the 3rd largest DeFi exploit this year',
            'trend_direction': 'UP',
            'trend_percentage': 35.0
        }
    )

    print("ENHANCED SUMMARY:")
    print("-" * 80)
    print(enhanced)
    print()

    print("=" * 80)
    print("Claude enhancement complete!")
    print("=" * 80)
