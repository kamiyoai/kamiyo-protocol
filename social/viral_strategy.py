"""
Viral Posting Strategy
Intelligently filters and categorizes exploits for maximum impact
"""
from enum import Enum
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from social.models import ExploitData

class PostingStrategy(Enum):
    """Strategy for posting an exploit"""
    MAJOR_EVENT = "major"  # High-value, trending potential
    NICHE_TECHNICAL = "niche"  # Unique, appeals to technical audience
    SKIP = "skip"  # Not worth posting


class ViralFilter:
    """Determines posting strategy and platforms for each exploit"""

    # Major protocols that get automatic attention
    MAJOR_PROTOCOLS = {
        'uniswap', 'compound', 'aave', 'curve', 'maker', 'makerdao',
        'pancakeswap', 'sushiswap', 'balancer', 'yearn', 'synthetix',
        'lido', 'rocket pool', 'frax', 'convex', 'olympus',
        'gmx', 'dydx', 'perpetual protocol'
    }

    # Chains that signal "unique coverage"
    NICHE_CHAINS = {
        'cosmos', 'osmosis', 'juno', 'secret', 'terra2',
        'near', 'aptos', 'sui', 'starknet', 'zksync',
        'scroll', 'linea', 'base', 'mantle', 'injective'
    }

    # Exploit types that are technically interesting
    INTERESTING_EXPLOIT_TYPES = {
        'zero-day', 'governance attack', 'oracle manipulation',
        'cross-chain bridge', 'mev attack', 'consensus exploit',
        'cryptographic flaw', 'formal verification bypass',
        'novel attack vector', 'social engineering'
    }

    def __init__(
        self,
        major_threshold_usd: float = 5_000_000,
        niche_threshold_usd: float = 500_000,
        max_age_hours: int = 48
    ):
        """
        Args:
            major_threshold_usd: Minimum loss for major event (default $5M)
            niche_threshold_usd: Minimum loss for niche post (default $500K)
            max_age_hours: Maximum age for "breaking news" (default 48h)
        """
        self.major_threshold = major_threshold_usd
        self.niche_threshold = niche_threshold_usd
        self.max_age = timedelta(hours=max_age_hours)

    def analyze_exploit(self, exploit: ExploitData) -> Dict:
        """
        Analyze exploit and determine posting strategy

        Returns:
            {
                'strategy': PostingStrategy,
                'reasoning': str,
                'viral_score': int (0-100),
                'platforms': List[str],
                'hashtags': List[str],
                'subreddits': List[str]
            }
        """
        age = datetime.utcnow() - exploit.timestamp
        protocol_lower = (exploit.protocol or '').lower()
        chain_lower = (exploit.chain or '').lower()
        exploit_type_lower = (exploit.exploit_type or '').lower()

        # Calculate viral score
        viral_score = 0
        reasoning_parts = []

        # Factor 1: Amount (0-40 points)
        if exploit.loss_amount_usd >= 50_000_000:
            viral_score += 40
            reasoning_parts.append(f"Massive ${exploit.loss_amount_usd/1_000_000:.1f}M loss")
        elif exploit.loss_amount_usd >= 10_000_000:
            viral_score += 30
            reasoning_parts.append(f"Major ${exploit.loss_amount_usd/1_000_000:.1f}M loss")
        elif exploit.loss_amount_usd >= 5_000_000:
            viral_score += 20
            reasoning_parts.append(f"Significant ${exploit.loss_amount_usd/1_000_000:.1f}M loss")
        elif exploit.loss_amount_usd >= 1_000_000:
            viral_score += 10
            reasoning_parts.append(f"Notable ${exploit.loss_amount_usd/1_000_000:.1f}M loss")

        # Factor 2: Protocol Recognition (0-30 points)
        is_major_protocol = any(major in protocol_lower for major in self.MAJOR_PROTOCOLS)
        if is_major_protocol:
            viral_score += 30
            reasoning_parts.append("Major protocol with large community")

        # Factor 3: Timing (0-20 points)
        if age < timedelta(hours=6):
            viral_score += 20
            reasoning_parts.append("Breaking news (<6 hours old)")
        elif age < timedelta(hours=24):
            viral_score += 15
            reasoning_parts.append("Recent news (<24 hours)")
        elif age < self.max_age:
            viral_score += 5
            reasoning_parts.append("Still newsworthy")

        # Factor 4: Uniqueness (0-10 points)
        is_niche_chain = any(niche in chain_lower for niche in self.NICHE_CHAINS)
        is_interesting_type = any(interesting in exploit_type_lower for interesting in self.INTERESTING_EXPLOIT_TYPES)

        if is_niche_chain:
            viral_score += 5
            reasoning_parts.append(f"Unique coverage: {exploit.chain}")

        if is_interesting_type:
            viral_score += 5
            reasoning_parts.append(f"Interesting attack: {exploit.exploit_type}")

        # Determine strategy
        strategy = self._determine_strategy(
            viral_score,
            exploit.loss_amount_usd,
            is_major_protocol,
            is_niche_chain,
            is_interesting_type,
            age
        )

        # Determine platforms and targeting
        platforms = self._get_platforms(strategy, is_major_protocol, is_niche_chain)
        hashtags = self._get_hashtags(exploit, strategy, is_major_protocol)
        subreddits = self._get_subreddits(exploit, strategy, is_major_protocol, is_niche_chain)

        return {
            'strategy': strategy,
            'reasoning': ' | '.join(reasoning_parts) if reasoning_parts else 'Below threshold',
            'viral_score': viral_score,
            'platforms': platforms,
            'hashtags': hashtags,
            'subreddits': subreddits,
            'is_major_protocol': is_major_protocol,
            'is_niche_chain': is_niche_chain,
            'is_interesting_type': is_interesting_type,
            'age_hours': age.total_seconds() / 3600
        }

    def _determine_strategy(
        self,
        viral_score: int,
        amount_usd: float,
        is_major_protocol: bool,
        is_niche_chain: bool,
        is_interesting_type: bool,
        age: timedelta
    ) -> PostingStrategy:
        """Determine which strategy to use"""

        # Skip if too old
        if age > self.max_age:
            return PostingStrategy.SKIP

        # Major event: High viral score OR big protocol with big loss
        if viral_score >= 60:
            return PostingStrategy.MAJOR_EVENT

        if is_major_protocol and amount_usd >= self.major_threshold:
            return PostingStrategy.MAJOR_EVENT

        # Niche: Unique coverage opportunity
        if (is_niche_chain or is_interesting_type) and amount_usd >= self.niche_threshold:
            return PostingStrategy.NICHE_TECHNICAL

        # Skip everything else
        return PostingStrategy.SKIP

    def _get_platforms(
        self,
        strategy: PostingStrategy,
        is_major_protocol: bool,
        is_niche_chain: bool
    ) -> List[str]:
        """Determine which platforms to post to"""

        if strategy == PostingStrategy.SKIP:
            return []

        platforms = []

        if strategy == PostingStrategy.MAJOR_EVENT:
            # Post everywhere for major events
            platforms = ['twitter', 'reddit_cryptocurrency', 'reddit_defi']
            if is_major_protocol:
                platforms.append('reddit_ethereum')

        elif strategy == PostingStrategy.NICHE_TECHNICAL:
            # Technical audience for niche content
            platforms = ['twitter']
            if is_niche_chain:
                platforms.append('reddit_chain_specific')
            platforms.append('reddit_ethdev')

        return platforms

    def _get_hashtags(
        self,
        exploit: ExploitData,
        strategy: PostingStrategy,
        is_major_protocol: bool
    ) -> List[str]:
        """Generate hashtags for Twitter/X"""

        if strategy == PostingStrategy.SKIP:
            return []

        hashtags = ['#CryptoSecurity', '#DeFi']

        if strategy == PostingStrategy.MAJOR_EVENT:
            hashtags.extend(['#CryptoNews', '#Crypto', '#Blockchain'])
            if exploit.loss_amount_usd >= 10_000_000:
                hashtags.append('#CryptoHack')

        # Add protocol-specific hashtag
        protocol_tag = exploit.protocol.replace(' ', '').replace('-', '')
        hashtags.append(f'#{protocol_tag}')

        # Add chain hashtag
        chain_tag = exploit.chain.replace(' ', '')
        if chain_tag.lower() not in ['ethereum']:  # Skip obvious ones
            hashtags.append(f'#{chain_tag}')

        return hashtags[:5]  # Max 5 hashtags for best engagement

    def _get_subreddits(
        self,
        exploit: ExploitData,
        strategy: PostingStrategy,
        is_major_protocol: bool,
        is_niche_chain: bool
    ) -> List[str]:
        """Determine which subreddits to target"""

        if strategy == PostingStrategy.SKIP:
            return []

        subreddits = []

        if strategy == PostingStrategy.MAJOR_EVENT:
            # High-traffic subreddits
            subreddits = [
                'CryptoCurrency',  # 3.5M members - biggest crypto sub
                'defi',  # 200K members - DeFi focused
            ]

            if is_major_protocol or exploit.loss_amount_usd >= 10_000_000:
                subreddits.append('ethereum')  # 1.5M members

        elif strategy == PostingStrategy.NICHE_TECHNICAL:
            # Technical/developer subreddits
            subreddits = ['ethdev']  # 100K developers

            # Chain-specific subs
            chain_lower = exploit.chain.lower()
            if 'cosmos' in chain_lower or 'osmosis' in chain_lower:
                subreddits.append('cosmosnetwork')
            elif 'solana' in chain_lower:
                subreddits.append('solana')
            elif 'near' in chain_lower:
                subreddits.append('nearprotocol')
            elif 'avalanche' in chain_lower or 'avax' in chain_lower:
                subreddits.append('Avax')

        return subreddits


