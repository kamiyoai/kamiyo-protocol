# -*- coding: utf-8 -*-
"""
Aggregator Registry for kamiyo.ai Platform
Manages multiple protocol aggregators with dynamic loading
"""

from typing import Dict, List, Any, Optional
from aggregators.base import BaseAggregator
from platform.config import is_feature_enabled, get_limit
import importlib
import logging

logger = logging.getLogger(__name__)


class AggregatorRegistry:
    """
    Central registry for all protocol aggregators

    Dynamically loads and manages aggregators based on:
    - Subscription tier
    - Protocol enablement
    - Resource limits
    """

    def __init__(self):
        self._aggregators: Dict[str, BaseAggregator] = {}
        self._available_protocols: Dict[str, Dict[str, Any]] = {}
        self._load_protocol_definitions()

    def _load_protocol_definitions(self):
        """
        Load available protocol definitions

        Each protocol has:
        - name: Protocol name
        - aggregator_class: Python class path
        - tier_required: Minimum tier needed
        - category: DEX/Lending/Bridge/etc.
        """
        self._available_protocols = {
            # Existing KAMIYO aggregators
            'hyperliquid_hlp': {
                'name': 'Hyperliquid HLP',
                'class_path': 'aggregators.hyperliquid_hlp.HyperliquidHLPAggregator',
                'tier_required': 'open_source',
                'category': 'dex',
                'chains': ['hyperliquid']
            },
            'hyperliquid_oracle': {
                'name': 'Hyperliquid Oracle',
                'class_path': 'aggregators.hyperliquid_oracle.HyperliquidOracleAggregator',
                'tier_required': 'open_source',
                'category': 'dex',
                'chains': ['hyperliquid']
            },
            'certik': {
                'name': 'CertiK',
                'class_path': 'aggregators.certik.CertiKAggregator',
                'tier_required': 'basic',
                'category': 'security',
                'chains': ['multi-chain']
            },
            'peckshield': {
                'name': 'PeckShield',
                'class_path': 'aggregators.peckshield.PeckShieldAggregator',
                'tier_required': 'basic',
                'category': 'security',
                'chains': ['multi-chain']
            },
            'slowmist': {
                'name': 'SlowMist',
                'class_path': 'aggregators.slowmist.SlowMistAggregator',
                'tier_required': 'basic',
                'category': 'security',
                'chains': ['multi-chain']
            },
            'immunefi': {
                'name': 'Immunefi',
                'class_path': 'aggregators.immunefi.ImmunefiAggregator',
                'tier_required': 'basic',
                'category': 'bug_bounty',
                'chains': ['multi-chain']
            },
            'forta': {
                'name': 'Forta Network',
                'class_path': 'aggregators.forta.FortaAggregator',
                'tier_required': 'pro',
                'category': 'on_chain',
                'chains': ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism']
            },
            'onchain': {
                'name': 'On-Chain Monitor',
                'class_path': 'aggregators.onchain_monitor.OnChainMonitor',
                'tier_required': 'pro',
                'category': 'on_chain',
                'chains': ['ethereum', 'bsc', 'polygon']
            },
            'defillama': {
                'name': 'DefiLlama',
                'class_path': 'aggregators.defillama.DefiLlamaAggregator',
                'tier_required': 'pro',
                'category': 'analytics',
                'chains': ['multi-chain']
            },
            'rekt_news': {
                'name': 'Rekt News',
                'class_path': 'aggregators.rekt_news.RektNewsAggregator',
                'tier_required': 'basic',
                'category': 'news',
                'chains': ['multi-chain']
            },
            'blocksec': {
                'name': 'BlockSec',
                'class_path': 'aggregators.blocksec.BlockSecAggregator',
                'tier_required': 'pro',
                'category': 'security',
                'chains': ['multi-chain']
            },
            'chainalysis': {
                'name': 'Chainalysis',
                'class_path': 'aggregators.chainalysis.ChainalysisAggregator',
                'tier_required': 'enterprise',
                'category': 'forensics',
                'chains': ['multi-chain']
            },
            'twitter': {
                'name': 'Twitter Security Monitor',
                'class_path': 'aggregators.twitter.TwitterAggregator',
                'tier_required': 'pro',
                'category': 'social',
                'chains': ['multi-chain']
            },
            'telegram': {
                'name': 'Telegram Monitor',
                'class_path': 'aggregators.telegram_monitor.TelegramMonitor',
                'tier_required': 'pro',
                'category': 'social',
                'chains': ['multi-chain']
            },
            'discord': {
                'name': 'Discord Monitor',
                'class_path': 'aggregators.discord_monitor.DiscordMonitor',
                'tier_required': 'pro',
                'category': 'social',
                'chains': ['multi-chain']
            },
            'github': {
                'name': 'GitHub Security Advisories',
                'class_path': 'aggregators.github_advisories.GitHubAdvisoriesAggregator',
                'tier_required': 'basic',
                'category': 'code',
                'chains': ['multi-chain']
            },
            'hackerone': {
                'name': 'HackerOne',
                'class_path': 'aggregators.hackerone.HackerOneAggregator',
                'tier_required': 'pro',
                'category': 'bug_bounty',
                'chains': ['multi-chain']
            },
            'arbitrum': {
                'name': 'Arbitrum Security',
                'class_path': 'aggregators.arbitrum_security.ArbitrumSecurityAggregator',
                'tier_required': 'pro',
                'category': 'layer2',
                'chains': ['arbitrum']
            },
            'cosmos': {
                'name': 'Cosmos Security',
                'class_path': 'aggregators.cosmos_security.CosmosSecurityAggregator',
                'tier_required': 'pro',
                'category': 'cosmos',
                'chains': ['cosmos']
            },
        }

    def register_aggregator(
        self,
        protocol: str,
        aggregator: BaseAggregator
    ):
        """
        Register an aggregator instance

        Args:
            protocol: Protocol identifier
            aggregator: Aggregator instance
        """
        self._aggregators[protocol] = aggregator
        logger.info(f"Registered aggregator: {protocol}")

    def load_aggregator(self, protocol: str) -> Optional[BaseAggregator]:
        """
        Dynamically load aggregator for protocol

        Args:
            protocol: Protocol identifier

        Returns:
            Aggregator instance or None
        """
        if protocol in self._aggregators:
            return self._aggregators[protocol]

        protocol_def = self._available_protocols.get(protocol)
        if not protocol_def:
            logger.error(f"Unknown protocol: {protocol}")
            return None

        try:
            module_path, class_name = protocol_def['class_path'].rsplit('.', 1)
            module = importlib.import_module(module_path)
            aggregator_class = getattr(module, class_name)

            aggregator = aggregator_class()

            self.register_aggregator(protocol, aggregator)

            return aggregator

        except Exception as e:
            logger.error(f"Failed to load aggregator for {protocol}: {e}")
            return None

    def get_available_protocols(
        self,
        tier: str = 'open_source',
        category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of available protocols for tier

        Args:
            tier: Subscription tier
            category: Filter by category

        Returns:
            List of available protocols
        """
        tier_hierarchy = {
            'open_source': 0,
            'cloud_basic': 1,
            'cloud_pro': 2,
            'cloud_enterprise': 3
        }

        user_tier_level = tier_hierarchy.get(tier, 0)

        available = []
        for protocol, definition in self._available_protocols.items():
            required_tier_level = tier_hierarchy.get(definition['tier_required'], 999)

            if user_tier_level < required_tier_level:
                continue

            if category and definition['category'] != category:
                continue

            available.append({
                'protocol': protocol,
                'name': definition['name'],
                'category': definition['category'],
                'chains': definition['chains']
            })

        return available

    def fetch_all_exploits(self, tier: str = 'open_source') -> List[Dict[str, Any]]:
        """
        Fetch exploits from all enabled aggregators

        Args:
            tier: Subscription tier

        Returns:
            Combined list of exploits from all aggregators
        """
        exploits = []
        available_protocols = self.get_available_protocols(tier)

        for proto in available_protocols:
            protocol_id = proto['protocol']
            aggregator = self.load_aggregator(protocol_id)

            if aggregator:
                try:
                    protocol_exploits = aggregator.fetch_exploits()
                    exploits.extend(protocol_exploits)
                except Exception as e:
                    logger.error(f"Error fetching from {protocol_id}: {e}")

        return exploits


# Global registry instance
_registry = None


def get_registry() -> AggregatorRegistry:
    """Get global aggregator registry instance"""
    global _registry
    if _registry is None:
        _registry = AggregatorRegistry()
    return _registry
