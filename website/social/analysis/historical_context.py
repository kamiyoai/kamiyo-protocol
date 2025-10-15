# -*- coding: utf-8 -*-
"""
Historical Context Analyzer
Query Kamiyo database for related exploit patterns and trends

IMPORTANT: This module only aggregates and organizes confirmed exploit data
from Kamiyo's database. It does NOT perform security analysis or predictions.
"""

from typing import List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from social.analysis.data_models import (
    RelatedExploit,
    HistoricalContext
)


@dataclass
class ExploitQuery:
    """Query parameters for finding similar exploits"""
    exploit_type: Optional[str] = None
    chain: Optional[str] = None
    protocol_category: Optional[str] = None  # e.g., 'DEX', 'Lending', 'Bridge'
    min_loss_usd: Optional[float] = None
    max_loss_usd: Optional[float] = None
    time_period_days: int = 365  # Look back 1 year by default


class HistoricalContextAnalyzer:
    """
    Analyzes historical exploit data to provide context

    NOTE: This class ONLY queries and aggregates confirmed exploit data
    from Kamiyo's database. It does NOT:
    - Detect vulnerabilities
    - Predict future exploits
    - Score security risks
    - Analyze smart contract code
    """

    def __init__(self, db_connection=None):
        """
        Initialize historical context analyzer

        Args:
            db_connection: Optional database connection (mock for example)
        """
        self.db = db_connection

        # In production, this would query real database
        # For now, using mock data structure
        self._mock_exploit_database = []

    def find_similar_exploits(
        self,
        query: ExploitQuery,
        limit: int = 10
    ) -> List[RelatedExploit]:
        """
        Find similar past exploits based on query parameters

        This searches Kamiyo's aggregated exploit database for confirmed
        incidents that match the query criteria.

        Args:
            query: Search parameters
            limit: Maximum number of results

        Returns:
            List of related exploits with similarity reasons
        """
        # In production, this would be a database query
        # Example SQL query structure:
        """
        SELECT
            tx_hash, protocol, chain, loss_amount_usd,
            exploit_type, timestamp
        FROM exploits
        WHERE
            (exploit_type = ? OR ? IS NULL)
            AND (chain = ? OR ? IS NULL)
            AND timestamp >= ?
            AND loss_amount_usd >= ?
        ORDER BY timestamp DESC
        LIMIT ?
        """

        similar_exploits = []
        cutoff_date = datetime.utcnow() - timedelta(days=query.time_period_days)

        # Mock implementation - in production, query real database
        for exploit_data in self._mock_exploit_database:
            # Filter by criteria
            if query.exploit_type and exploit_data['exploit_type'] != query.exploit_type:
                continue
            if query.chain and exploit_data['chain'] != query.chain:
                continue
            if query.min_loss_usd and exploit_data['loss_amount_usd'] < query.min_loss_usd:
                continue
            if exploit_data['timestamp'] < cutoff_date:
                continue

            # Determine similarity reason
            similarity_reason = self._determine_similarity(exploit_data, query)

            similar_exploits.append(RelatedExploit(
                tx_hash=exploit_data['tx_hash'],
                protocol=exploit_data['protocol'],
                chain=exploit_data['chain'],
                loss_amount_usd=exploit_data['loss_amount_usd'],
                exploit_type=exploit_data['exploit_type'],
                timestamp=exploit_data['timestamp'],
                similarity_reason=similarity_reason
            ))

            if len(similar_exploits) >= limit:
                break

        return similar_exploits

    def calculate_total_losses(
        self,
        query: ExploitQuery
    ) -> float:
        """
        Calculate total losses for exploits matching query

        Args:
            query: Search parameters

        Returns:
            Total loss amount in USD
        """
        similar = self.find_similar_exploits(query, limit=1000)
        return sum(exploit.loss_amount_usd for exploit in similar)

    def analyze_trend(
        self,
        exploit_type: str,
        chain: Optional[str] = None,
        comparison_period_days: int = 90
    ) -> Tuple[str, float]:
        """
        Analyze trend for specific exploit type

        Compares current period with previous period to identify trends.
        Returns trend direction and percentage change.

        Args:
            exploit_type: Type of exploit to analyze
            chain: Optional chain filter
            comparison_period_days: Days to compare (current vs previous)

        Returns:
            Tuple of (trend_direction, percentage_change)
            trend_direction: 'increasing', 'decreasing', or 'stable'
            percentage_change: Percentage difference between periods
        """
        now = datetime.utcnow()

        # Current period
        current_query = ExploitQuery(
            exploit_type=exploit_type,
            chain=chain,
            time_period_days=comparison_period_days
        )
        current_exploits = self.find_similar_exploits(current_query, limit=1000)
        current_count = len(current_exploits)

        # Previous period (go back twice the period)
        # In production, would query with date ranges
        # For now, mock implementation
        previous_count = current_count  # Mock - would be real historical query

        if previous_count == 0:
            return 'stable', 0.0

        percentage_change = ((current_count - previous_count) / previous_count) * 100

        if percentage_change > 10:
            direction = 'increasing'
        elif percentage_change < -10:
            direction = 'decreasing'
        else:
            direction = 'stable'

        return direction, percentage_change

    def get_ranking(
        self,
        loss_amount: float,
        time_period: str = "this year"
    ) -> Optional[str]:
        """
        Get ranking of exploit by loss amount

        Args:
            loss_amount: Loss amount to rank
            time_period: Time period description

        Returns:
            Ranking string like "3rd largest DeFi exploit this year"
            or None if not in top rankings
        """
        # Query all exploits in time period
        # In production, would query database with date filters

        # For now, mock ranking logic
        # Would be: SELECT COUNT(*) FROM exploits WHERE loss_amount_usd > ?

        # Mock: assume it's significant if > $1M
        if loss_amount < 1_000_000:
            return None

        # Example rankings (would be calculated from real data)
        if loss_amount >= 100_000_000:
            return f"One of the largest DeFi exploits {time_period}"
        elif loss_amount >= 50_000_000:
            return f"Top 5 largest DeFi exploit {time_period}"
        elif loss_amount >= 10_000_000:
            return f"Top 20 largest DeFi exploit {time_period}"
        else:
            return None

    def generate_historical_context(
        self,
        exploit_type: str,
        chain: str,
        loss_amount: float,
        protocol_category: Optional[str] = None
    ) -> HistoricalContext:
        """
        Generate complete historical context for an exploit

        This aggregates various historical data points to provide
        comprehensive context about the exploit pattern.

        Args:
            exploit_type: Type of exploit
            chain: Blockchain
            loss_amount: Loss amount in USD
            protocol_category: Optional protocol category

        Returns:
            HistoricalContext with trend analysis and similar exploits
        """
        # Find similar exploits
        query = ExploitQuery(
            exploit_type=exploit_type,
            chain=chain,
            protocol_category=protocol_category,
            time_period_days=365
        )
        similar_exploits = self.find_similar_exploits(query, limit=5)

        # Calculate total losses
        total_losses = self.calculate_total_losses(query)

        # Analyze trend
        trend_direction, trend_percentage = self.analyze_trend(
            exploit_type=exploit_type,
            chain=chain,
            comparison_period_days=90
        )

        # Get ranking
        ranking = self.get_ranking(loss_amount, time_period="this year")

        return HistoricalContext(
            similar_exploits=similar_exploits,
            total_losses_in_category=total_losses,
            trend_direction=trend_direction,
            trend_percentage=trend_percentage,
            time_period="this quarter",
            ranking=ranking
        )

    def _determine_similarity(
        self,
        exploit_data: dict,
        query: ExploitQuery
    ) -> str:
        """Determine why exploit is similar"""
        reasons = []

        if query.exploit_type and exploit_data['exploit_type'] == query.exploit_type:
            reasons.append(f"Same attack type ({query.exploit_type})")

        if query.chain and exploit_data['chain'] == query.chain:
            reasons.append(f"Same chain ({query.chain})")

        if query.protocol_category:
            reasons.append(f"Same protocol type ({query.protocol_category})")

        if not reasons:
            reasons.append("Similar characteristics")

        return ", ".join(reasons)

    def add_mock_exploit(self, exploit_data: dict):
        """Add mock exploit data for testing"""
        self._mock_exploit_database.append(exploit_data)


# Example usage
if __name__ == "__main__":
    analyzer = HistoricalContextAnalyzer()

    # Add some mock data
    analyzer.add_mock_exploit({
        'tx_hash': '0xabc123...',
        'protocol': 'Test DEX',
        'chain': 'Ethereum',
        'loss_amount_usd': 5_000_000,
        'exploit_type': 'Flash Loan',
        'timestamp': datetime.utcnow() - timedelta(days=30)
    })

    # Generate context
    context = analyzer.generate_historical_context(
        exploit_type='Flash Loan',
        chain='Ethereum',
        loss_amount=2_500_000
    )

    print("Historical Context Analysis")
    print("="*60)
    print(f"Total losses in category: ${context.total_losses_in_category:,.2f}")
    print(f"Trend: {context.trend_direction} ({context.trend_percentage:+.1f}%)")
    if context.ranking:
        print(f"Ranking: {context.ranking}")
    print(f"\nSimilar exploits found: {len(context.similar_exploits)}")
