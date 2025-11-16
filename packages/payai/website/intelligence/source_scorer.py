# -*- coding: utf-8 -*-
"""
Source Quality Scoring System
Tracks and scores aggregation sources based on speed, accuracy, and exclusivity
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from database import get_db
import logging

logger = logging.getLogger(__name__)


class SourceScorer:
    """
    Evaluates and ranks aggregation sources based on multiple metrics

    Scoring Factors:
    1. Speed: Time from incident to report
    2. Accuracy: Verification rate of submissions
    3. Exclusivity: Percentage of first-reports (not duplicates)
    4. Coverage: Number of chains/protocols covered
    5. Reliability: Uptime and fetch success rate
    """

    def __init__(self):
        self.db = get_db()

        # Scoring weights (total = 100%)
        self.weights = {
            'speed': 0.30,          # 30% - Most important for intelligence
            'exclusivity': 0.25,    # 25% - Unique reports vs duplicates
            'reliability': 0.20,    # 20% - Consistent uptime
            'coverage': 0.15,       # 15% - Breadth of monitoring
            'accuracy': 0.10        # 10% - Verification rate
        }

    def score_source(self, source_name: str, days: int = 30) -> Dict[str, Any]:
        """
        Calculate comprehensive quality score for a source

        Returns score (0-100) and detailed metrics
        """

        # Get exploits from this source
        cursor = self.db.connection.cursor()
        cursor.execute("""
            SELECT
                tx_hash,
                timestamp,
                chain,
                protocol,
                created_at
            FROM exploits
            WHERE source = ?
            AND timestamp >= datetime('now', ? || ' days')
            ORDER BY timestamp DESC
        """, (source_name, -days))

        exploits = cursor.fetchall()

        if not exploits:
            return {
                'source': source_name,
                'total_score': 0,
                'exploits_reported': 0,
                'message': 'No data in time period'
            }

        # Calculate individual metrics
        speed_score = self._calculate_speed_score(exploits)
        exclusivity_score = self._calculate_exclusivity_score(exploits, source_name)
        reliability_score = self._calculate_reliability_score(source_name, days)
        coverage_score = self._calculate_coverage_score(exploits)
        accuracy_score = self._calculate_accuracy_score(source_name)

        # Weighted total
        total_score = (
            speed_score * self.weights['speed'] +
            exclusivity_score * self.weights['exclusivity'] +
            reliability_score * self.weights['reliability'] +
            coverage_score * self.weights['coverage'] +
            accuracy_score * self.weights['accuracy']
        )

        return {
            'source': source_name,
            'total_score': round(total_score, 2),
            'metrics': {
                'speed': round(speed_score, 2),
                'exclusivity': round(exclusivity_score, 2),
                'reliability': round(reliability_score, 2),
                'coverage': round(coverage_score, 2),
                'accuracy': round(accuracy_score, 2)
            },
            'exploits_reported': len(exploits),
            'period_days': days
        }

    def _calculate_speed_score(self, exploits: List[tuple]) -> float:
        """
        Score based on average time from incident to database insertion

        Fast = High Score
        Slower = Lower Score
        """

        if not exploits:
            return 0.0

        total_delay_minutes = 0

        for exploit in exploits:
            tx_hash, timestamp, chain, protocol, created_at = exploit

            # Parse timestamps
            incident_time = datetime.fromisoformat(timestamp)
            reported_time = datetime.fromisoformat(created_at)

            # Calculate delay
            delay = (reported_time - incident_time).total_seconds() / 60
            total_delay_minutes += max(0, delay)  # Ignore negative delays

        avg_delay_minutes = total_delay_minutes / len(exploits)

        # Scoring curve:
        # 0-5 minutes: 100 points
        # 5-15 minutes: 90-100 points
        # 15-60 minutes: 70-90 points
        # 1-4 hours: 50-70 points
        # 4-24 hours: 20-50 points
        # >24 hours: 0-20 points

        if avg_delay_minutes <= 5:
            return 100.0
        elif avg_delay_minutes <= 15:
            return 90 + (15 - avg_delay_minutes) / 10
        elif avg_delay_minutes <= 60:
            return 70 + (60 - avg_delay_minutes) * 0.44
        elif avg_delay_minutes <= 240:  # 4 hours
            return 50 + (240 - avg_delay_minutes) * 0.11
        elif avg_delay_minutes <= 1440:  # 24 hours
            return 20 + (1440 - avg_delay_minutes) * 0.025
        else:
            return max(0, 20 - (avg_delay_minutes - 1440) * 0.01)

    def _calculate_exclusivity_score(self, exploits: List[tuple], source_name: str) -> float:
        """
        Score based on percentage of exploits this source reported FIRST

        High exclusivity = More unique intelligence
        """

        if not exploits:
            return 0.0

        first_reports = 0

        cursor = self.db.connection.cursor()

        for exploit in exploits:
            tx_hash = exploit[0]

            # Find all sources that reported this tx_hash
            cursor.execute("""
                SELECT source, created_at
                FROM exploits
                WHERE tx_hash = ?
                ORDER BY created_at ASC
            """, (tx_hash,))

            all_reports = cursor.fetchall()

            if all_reports and all_reports[0][0] == source_name:
                first_reports += 1

        exclusivity_rate = (first_reports / len(exploits)) * 100

        return exclusivity_rate

    def _calculate_reliability_score(self, source_name: str, days: int) -> float:
        """
        Score based on uptime and fetch success rate

        Consistent fetching = High reliability
        """

        cursor = self.db.connection.cursor()
        cursor.execute("""
            SELECT
                fetch_count,
                error_count,
                is_active
            FROM sources
            WHERE name = ?
        """, (source_name,))

        result = cursor.fetchone()

        if not result:
            return 0.0

        fetch_count, error_count, is_active = result

        if fetch_count == 0:
            return 0.0

        # Calculate success rate
        success_rate = ((fetch_count - error_count) / fetch_count) * 100

        # Penalize if not active
        if not is_active:
            success_rate *= 0.5

        return min(100, success_rate)

    def _calculate_coverage_score(self, exploits: List[tuple]) -> float:
        """
        Score based on diversity of chains and protocols covered

        More chains/protocols = Better coverage
        """

        if not exploits:
            return 0.0

        chains = set()
        protocols = set()

        for exploit in exploits:
            tx_hash, timestamp, chain, protocol, created_at = exploit
            chains.add(chain)
            protocols.add(protocol)

        # Scoring:
        # 10+ chains: 100 points
        # 5-10 chains: 70-100 points
        # 1-5 chains: 30-70 points

        chain_count = len(chains)
        protocol_count = len(protocols)

        if chain_count >= 10:
            chain_score = 100
        elif chain_count >= 5:
            chain_score = 70 + (chain_count - 5) * 6
        else:
            chain_score = 30 + chain_count * 8

        # Average with protocol diversity (similar curve)
        if protocol_count >= 20:
            protocol_score = 100
        elif protocol_count >= 10:
            protocol_score = 70 + (protocol_count - 10) * 3
        else:
            protocol_score = 30 + protocol_count * 4

        return (chain_score + protocol_score) / 2

    def _calculate_accuracy_score(self, source_name: str) -> float:
        """
        Score based on verification rate (for sources with community validation)

        For now, returns 100 for established aggregators
        In future, track false positives from community feedback
        """

        # Trusted sources get full accuracy score
        trusted_sources = [
            'defillama',
            'rekt_news',
            'blocksec',
            'peckshield',
            'certik'
        ]

        if source_name.lower() in trusted_sources:
            return 100.0

        # For community submissions, check verification rate
        if source_name == 'community':
            cursor = self.db.connection.cursor()
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified
                FROM community_submissions
            """)
            result = cursor.fetchone()

            if result and result[0] > 0:
                verified_rate = (result[1] / result[0]) * 100
                return verified_rate

        # Default for unknown sources
        return 50.0

    def rank_all_sources(self, days: int = 30) -> List[Dict[str, Any]]:
        """
        Rank all active sources by quality score

        Returns sorted list from best to worst
        """

        # Get all active sources
        cursor = self.db.connection.cursor()
        cursor.execute("""
            SELECT DISTINCT source
            FROM exploits
            WHERE timestamp >= datetime('now', ? || ' days')
        """, (-days,))

        sources = [row[0] for row in cursor.fetchall()]

        # Score each source
        rankings = []
        for source in sources:
            score_data = self.score_source(source, days)
            rankings.append(score_data)

        # Sort by total score (descending)
        rankings.sort(key=lambda x: x['total_score'], reverse=True)

        return rankings

    def get_source_comparison(self, days: int = 30) -> Dict[str, Any]:
        """
        Generate comprehensive comparison report of all sources
        """

        rankings = self.rank_all_sources(days)

        if not rankings:
            return {
                'message': 'No data available',
                'period_days': days
            }

        # Calculate summary stats
        total_exploits = sum(r['exploits_reported'] for r in rankings)
        avg_score = sum(r['total_score'] for r in rankings) / len(rankings)

        # Best performers by category
        best_speed = max(rankings, key=lambda x: x['metrics']['speed'])
        best_exclusivity = max(rankings, key=lambda x: x['metrics']['exclusivity'])
        best_coverage = max(rankings, key=lambda x: x['metrics']['coverage'])

        return {
            'period_days': days,
            'total_sources': len(rankings),
            'total_exploits': total_exploits,
            'average_score': round(avg_score, 2),
            'rankings': rankings,
            'best_performers': {
                'speed': {
                    'source': best_speed['source'],
                    'score': best_speed['metrics']['speed']
                },
                'exclusivity': {
                    'source': best_exclusivity['source'],
                    'score': best_exclusivity['metrics']['exclusivity']
                },
                'coverage': {
                    'source': best_coverage['source'],
                    'score': best_coverage['metrics']['coverage']
                }
            }
        }


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    scorer = SourceScorer()

    print("\n=== Source Quality Scoring System ===")
    print("\nScoring Factors:")
    for factor, weight in scorer.weights.items():
        print(f"  {factor.title()}: {weight*100:.0f}%")

    print("\n=== Source Rankings (Last 30 Days) ===")
    comparison = scorer.get_source_comparison(days=30)

    if 'rankings' in comparison:
        print(f"\nTotal Sources: {comparison['total_sources']}")
        print(f"Total Exploits: {comparison['total_exploits']}")
        print(f"Average Score: {comparison['average_score']}/100")

        print("\n--- Rankings ---")
        for i, ranking in enumerate(comparison['rankings'], 1):
            print(f"\n{i}. {ranking['source']}")
            print(f"   Total Score: {ranking['total_score']}/100")
            print(f"   Exploits: {ranking['exploits_reported']}")
            print(f"   Metrics:")
            for metric, score in ranking['metrics'].items():
                print(f"     {metric.title()}: {score:.1f}/100")

        print("\n--- Best Performers by Category ---")
        bp = comparison['best_performers']
        print(f"  Fastest: {bp['speed']['source']} ({bp['speed']['score']:.1f}/100)")
        print(f"  Most Exclusive: {bp['exclusivity']['source']} ({bp['exclusivity']['score']:.1f}/100)")
        print(f"  Best Coverage: {bp['coverage']['source']} ({bp['coverage']['score']:.1f}/100)")
    else:
        print(comparison['message'])
