"""
Monitor Scheduler
Periodically runs monitors and saves data to database
"""

import asyncio
import logging
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from monitors.hlp_vault_monitor import HLPVaultMonitor
from monitors.oracle_monitor import OracleMonitor
from monitors.liquidation_analyzer import LiquidationAnalyzer
from monitors.database_wrapper import get_monitor_db_wrapper
from alerts.integration import (
    check_and_alert_hlp_health,
    check_and_alert_oracle_deviations,
    check_and_alert_liquidation_patterns
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MonitorScheduler:
    """
    Scheduler for periodic monitor execution

    Runs monitors at specified intervals and:
    - Saves data to database
    - Triggers alerts for anomalies
    - Tracks execution statistics
    """

    def __init__(
        self,
        hlp_interval: int = 300,  # 5 minutes
        oracle_interval: int = 60,  # 1 minute
        liquidation_interval: int = 180,  # 3 minutes
        enable_database: bool = True
    ):
        """
        Initialize monitor scheduler

        Args:
            hlp_interval: HLP vault check interval (seconds)
            oracle_interval: Oracle check interval (seconds)
            liquidation_interval: Liquidation check interval (seconds)
            enable_database: Whether to enable database persistence
        """
        self.hlp_interval = hlp_interval
        self.oracle_interval = oracle_interval
        self.liquidation_interval = liquidation_interval

        # Initialize monitors
        self.hlp_monitor = HLPVaultMonitor()
        self.oracle_monitor = OracleMonitor()
        self.liquidation_analyzer = LiquidationAnalyzer()

        # Initialize database wrapper
        self.db_wrapper = get_monitor_db_wrapper(enabled=enable_database)

        # Execution statistics
        self.stats = {
            'hlp_checks': 0,
            'oracle_checks': 0,
            'liquidation_checks': 0,
            'hlp_errors': 0,
            'oracle_errors': 0,
            'liquidation_errors': 0,
            'start_time': datetime.now(timezone.utc),
            'last_hlp_check': None,
            'last_oracle_check': None,
            'last_liquidation_check': None
        }

        # Running flag
        self.running = False

        logger.info(
            f"Monitor scheduler initialized: "
            f"HLP={hlp_interval}s, Oracle={oracle_interval}s, Liquidation={liquidation_interval}s"
        )

    async def check_hlp_vault(self):
        """Run HLP vault health check"""
        try:
            logger.info("Running HLP vault health check...")

            # Get current health
            health = self.hlp_monitor.get_current_health()

            if health:
                # Save to database
                if self.db_wrapper.enabled:
                    self.db_wrapper.save_hlp_snapshot(health)

                # Check for alerts
                check_and_alert_hlp_health(health)

                self.stats['last_hlp_check'] = datetime.now(timezone.utc)
                self.stats['hlp_checks'] += 1

                logger.info(
                    f"HLP check complete: Score={health.anomaly_score:.1f}, "
                    f"Healthy={health.is_healthy}"
                )
            else:
                logger.warning("HLP check returned no data")

        except Exception as e:
            logger.error(f"Error in HLP vault check: {e}")
            self.stats['hlp_errors'] += 1

    async def check_oracle_deviations(self):
        """Run oracle deviation check"""
        try:
            logger.info("Running oracle deviation check...")

            # Check all deviations
            deviations = self.oracle_monitor.check_all_deviations()

            if deviations:
                # Save to database
                if self.db_wrapper.enabled:
                    saved = self.db_wrapper.save_oracle_deviations(deviations)
                    logger.debug(f"Saved {saved} oracle deviations to database")

                # Check for alerts
                check_and_alert_oracle_deviations(deviations)

                self.stats['last_oracle_check'] = datetime.now(timezone.utc)
                self.stats['oracle_checks'] += 1

                logger.info(f"Oracle check complete: {len(deviations)} deviations found")
            else:
                logger.info("Oracle check: no significant deviations")
                self.stats['oracle_checks'] += 1

        except Exception as e:
            logger.error(f"Error in oracle deviation check: {e}")
            self.stats['oracle_errors'] += 1

    async def check_liquidation_patterns(self):
        """Run liquidation pattern analysis"""
        try:
            logger.info("Running liquidation pattern analysis...")

            # Analyze recent liquidations
            patterns = self.liquidation_analyzer.analyze_recent_liquidations()

            if patterns:
                # Save to database
                if self.db_wrapper.enabled:
                    saved = self.db_wrapper.save_liquidation_patterns(patterns)
                    logger.debug(f"Saved {saved} liquidation patterns to database")

                # Check for alerts
                check_and_alert_liquidation_patterns(patterns)

                self.stats['last_liquidation_check'] = datetime.now(timezone.utc)
                self.stats['liquidation_checks'] += 1

                logger.info(f"Liquidation check complete: {len(patterns)} patterns found")
            else:
                logger.info("Liquidation check: no suspicious patterns")
                self.stats['liquidation_checks'] += 1

        except Exception as e:
            logger.error(f"Error in liquidation pattern check: {e}")
            self.stats['liquidation_errors'] += 1

    async def run_hlp_loop(self):
        """Run HLP vault checks in loop"""
        while self.running:
            await self.check_hlp_vault()
            await asyncio.sleep(self.hlp_interval)

    async def run_oracle_loop(self):
        """Run oracle checks in loop"""
        while self.running:
            await self.check_oracle_deviations()
            await asyncio.sleep(self.oracle_interval)

    async def run_liquidation_loop(self):
        """Run liquidation checks in loop"""
        while self.running:
            await self.check_liquidation_patterns()
            await asyncio.sleep(self.liquidation_interval)

    async def run(self):
        """Start all monitor loops"""
        self.running = True

        logger.info("=" * 70)
        logger.info("MONITOR SCHEDULER STARTED")
        logger.info("=" * 70)
        logger.info(f"HLP Vault Check: Every {self.hlp_interval}s")
        logger.info(f"Oracle Check: Every {self.oracle_interval}s")
        logger.info(f"Liquidation Check: Every {self.liquidation_interval}s")
        logger.info(f"Database Persistence: {'ENABLED' if self.db_wrapper.enabled else 'DISABLED'}")
        logger.info("=" * 70)

        try:
            # Run all loops concurrently
            await asyncio.gather(
                self.run_hlp_loop(),
                self.run_oracle_loop(),
                self.run_liquidation_loop()
            )

        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Fatal error in scheduler: {e}")
        finally:
            await self.stop()

    async def stop(self):
        """Stop all monitor loops"""
        logger.info("Stopping monitor scheduler...")
        self.running = False

        # Print final statistics
        self.print_stats()

        logger.info("Monitor scheduler stopped")

    def print_stats(self):
        """Print execution statistics"""
        uptime = (datetime.now(timezone.utc) - self.stats['start_time']).total_seconds()

        logger.info("=" * 70)
        logger.info("MONITOR SCHEDULER STATISTICS")
        logger.info("=" * 70)
        logger.info(f"Uptime: {uptime:.0f}s ({uptime/60:.1f} minutes)")
        logger.info(f"")
        logger.info(f"HLP Vault Checks: {self.stats['hlp_checks']} (errors: {self.stats['hlp_errors']})")
        logger.info(f"Oracle Checks: {self.stats['oracle_checks']} (errors: {self.stats['oracle_errors']})")
        logger.info(f"Liquidation Checks: {self.stats['liquidation_checks']} (errors: {self.stats['liquidation_errors']})")
        logger.info(f"")
        logger.info(f"Last HLP Check: {self.stats['last_hlp_check']}")
        logger.info(f"Last Oracle Check: {self.stats['last_oracle_check']}")
        logger.info(f"Last Liquidation Check: {self.stats['last_liquidation_check']}")
        logger.info("=" * 70)

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics dict"""
        uptime = (datetime.now(timezone.utc) - self.stats['start_time']).total_seconds()

        return {
            **self.stats,
            'uptime_seconds': uptime,
            'running': self.running
        }


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description='Monitor Scheduler - Periodic security monitoring'
    )
    parser.add_argument(
        '--hlp-interval',
        type=int,
        default=300,
        help='HLP vault check interval (seconds, default: 300)'
    )
    parser.add_argument(
        '--oracle-interval',
        type=int,
        default=60,
        help='Oracle check interval (seconds, default: 60)'
    )
    parser.add_argument(
        '--liquidation-interval',
        type=int,
        default=180,
        help='Liquidation check interval (seconds, default: 180)'
    )
    parser.add_argument(
        '--no-database',
        action='store_true',
        help='Disable database persistence'
    )

    args = parser.parse_args()

    # Create scheduler
    scheduler = MonitorScheduler(
        hlp_interval=args.hlp_interval,
        oracle_interval=args.oracle_interval,
        liquidation_interval=args.liquidation_interval,
        enable_database=not args.no_database
    )

    # Set up signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}")
        asyncio.create_task(scheduler.stop())

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Run scheduler
    await scheduler.run()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutdown complete")
