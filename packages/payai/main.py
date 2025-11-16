#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kamiyo - Exploit Intelligence Aggregator
Main entry point for running the complete system
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import argparse
import logging
import subprocess
import signal
from multiprocessing import Process
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def run_aggregator():
    """Run aggregation orchestrator in continuous mode"""
    from aggregators.orchestrator import AggregationOrchestrator

    logger.info("Starting aggregation orchestrator...")
    orchestrator = AggregationOrchestrator()
    orchestrator.run_forever(interval_minutes=5)


def run_api():
    """Run FastAPI server"""
    logger.info("Starting FastAPI server...")
    os.chdir(os.path.join(os.path.dirname(__file__), 'api'))
    subprocess.run([
        sys.executable, '-m', 'uvicorn',
        'main:app',
        '--host', '0.0.0.0',
        '--port', '8000',
        '--log-level', 'info'
    ])


def run_frontend():
    """Serve frontend with simple HTTP server"""
    logger.info("Starting frontend server...")
    os.chdir(os.path.join(os.path.dirname(__file__), 'frontend'))
    subprocess.run([
        sys.executable, '-m', 'http.server',
        '3000'
    ])


def run_all():
    """Run all components (aggregator, API, frontend)"""
    logger.info("=" * 60)
    logger.info("Starting Kamiyo - Exploit Intelligence Aggregator")
    logger.info("=" * 60)

    processes = []

    try:
        # Start API
        api_process = Process(target=run_api, name="API")
        api_process.start()
        processes.append(api_process)
        logger.info("✓ API started on http://localhost:8000")
        time.sleep(2)

        # Start frontend
        frontend_process = Process(target=run_frontend, name="Frontend")
        frontend_process.start()
        processes.append(frontend_process)
        logger.info("✓ Frontend started on http://localhost:3000")
        time.sleep(1)

        # Start aggregator
        aggregator_process = Process(target=run_aggregator, name="Aggregator")
        aggregator_process.start()
        processes.append(aggregator_process)
        logger.info("✓ Aggregator started (5-minute intervals)")

        logger.info("=" * 60)
        logger.info("Kamiyo is running!")
        logger.info("  - API: http://localhost:8000")
        logger.info("  - API Docs: http://localhost:8000/docs")
        logger.info("  - Dashboard: http://localhost:3000")
        logger.info("=" * 60)
        logger.info("Press Ctrl+C to stop")

        # Wait for processes
        for process in processes:
            process.join()

    except KeyboardInterrupt:
        logger.info("\nShutting down...")
        for process in processes:
            process.terminate()
            process.join(timeout=5)
        logger.info("All processes stopped")


def main():
    parser = argparse.ArgumentParser(
        description="Kamiyo - Exploit Intelligence Aggregator"
    )

    parser.add_argument(
        'command',
        choices=['all', 'api', 'aggregator', 'frontend', 'test'],
        help='Component to run'
    )

    args = parser.parse_args()

    if args.command == 'all':
        run_all()
    elif args.command == 'api':
        run_api()
    elif args.command == 'aggregator':
        run_aggregator()
    elif args.command == 'frontend':
        run_frontend()
    elif args.command == 'test':
        # Run quick test
        logger.info("Running quick test...")
        from aggregators.orchestrator import AggregationOrchestrator

        orchestrator = AggregationOrchestrator()
        stats = orchestrator.run_once()

        logger.info(f"\nTest Results:")
        logger.info(f"  Sources: {stats['sources_succeeded']}/{stats['sources_attempted']}")
        logger.info(f"  Fetched: {stats['total_fetched']} exploits")
        logger.info(f"  Inserted: {stats['total_inserted']} new")
        logger.info(f"  Duplicates: {stats['total_duplicates']}")

        if stats['errors']:
            logger.warning(f"\nErrors:")
            for error in stats['errors']:
                logger.warning(f"  - {error}")

        logger.info("\n✓ Test complete!")


if __name__ == '__main__':
    main()
