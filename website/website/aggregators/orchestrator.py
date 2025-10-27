# -*- coding: utf-8 -*-
"""
Aggregation Orchestrator
Coordinates all exploit aggregators and manages the data pipeline
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
import time
import schedule
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Any

from aggregators.defillama import DefiLlamaAggregator
from aggregators.rekt_news import RektNewsAggregator
from aggregators.certik import CertiKAggregator
from aggregators.chainalysis import ChainalysisAggregator
from aggregators.github_advisories import GitHubAdvisoriesAggregator
from aggregators.immunefi import ImmunefiAggregator
from aggregators.consensys import ConsensysAggregator
from aggregators.trailofbits import TrailOfBitsAggregator
from aggregators.quantstamp import QuantstampAggregator
from aggregators.openzeppelin import OpenZeppelinAggregator
from aggregators.slowmist import SlowMistAggregator
from aggregators.hackerone import HackerOneAggregator
from aggregators.cosmos_security import CosmosSecurityAggregator
from aggregators.arbitrum_security import ArbitrumSecurityAggregator
from aggregators.peckshield import PeckShieldAggregator
from aggregators.blocksec import BlockSecAggregator
from aggregators.beosin import BeosinAggregator
from aggregators.twitter import TwitterAggregator
from database import get_db

logger = logging.getLogger(__name__)


class AggregationOrchestrator:
    """Orchestrates all exploit aggregators"""

    def __init__(self, max_workers: int = 5):
        """Initialize orchestrator with aggregators"""
        self.max_workers = max_workers
        self.db = get_db()

        # Initialize all aggregators
        self.aggregators = [
            DefiLlamaAggregator(),
            RektNewsAggregator(),
            CertiKAggregator(),
            ChainalysisAggregator(),
            GitHubAdvisoriesAggregator(),
            ImmunefiAggregator(),
            ConsensysAggregator(),
            TrailOfBitsAggregator(),
            QuantstampAggregator(),
            OpenZeppelinAggregator(),
            SlowMistAggregator(),
            HackerOneAggregator(),
            CosmosSecurityAggregator(),
            ArbitrumSecurityAggregator(),
            PeckShieldAggregator(),
            BlockSecAggregator(),
            BeosinAggregator(),
            TwitterAggregator(),  # 18th source - monitors 38 security researchers
        ]

        logger.info(f"Orchestrator initialized with {len(self.aggregators)} aggregators")

    def fetch_all(self) -> Dict[str, Any]:
        """
        Fetch exploits from all sources in parallel
        Returns summary statistics
        """
        logger.info("=" * 60)
        logger.info(f"Starting aggregation cycle at {datetime.now()}")
        logger.info("=" * 60)

        stats = {
            'timestamp': datetime.now(),
            'sources_attempted': len(self.aggregators),
            'sources_succeeded': 0,
            'sources_failed': 0,
            'total_fetched': 0,
            'total_inserted': 0,
            'total_duplicates': 0,
            'errors': []
        }

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all fetch jobs
            future_to_aggregator = {
                executor.submit(self._fetch_and_store, agg): agg
                for agg in self.aggregators
            }

            # Process completed futures
            for future in as_completed(future_to_aggregator):
                aggregator = future_to_aggregator[future]

                try:
                    result = future.result(timeout=60)

                    stats['sources_succeeded'] += 1
                    stats['total_fetched'] += result['fetched']
                    stats['total_inserted'] += result['inserted']
                    stats['total_duplicates'] += result['duplicates']

                    # Update source health
                    self.db.update_source_health(
                        aggregator.name,
                        success=True,
                        url=getattr(aggregator, 'feed_url', None) or getattr(aggregator, 'api_url', None)
                    )

                    logger.info(
                        f"✓ {aggregator.name}: "
                        f"{result['fetched']} fetched, "
                        f"{result['inserted']} new, "
                        f"{result['duplicates']} duplicates"
                    )

                except Exception as e:
                    stats['sources_failed'] += 1
                    stats['errors'].append(f"{aggregator.name}: {str(e)}")

                    # Update source health
                    self.db.update_source_health(aggregator.name, success=False)

                    logger.error(f"✗ {aggregator.name} failed: {e}")

        # Log summary
        logger.info("=" * 60)
        logger.info(f"Aggregation cycle complete:")
        logger.info(f"  Sources: {stats['sources_succeeded']}/{stats['sources_attempted']} succeeded")
        logger.info(f"  Exploits: {stats['total_fetched']} fetched, {stats['total_inserted']} new")
        logger.info(f"  Duplicates: {stats['total_duplicates']}")
        if stats['errors']:
            logger.warning(f"  Errors: {len(stats['errors'])}")
        logger.info("=" * 60)

        return stats

    def _fetch_and_store(self, aggregator) -> Dict[str, int]:
        """
        Fetch from single aggregator and store in database
        Returns statistics
        """
        result = {
            'fetched': 0,
            'inserted': 0,
            'duplicates': 0
        }

        try:
            # Fetch exploits
            exploits = aggregator.fetch_exploits()
            result['fetched'] = len(exploits)

            # Store each exploit
            for exploit in exploits:
                exploit_id = self.db.insert_exploit(exploit)

                if exploit_id:
                    result['inserted'] += 1
                else:
                    result['duplicates'] += 1

        except Exception as e:
            logger.error(f"Error in {aggregator.name}: {e}")
            raise

        return result

    def run_once(self):
        """Run one aggregation cycle"""
        return self.fetch_all()

    def run_forever(self, interval_minutes: int = 5):
        """
        Run aggregation continuously
        Fetches every interval_minutes
        """
        logger.info(f"Starting continuous aggregation (every {interval_minutes} minutes)")

        # Run once immediately
        self.fetch_all()

        # Schedule periodic runs
        schedule.every(interval_minutes).minutes.do(self.fetch_all)

        try:
            while True:
                schedule.run_pending()
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Orchestrator stopped by user")

    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of all sources"""
        sources = self.db.get_source_health()

        return {
            'total_sources': len(self.aggregators),
            'active_sources': len([s for s in sources if s.get('is_active')]),
            'sources': sources,
            'database_exploits': self.db.get_total_exploits(),
            'database_chains': len(self.db.get_chains())
        }


# Main entry point
if __name__ == '__main__':
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Create orchestrator
    orchestrator = AggregationOrchestrator()

    # Run once for testing
    print("\nRunning single aggregation cycle...\n")
    stats = orchestrator.run_once()

    print("\nCycle Statistics:")
    print(f"  Timestamp: {stats['timestamp']}")
    print(f"  Sources succeeded: {stats['sources_succeeded']}/{stats['sources_attempted']}")
    print(f"  Total fetched: {stats['total_fetched']}")
    print(f"  Total inserted: {stats['total_inserted']}")
    print(f"  Duplicates: {stats['total_duplicates']}")

    if stats['errors']:
        print(f"\nErrors:")
        for error in stats['errors']:
            print(f"  - {error}")

    # Show health status
    print("\nHealth Status:")
    health = orchestrator.get_health_status()
    print(f"  Database exploits: {health['database_exploits']}")
    print(f"  Tracked chains: {health['database_chains']}")
    print(f"  Active sources: {health['active_sources']}/{health['total_sources']}")

    # Uncomment to run continuously:
    # print("\nStarting continuous mode (Ctrl+C to stop)...")
    # orchestrator.run_forever(interval_minutes=5)