def format_viral_post(exploit: ExploitData, analysis: Dict, platform: str) -> str:
    """
    Format post optimized for virality on specific platform

    Args:
        exploit: Exploit data
        analysis: Output from ViralFilter.analyze_exploit()
        platform: 'twitter' or 'reddit'

    Returns:
        Formatted post content
    """
    if platform == 'twitter':
        return _format_twitter_viral(exploit, analysis)
    elif platform.startswith('reddit'):
        return _format_reddit_viral(exploit, analysis)
    else:
        raise ValueError(f"Unknown platform: {platform}")


def _format_twitter_viral(exploit: ExploitData, analysis: Dict) -> str:
    """Format for Twitter/X with maximum viral potential"""

    # Hook: Start with the shocking part
    if analysis['strategy'] == PostingStrategy.MAJOR_EVENT:
        hook = f"🚨 BREAKING: ${exploit.loss_amount_usd/1_000_000:.1f}M stolen from {exploit.protocol}"
    else:
        hook = f"🔍 {exploit.chain} Security Alert: {exploit.protocol} exploited"

    # Core info
    details = [
        f"\n💰 Loss: {exploit.formatted_amount}",
        f"⛓️ Chain: {exploit.chain}",
        f"🔥 Type: {exploit.exploit_type}",
    ]

    # Add urgency/recency
    age_hours = analysis['age_hours']
    if age_hours < 6:
        details.append(f"⏰ JUST NOW ({int(age_hours)}h ago)")

    # Call to action
    cta = "\n\n🔗 Full analysis: kamiyo.ai"

    # Hashtags
    hashtags = '\n\n' + ' '.join(analysis['hashtags'])

    tweet = hook + ''.join(details) + cta + hashtags

    # Ensure under 280 chars
    if len(tweet) > 280:
        # Truncate details, keep hook and CTA
        tweet = hook + details[0] + cta + '\n\n' + ' '.join(analysis['hashtags'][:3])

    return tweet


