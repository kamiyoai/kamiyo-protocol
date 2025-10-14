# -*- coding: utf-8 -*-
"""
Health Check System for Social Media Posting
Monitors platform connectivity, authentication, and system resources
"""

import os
import time
import psutil
import requests
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from social.monitoring.structured_logging import get_logger

logger = get_logger(__name__)


class HealthStatus(Enum):
    """Health check status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a health check"""
    check_name: str
    status: HealthStatus
    message: str
    duration_seconds: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    details: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'check_name': self.check_name,
            'status': self.status.value,
            'message': self.message,
            'duration_seconds': round(self.duration_seconds, 3),
            'timestamp': self.timestamp.isoformat(),
            'details': self.details
        }


class HealthChecker:
    """
    Health checker for social media posting system
    """

    def __init__(self, kamiyo_api_url: Optional[str] = None):
        """
        Initialize health checker

        Args:
            kamiyo_api_url: URL of Kamiyo API to check connectivity
        """
        self.kamiyo_api_url = kamiyo_api_url or os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai')
        self.checks: List[Callable] = []
        self.last_results: Dict[str, HealthCheckResult] = {}

    def check_platform_authentication(
        self,
        platform: str,
        poster
    ) -> HealthCheckResult:
        """
        Check if platform is authenticated

        Args:
            platform: Platform name
            poster: Platform poster instance

        Returns:
            HealthCheckResult
        """
        start_time = time.time()
        check_name = f"{platform}_authentication"

        try:
            is_authenticated = poster.is_authenticated()
            duration = time.time() - start_time

            if is_authenticated:
                return HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.HEALTHY,
                    message=f"{platform} is authenticated",
                    duration_seconds=duration,
                    details={'authenticated': True}
                )
            else:
                return HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"{platform} is not authenticated",
                    duration_seconds=duration,
                    details={'authenticated': False}
                )

        except Exception as e:
            duration = time.time() - start_time
            logger.error("health_check_failed", check=check_name, error=str(e))
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNKNOWN,
                message=f"Failed to check {platform} authentication: {e}",
                duration_seconds=duration,
                details={'error': str(e)}
            )

    def check_kamiyo_api_connectivity(self) -> HealthCheckResult:
        """
        Check connectivity to Kamiyo API

        Returns:
            HealthCheckResult
        """
        start_time = time.time()
        check_name = "kamiyo_api_connectivity"

        try:
            # Try to reach API health endpoint
            health_url = f"{self.kamiyo_api_url}/health"
            response = requests.get(health_url, timeout=5)
            duration = time.time() - start_time

            if response.status_code == 200:
                return HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.HEALTHY,
                    message="Kamiyo API is reachable",
                    duration_seconds=duration,
                    details={
                        'url': health_url,
                        'status_code': response.status_code,
                        'response_time_ms': round(duration * 1000, 2)
                    }
                )
            else:
                return HealthCheckResult(
                    check_name=check_name,
                    status=HealthStatus.DEGRADED,
                    message=f"Kamiyo API returned status {response.status_code}",
                    duration_seconds=duration,
                    details={
                        'url': health_url,
                        'status_code': response.status_code
                    }
                )

        except requests.exceptions.Timeout:
            duration = time.time() - start_time
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNHEALTHY,
                message="Kamiyo API request timed out",
                duration_seconds=duration,
                details={'error': 'timeout'}
            )

        except requests.exceptions.RequestException as e:
            duration = time.time() - start_time
            logger.error("health_check_failed", check=check_name, error=str(e))
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNHEALTHY,
                message=f"Cannot reach Kamiyo API: {e}",
                duration_seconds=duration,
                details={'error': str(e)}
            )

    def check_database_connectivity(self, db_connection=None) -> HealthCheckResult:
        """
        Check database connectivity (if applicable)

        Args:
            db_connection: Database connection object

        Returns:
            HealthCheckResult
        """
        start_time = time.time()
        check_name = "database_connectivity"

        if db_connection is None:
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNKNOWN,
                message="No database connection provided",
                duration_seconds=0,
                details={'skipped': True}
            )

        try:
            # Try a simple query
            db_connection.execute("SELECT 1")
            duration = time.time() - start_time

            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.HEALTHY,
                message="Database is reachable",
                duration_seconds=duration,
                details={'query_time_ms': round(duration * 1000, 2)}
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error("health_check_failed", check=check_name, error=str(e))
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNHEALTHY,
                message=f"Database connection failed: {e}",
                duration_seconds=duration,
                details={'error': str(e)}
            )

    def check_disk_space(self, threshold_percent: float = 90.0) -> HealthCheckResult:
        """
        Check available disk space

        Args:
            threshold_percent: Alert threshold for disk usage percentage

        Returns:
            HealthCheckResult
        """
        start_time = time.time()
        check_name = "disk_space"

        try:
            disk_usage = psutil.disk_usage('/')
            duration = time.time() - start_time

            usage_percent = disk_usage.percent
            available_gb = disk_usage.free / (1024 ** 3)

            if usage_percent < threshold_percent:
                status = HealthStatus.HEALTHY
                message = f"Disk usage at {usage_percent:.1f}%"
            elif usage_percent < 95.0:
                status = HealthStatus.DEGRADED
                message = f"Disk usage high at {usage_percent:.1f}%"
            else:
                status = HealthStatus.UNHEALTHY
                message = f"Disk usage critical at {usage_percent:.1f}%"

            return HealthCheckResult(
                check_name=check_name,
                status=status,
                message=message,
                duration_seconds=duration,
                details={
                    'usage_percent': round(usage_percent, 2),
                    'available_gb': round(available_gb, 2),
                    'total_gb': round(disk_usage.total / (1024 ** 3), 2)
                }
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error("health_check_failed", check=check_name, error=str(e))
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNKNOWN,
                message=f"Failed to check disk space: {e}",
                duration_seconds=duration,
                details={'error': str(e)}
            )

    def check_memory_usage(self, threshold_percent: float = 85.0) -> HealthCheckResult:
        """
        Check memory usage

        Args:
            threshold_percent: Alert threshold for memory usage percentage

        Returns:
            HealthCheckResult
        """
        start_time = time.time()
        check_name = "memory_usage"

        try:
            memory = psutil.virtual_memory()
            duration = time.time() - start_time

            usage_percent = memory.percent
            available_gb = memory.available / (1024 ** 3)

            if usage_percent < threshold_percent:
                status = HealthStatus.HEALTHY
                message = f"Memory usage at {usage_percent:.1f}%"
            elif usage_percent < 95.0:
                status = HealthStatus.DEGRADED
                message = f"Memory usage high at {usage_percent:.1f}%"
            else:
                status = HealthStatus.UNHEALTHY
                message = f"Memory usage critical at {usage_percent:.1f}%"

            return HealthCheckResult(
                check_name=check_name,
                status=status,
                message=message,
                duration_seconds=duration,
                details={
                    'usage_percent': round(usage_percent, 2),
                    'available_gb': round(available_gb, 2),
                    'total_gb': round(memory.total / (1024 ** 3), 2)
                }
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error("health_check_failed", check=check_name, error=str(e))
            return HealthCheckResult(
                check_name=check_name,
                status=HealthStatus.UNKNOWN,
                message=f"Failed to check memory usage: {e}",
                duration_seconds=duration,
                details={'error': str(e)}
            )

    def run_all_checks(
        self,
        platforms: Optional[Dict] = None,
        db_connection=None
    ) -> Dict:
        """
        Run all health checks

        Args:
            platforms: Dict of {platform_name: poster_instance}
            db_connection: Optional database connection

        Returns:
            Dict with overall status and individual check results
        """
        results = []

        # Platform authentication checks
        if platforms:
            for platform_name, poster in platforms.items():
                result = self.check_platform_authentication(platform_name, poster)
                results.append(result)
                self.last_results[result.check_name] = result

        # API connectivity check
        api_result = self.check_kamiyo_api_connectivity()
        results.append(api_result)
        self.last_results[api_result.check_name] = api_result

        # Database check
        if db_connection:
            db_result = self.check_database_connectivity(db_connection)
            results.append(db_result)
            self.last_results[db_result.check_name] = db_result

        # System resource checks
        disk_result = self.check_disk_space()
        results.append(disk_result)
        self.last_results[disk_result.check_name] = disk_result

        memory_result = self.check_memory_usage()
        results.append(memory_result)
        self.last_results[memory_result.check_name] = memory_result

        # Determine overall status
        unhealthy_count = sum(1 for r in results if r.status == HealthStatus.UNHEALTHY)
        degraded_count = sum(1 for r in results if r.status == HealthStatus.DEGRADED)

        if unhealthy_count > 0:
            overall_status = HealthStatus.UNHEALTHY
        elif degraded_count > 0:
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY

        return {
            'status': overall_status.value,
            'timestamp': datetime.utcnow().isoformat(),
            'checks': [r.to_dict() for r in results],
            'summary': {
                'total': len(results),
                'healthy': sum(1 for r in results if r.status == HealthStatus.HEALTHY),
                'degraded': degraded_count,
                'unhealthy': unhealthy_count,
                'unknown': sum(1 for r in results if r.status == HealthStatus.UNKNOWN)
            }
        }


# Convenience function
def check_health(
    platforms: Optional[Dict] = None,
    db_connection=None,
    kamiyo_api_url: Optional[str] = None
) -> Dict:
    """
    Run all health checks

    Args:
        platforms: Dict of {platform_name: poster_instance}
        db_connection: Optional database connection
        kamiyo_api_url: Optional Kamiyo API URL

    Returns:
        Dict with health check results
    """
    checker = HealthChecker(kamiyo_api_url=kamiyo_api_url)
    return checker.run_all_checks(platforms=platforms, db_connection=db_connection)


# Example usage
if __name__ == "__main__":
    from social.monitoring.structured_logging import configure_logging

    configure_logging(log_level="INFO", json_format=False)

    # Run health checks
    health_result = check_health()

    print("="*60)
    print("HEALTH CHECK RESULTS")
    print("="*60)
    print(f"Overall Status: {health_result['status']}")
    print(f"Timestamp: {health_result['timestamp']}")
    print(f"\nSummary:")
    for key, value in health_result['summary'].items():
        print(f"  {key}: {value}")

    print(f"\nDetailed Results:")
    for check in health_result['checks']:
        status_icon = {
            'healthy': '✓',
            'degraded': '⚠',
            'unhealthy': '✗',
            'unknown': '?'
        }.get(check['status'], '?')
        print(f"  {status_icon} {check['check_name']}: {check['message']} ({check['duration_seconds']:.3f}s)")
