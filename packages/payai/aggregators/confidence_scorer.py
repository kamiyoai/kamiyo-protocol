# -*- coding: utf-8 -*-
"""
Confidence Scoring System
Multi-source verification for exploit reports
"""

import logging
from typing import Dict, List, Optional, Any
from web3 import Web3
from web3.exceptions import TransactionNotFound
import os

logger = logging.getLogger(__name__)


class ConfidenceScorer:
    """
    Calculates confidence scores for exploit reports based on:
    - On-chain verification
    - Source reputation (tier-based)
    - Protocol team confirmation
    """

    # Source tier definitions
    TIER_1_SOURCES = ['certik', 'peckshield', 'blocksec', 'slowmist']
    TIER_2_SOURCES = ['twitter', 'telegram', 'forta', 'onchain_monitor']

    # Scoring weights
    SCORE_ONCHAIN = 50
    SCORE_TIER_1 = 15
    SCORE_TIER_2 = 10
    SCORE_PROTOCOL_CONFIRMATION = 30
    MAX_TIER_1_BONUS = 30  # Max 2 Tier 1 sources
    MAX_TIER_2_BONUS = 20  # Max 2 Tier 2 sources

    # RPC endpoints for different chains
    RPC_ENDPOINTS = {
        'ethereum': os.getenv('ETH_RPC_URL', 'https://eth.llamarpc.com'),
        'base': os.getenv('BASE_RPC_URL', 'https://mainnet.base.org'),
        'arbitrum': os.getenv('ARB_RPC_URL', 'https://arb1.arbitrum.io/rpc'),
        'optimism': os.getenv('OP_RPC_URL', 'https://mainnet.optimism.io'),
        'polygon': os.getenv('POLYGON_RPC_URL', 'https://polygon-rpc.com'),
        'bsc': os.getenv('BSC_RPC_URL', 'https://bsc-dataseed.binance.org'),
        'avalanche': os.getenv('AVAX_RPC_URL', 'https://api.avax.network/ext/bc/C/rpc'),
    }

    def __init__(self):
        """Initialize confidence scorer"""
        self.logger = logging.getLogger(__name__)
        self._web3_instances = {}

    def calculate_confidence(
        self,
        exploit: Dict[str, Any],
        all_reports: List[Dict[str, Any]]
    ) -> int:
        """
        Calculate confidence score for an exploit based on verification sources.

        Args:
            exploit: The exploit report to score
            all_reports: All reports about the same incident (for source counting)

        Returns:
            Confidence score (0-100)
        """
        score = 0

        # 1. On-chain verification (50 points)
        if self._verify_on_chain(
            exploit.get('tx_hash'),
            exploit.get('chain')
        ):
            score += self.SCORE_ONCHAIN
            self.logger.info(
                f"On-chain verification successful for {exploit.get('tx_hash')}: +{self.SCORE_ONCHAIN}"
            )

        # 2. Count unique sources from all reports
        tier_1_sources = set()
        tier_2_sources = set()

        for report in all_reports:
            source = report.get('source', '').lower()

            if source in self.TIER_1_SOURCES:
                tier_1_sources.add(source)
            elif source in self.TIER_2_SOURCES:
                tier_2_sources.add(source)

        # Award points for Tier 1 sources (max 2 sources = 30 points)
        tier_1_count = min(len(tier_1_sources), 2)
        tier_1_score = tier_1_count * self.SCORE_TIER_1
        score += tier_1_score

        if tier_1_count > 0:
            self.logger.info(
                f"Tier 1 sources ({tier_1_count}): {tier_1_sources} = +{tier_1_score}"
            )

        # Award points for Tier 2 sources (max 2 sources = 20 points)
        tier_2_count = min(len(tier_2_sources), 2)
        tier_2_score = tier_2_count * self.SCORE_TIER_2
        score += tier_2_score

        if tier_2_count > 0:
            self.logger.info(
                f"Tier 2 sources ({tier_2_count}): {tier_2_sources} = +{tier_2_score}"
            )

        # 3. Protocol team confirmation (30 points)
        protocol = exploit.get('protocol')
        if protocol and self._check_protocol_confirmation(protocol, all_reports):
            score += self.SCORE_PROTOCOL_CONFIRMATION
            self.logger.info(
                f"Protocol confirmation for {protocol}: +{self.SCORE_PROTOCOL_CONFIRMATION}"
            )

        # Ensure score doesn't exceed 100
        final_score = min(score, 100)

        self.logger.info(
            f"Final confidence score for {exploit.get('protocol', 'unknown')}: "
            f"{final_score}/100"
        )

        return final_score

    def _verify_on_chain(self, tx_hash: Optional[str], chain: Optional[str]) -> bool:
        """
        Verify that a transaction exists on the blockchain.

        Args:
            tx_hash: Transaction hash to verify
            chain: Blockchain name (ethereum, base, arbitrum, etc.)

        Returns:
            True if transaction exists, False otherwise
        """
        if not tx_hash or not chain:
            self.logger.debug("Missing tx_hash or chain for on-chain verification")
            return False

        # Skip verification for generated tx hashes
        if tx_hash.startswith('generated-'):
            self.logger.debug(f"Skipping verification for generated tx_hash: {tx_hash}")
            return False

        # Get or create Web3 instance for this chain
        chain_lower = chain.lower()
        if chain_lower not in self.RPC_ENDPOINTS:
            self.logger.warning(f"No RPC endpoint configured for chain: {chain}")
            return False

        try:
            # Get or create Web3 instance
            if chain_lower not in self._web3_instances:
                rpc_url = self.RPC_ENDPOINTS[chain_lower]
                self._web3_instances[chain_lower] = Web3(Web3.HTTPProvider(rpc_url))

            w3 = self._web3_instances[chain_lower]

            # Check if connected
            if not w3.is_connected():
                self.logger.warning(f"Cannot connect to {chain} RPC endpoint")
                return False

            # Verify transaction exists
            try:
                tx = w3.eth.get_transaction(tx_hash)
                if tx:
                    self.logger.info(
                        f"Transaction verified on {chain}: {tx_hash} "
                        f"(block {tx.get('blockNumber')})"
                    )
                    return True
            except TransactionNotFound:
                self.logger.warning(
                    f"Transaction not found on {chain}: {tx_hash}"
                )
                return False

        except Exception as e:
            self.logger.error(
                f"Error verifying transaction on {chain}: {e}",
                exc_info=True
            )
            return False

        return False

    def _check_protocol_confirmation(
        self,
        protocol: str,
        all_reports: List[Dict[str, Any]]
    ) -> bool:
        """
        Check if the protocol team has confirmed the exploit.

        Currently checks if any report mentions official protocol confirmation.
        In the future, this could integrate with Twitter API to check official accounts.

        Args:
            protocol: Protocol name
            all_reports: All reports about this incident

        Returns:
            True if protocol confirmed, False otherwise
        """
        if not protocol:
            return False

        # Keywords that indicate official confirmation
        confirmation_keywords = [
            'official statement',
            'protocol confirmed',
            'team confirmed',
            'confirmed by team',
            'official response',
            'protocol team',
            'post-mortem',
            'postmortem',
        ]

        # Check all reports for confirmation indicators
        for report in all_reports:
            description = (report.get('description') or '').lower()
            source_url = (report.get('source_url') or '').lower()

            # Check if description mentions confirmation
            for keyword in confirmation_keywords:
                if keyword in description:
                    self.logger.info(
                        f"Found protocol confirmation keyword '{keyword}' "
                        f"in {report.get('source')}"
                    )
                    return True

            # Check if source is the protocol's official Twitter/blog
            protocol_lower = protocol.lower().replace(' ', '')
            if protocol_lower in source_url and 'twitter.com' in source_url:
                self.logger.info(
                    f"Report from official protocol account: {source_url}"
                )
                return True

        return False

    def get_confidence_label(self, score: int) -> str:
        """
        Get human-readable confidence label.

        Args:
            score: Confidence score (0-100)

        Returns:
            Label: "Very High", "High", "Medium", "Low", or "Very Low"
        """
        if score >= 80:
            return "Very High"
        elif score >= 60:
            return "High"
        elif score >= 40:
            return "Medium"
        elif score >= 20:
            return "Low"
        else:
            return "Very Low"

    def get_score_breakdown(
        self,
        exploit: Dict[str, Any],
        all_reports: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """
        Get detailed breakdown of confidence score components.

        Args:
            exploit: The exploit report
            all_reports: All reports about the same incident

        Returns:
            Dictionary with score breakdown
        """
        breakdown = {
            'onchain_verification': 0,
            'tier_1_sources': 0,
            'tier_2_sources': 0,
            'protocol_confirmation': 0,
            'total': 0
        }

        # On-chain verification
        if self._verify_on_chain(exploit.get('tx_hash'), exploit.get('chain')):
            breakdown['onchain_verification'] = self.SCORE_ONCHAIN

        # Count sources
        tier_1_sources = set()
        tier_2_sources = set()

        for report in all_reports:
            source = report.get('source', '').lower()
            if source in self.TIER_1_SOURCES:
                tier_1_sources.add(source)
            elif source in self.TIER_2_SOURCES:
                tier_2_sources.add(source)

        breakdown['tier_1_sources'] = min(len(tier_1_sources), 2) * self.SCORE_TIER_1
        breakdown['tier_2_sources'] = min(len(tier_2_sources), 2) * self.SCORE_TIER_2

        # Protocol confirmation
        if self._check_protocol_confirmation(exploit.get('protocol'), all_reports):
            breakdown['protocol_confirmation'] = self.SCORE_PROTOCOL_CONFIRMATION

        # Total
        breakdown['total'] = min(
            sum(breakdown.values()),
            100
        )

        return breakdown

    def __repr__(self) -> str:
        return f"<ConfidenceScorer(chains={list(self.RPC_ENDPOINTS.keys())})>"