def _format_reddit_viral(exploit: ExploitData, analysis: Dict) -> Dict[str, str]:
    """Format for Reddit with engaging title and detailed body"""

    # Title: Attention-grabbing but not clickbait
    if analysis['strategy'] == PostingStrategy.MAJOR_EVENT:
        if exploit.loss_amount_usd >= 10_000_000:
            title = f"🚨 {exploit.protocol} Hacked for ${exploit.loss_amount_usd/1_000_000:.1f}M - One of the Largest {exploit.chain} Exploits"
        else:
            title = f"{exploit.protocol} Suffers ${exploit.loss_amount_usd/1_000_000:.1f}M Exploit on {exploit.chain}"
    else:
        title = f"[Technical Analysis] {exploit.protocol} Exploit: {exploit.exploit_type} on {exploit.chain}"

    # Body: Detailed, valuable content
    body_parts = [
        f"**Protocol:** {exploit.protocol}",
        f"**Chain:** {exploit.chain}",
        f"**Loss Amount:** {exploit.formatted_amount}",
        f"**Exploit Type:** {exploit.exploit_type}",
        f"**Transaction:** `{exploit.tx_hash}`",
        "",
        "---",
        "",
    ]

    if exploit.description:
        body_parts.append(f"**Details:**\n\n{exploit.description}")
        body_parts.append("")

    # Add value-add commentary
    if analysis['strategy'] == PostingStrategy.MAJOR_EVENT:
        body_parts.append("**Community Impact:**")
        body_parts.append(f"This represents a significant security event in the {exploit.chain} ecosystem. ")
        body_parts.append("Users should verify their positions and check if their funds are affected.")
    else:
        body_parts.append("**Technical Significance:**")
        body_parts.append(f"This {exploit.exploit_type} on {exploit.chain} represents an interesting attack vector ")
        body_parts.append("that hasn't been widely covered yet.")

    body_parts.extend([
        "",
        "---",
        "",
        f"*Source: {exploit.source}*",
        "",
        "*This is an automated security alert from [Kamiyo.ai](https://kamiyo.ai) - Real-time exploit intelligence*"
    ])

    return {
        'title': title[:300],  # Reddit title limit
        'body': '\n'.join(body_parts)
    }


# Example usage
if __name__ == '__main__':
    from social.models import ExploitData
    from datetime import datetime

    # Test with major event
    major_exploit = ExploitData(
        tx_hash='0xabc...',
        protocol='Uniswap V3',
        chain='Ethereum',
        loss_amount_usd=15_000_000,
        exploit_type='Oracle Manipulation',
        timestamp=datetime.utcnow(),
        description='Major DeFi protocol exploited',
        source='BlockSec'
    )

    filter = ViralFilter()
    result = filter.analyze_exploit(major_exploit)

    print("=" * 80)
    print("VIRAL STRATEGY ANALYSIS")
    print("=" * 80)
    print(f"Strategy: {result['strategy'].value}")
    print(f"Viral Score: {result['viral_score']}/100")
    print(f"Reasoning: {result['reasoning']}")
    print(f"Platforms: {result['platforms']}")
    print(f"Hashtags: {result['hashtags']}")
    print(f"Subreddits: {result['subreddits']}")
    print()
    print("TWITTER POST:")
    print("-" * 80)
    print(format_viral_post(major_exploit, result, 'twitter'))
    print()
