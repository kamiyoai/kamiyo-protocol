# -*- coding: utf-8 -*-
"""
Kamiyo CloudFlare CDN Configuration
Manages CloudFlare CDN caching and optimization

Features:
- Cache rule management
- Purge cache operations
- CDN analytics fetching
- Static asset optimization
- Security settings

Note: Requires CloudFlare API token with appropriate permissions
"""

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


class CloudFlareConfig:
    """CloudFlare API configuration"""

    # API endpoints
    API_BASE_URL = 'https://api.cloudflare.com/client/v4'

    # Cache TTLs (seconds)
    STATIC_ASSET_TTL = 31536000  # 1 year
    API_GET_TTL = 300  # 5 minutes
    API_POST_TTL = 0  # No cache

    # Browser cache TTLs
    BROWSER_CACHE_TTL = 3600  # 1 hour

    # Cache levels
    CACHE_LEVEL_AGGRESSIVE = 'aggressive'
    CACHE_LEVEL_BASIC = 'basic'
    CACHE_LEVEL_SIMPLIFIED = 'simplified'


class CloudFlareClient:
    """
    CloudFlare API client

    Manages CloudFlare CDN configuration via API
    """

    def __init__(
        self,
        api_token: Optional[str] = None,
        zone_id: Optional[str] = None
    ):
        """
        Initialize CloudFlare client

        Args:
            api_token: CloudFlare API token (defaults to CLOUDFLARE_API_TOKEN env var)
            zone_id: CloudFlare zone ID (defaults to CLOUDFLARE_ZONE_ID env var)
        """
        self.api_token = api_token or os.getenv('CLOUDFLARE_API_TOKEN')
        self.zone_id = zone_id or os.getenv('CLOUDFLARE_ZONE_ID')

        if not self.api_token:
            raise ValueError("CloudFlare API token not provided")

        if not self.zone_id:
            raise ValueError("CloudFlare zone ID not provided")

        # Setup session with retries
        self.session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)

        # Set headers
        self.session.headers.update({
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        })

        logger.info(f"CloudFlare client initialized for zone: {self.zone_id}")

    def _make_request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make API request to CloudFlare

        Args:
            method: HTTP method
            endpoint: API endpoint (without base URL)
            **kwargs: Additional request parameters

        Returns:
            API response data

        Raises:
            requests.HTTPError: If request fails
        """
        url = f"{CloudFlareConfig.API_BASE_URL}{endpoint}"

        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()

            data = response.json()

            if not data.get('success'):
                errors = data.get('errors', [])
                raise Exception(f"CloudFlare API error: {errors}")

            return data.get('result', {})

        except requests.RequestException as e:
            logger.error(f"CloudFlare API request failed: {e}")
            raise

    # ========================================================================
    # Cache Management
    # ========================================================================

    def purge_cache_all(self) -> Dict[str, Any]:
        """
        Purge all cache for zone

        Returns:
            API response

        Warning: Use sparingly, purges everything
        """
        logger.info("Purging all cache")

        return self._make_request(
            'POST',
            f'/zones/{self.zone_id}/purge_cache',
            json={'purge_everything': True}
        )

    def purge_cache_by_urls(self, urls: List[str]) -> Dict[str, Any]:
        """
        Purge cache for specific URLs

        Args:
            urls: List of URLs to purge

        Returns:
            API response
        """
        logger.info(f"Purging cache for {len(urls)} URLs")

        # CloudFlare limit: 30 URLs per request
        if len(urls) > 30:
            logger.warning(f"Purging {len(urls)} URLs (limit: 30 per request)")

        return self._make_request(
            'POST',
            f'/zones/{self.zone_id}/purge_cache',
            json={'files': urls[:30]}  # Limit to 30
        )

    def purge_cache_by_tags(self, tags: List[str]) -> Dict[str, Any]:
        """
        Purge cache by cache tags

        Args:
            tags: List of cache tags to purge

        Returns:
            API response

        Note: Requires CloudFlare Enterprise plan
        """
        logger.info(f"Purging cache by tags: {tags}")

        return self._make_request(
            'POST',
            f'/zones/{self.zone_id}/purge_cache',
            json={'tags': tags}
        )

    def purge_cache_by_prefix(self, prefixes: List[str]) -> Dict[str, Any]:
        """
        Purge cache by URL prefix

        Args:
            prefixes: List of URL prefixes to purge

        Returns:
            API response

        Note: Requires CloudFlare Enterprise plan
        """
        logger.info(f"Purging cache by prefixes: {prefixes}")

        return self._make_request(
            'POST',
            f'/zones/{self.zone_id}/purge_cache',
            json={'prefixes': prefixes}
        )

    # ========================================================================
    # Page Rules
    # ========================================================================

    def create_page_rule(
        self,
        url_pattern: str,
        actions: Dict[str, Any],
        priority: int = 1,
        status: str = 'active'
    ) -> Dict[str, Any]:
        """
        Create page rule

        Args:
            url_pattern: URL pattern to match (e.g., "*example.com/api/*")
            actions: Dictionary of actions (e.g., {"cache_level": "bypass"})
            priority: Rule priority (lower = higher priority)
            status: 'active' or 'disabled'

        Returns:
            Created page rule

        Example actions:
            - cache_level: bypass, basic, simplified, aggressive
            - edge_cache_ttl: seconds
            - browser_cache_ttl: seconds
            - cache_on_cookie: cookie_name
        """
        logger.info(f"Creating page rule: {url_pattern}")

        # Format actions
        formatted_actions = [
            {'id': action_id, 'value': value}
            for action_id, value in actions.items()
        ]

        data = {
            'targets': [{
                'target': 'url',
                'constraint': {
                    'operator': 'matches',
                    'value': url_pattern
                }
            }],
            'actions': formatted_actions,
            'priority': priority,
            'status': status
        }

        return self._make_request(
            'POST',
            f'/zones/{self.zone_id}/pagerules',
            json=data
        )

    def list_page_rules(self) -> List[Dict[str, Any]]:
        """
        List all page rules

        Returns:
            List of page rules
        """
        return self._make_request(
            'GET',
            f'/zones/{self.zone_id}/pagerules'
        )

    def delete_page_rule(self, rule_id: str) -> Dict[str, Any]:
        """
        Delete page rule

        Args:
            rule_id: Page rule ID

        Returns:
            API response
        """
        logger.info(f"Deleting page rule: {rule_id}")

        return self._make_request(
            'DELETE',
            f'/zones/{self.zone_id}/pagerules/{rule_id}'
        )

    # ========================================================================
    # Cache Settings
    # ========================================================================

    def set_cache_level(self, level: str) -> Dict[str, Any]:
        """
        Set cache level for zone

        Args:
            level: 'aggressive', 'basic', or 'simplified'

        Returns:
            API response
        """
        logger.info(f"Setting cache level: {level}")

        return self._make_request(
            'PATCH',
            f'/zones/{self.zone_id}/settings/cache_level',
            json={'value': level}
        )

    def set_browser_cache_ttl(self, ttl: int) -> Dict[str, Any]:
        """
        Set browser cache TTL

        Args:
            ttl: TTL in seconds

        Returns:
            API response
        """
        logger.info(f"Setting browser cache TTL: {ttl}s")

        return self._make_request(
            'PATCH',
            f'/zones/{self.zone_id}/settings/browser_cache_ttl',
            json={'value': ttl}
        )

    def enable_always_online(self) -> Dict[str, Any]:
        """
        Enable Always Online (serve stale content when origin is down)

        Returns:
            API response
        """
        logger.info("Enabling Always Online")

        return self._make_request(
            'PATCH',
            f'/zones/{self.zone_id}/settings/always_online',
            json={'value': 'on'}
        )

    # ========================================================================
    # Analytics
    # ========================================================================

    def get_analytics(
        self,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get CDN analytics

        Args:
            since: Start time (defaults to 24 hours ago)
            until: End time (defaults to now)

        Returns:
            Analytics data
        """
        if since is None:
            since = datetime.utcnow() - timedelta(days=1)

        if until is None:
            until = datetime.utcnow()

        params = {
            'since': since.isoformat(),
            'until': until.isoformat()
        }

        return self._make_request(
            'GET',
            f'/zones/{self.zone_id}/analytics/dashboard',
            params=params
        )

    def get_bandwidth_stats(
        self,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get bandwidth statistics

        Args:
            since: Start time
            until: End time

        Returns:
            Bandwidth stats
        """
        analytics = self.get_analytics(since, until)

        totals = analytics.get('totals', {})

        return {
            'bandwidth_total': totals.get('bandwidth', {}).get('all', 0),
            'bandwidth_cached': totals.get('bandwidth', {}).get('cached', 0),
            'bandwidth_uncached': totals.get('bandwidth', {}).get('uncached', 0),
            'requests_total': totals.get('requests', {}).get('all', 0),
            'requests_cached': totals.get('requests', {}).get('cached', 0),
            'requests_uncached': totals.get('requests', {}).get('uncached', 0),
            'cache_hit_ratio': (
                totals.get('requests', {}).get('cached', 0) /
                totals.get('requests', {}).get('all', 1)
            )
        }

    # ========================================================================
    # Utility Methods
    # ========================================================================

    def setup_kamiyo_cache_rules(self):
        """
        Setup recommended cache rules for Kamiyo

        Creates page rules for:
        - Static assets (1 year cache)
        - API GET endpoints (5 minutes cache)
        - API POST/PUT/DELETE endpoints (no cache)
        """
        logger.info("Setting up Kamiyo cache rules")

        # Get base domain from zone
        zone_info = self._make_request('GET', f'/zones/{self.zone_id}')
        domain = zone_info.get('name', '')

        # Rule 1: Static assets (highest priority)
        try:
            self.create_page_rule(
                url_pattern=f'*{domain}/static/*',
                actions={
                    'cache_level': 'cache_everything',
                    'edge_cache_ttl': CloudFlareConfig.STATIC_ASSET_TTL,
                    'browser_cache_ttl': CloudFlareConfig.STATIC_ASSET_TTL
                },
                priority=1
            )
            logger.info("Created static assets cache rule")
        except Exception as e:
            logger.error(f"Failed to create static assets rule: {e}")

        # Rule 2: API GET endpoints (medium priority)
        try:
            self.create_page_rule(
                url_pattern=f'*{domain}/api/*',
                actions={
                    'cache_level': 'cache_everything',
                    'edge_cache_ttl': CloudFlareConfig.API_GET_TTL,
                    'browser_cache_ttl': CloudFlareConfig.BROWSER_CACHE_TTL
                },
                priority=2
            )
            logger.info("Created API GET cache rule")
        except Exception as e:
            logger.error(f"Failed to create API GET rule: {e}")

        # Rule 3: Bypass cache for dynamic content
        try:
            self.create_page_rule(
                url_pattern=f'*{domain}/api/webhooks/*',
                actions={
                    'cache_level': 'bypass'
                },
                priority=3
            )
            logger.info("Created bypass cache rule for webhooks")
        except Exception as e:
            logger.error(f"Failed to create bypass rule: {e}")

        logger.info("Kamiyo cache rules setup complete")


# Convenience functions

def get_cloudflare_client() -> CloudFlareClient:
    """
    Get CloudFlare client instance

    Returns:
        CloudFlareClient instance
    """
    return CloudFlareClient()


def purge_api_cache():
    """Purge API endpoint cache"""
    client = get_cloudflare_client()
    return client.purge_cache_by_prefix(['/api/'])


def get_cdn_stats() -> Dict[str, Any]:
    """Get CDN statistics"""
    client = get_cloudflare_client()
    return client.get_bandwidth_stats()
