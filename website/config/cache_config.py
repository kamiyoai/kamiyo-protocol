# -*- coding: utf-8 -*-
"""
Cache Configuration for KAMIYO
Centralized cache settings and TTL definitions
"""

import os
from typing import Dict, Optional
from enum import Enum


class CacheLevel(Enum):
    """Cache levels"""
    L1_MEMORY = "l1_memory"
    L2_REDIS = "l2_redis"


class CachePolicy(Enum):
    """Cache eviction policies"""
    LRU = "lru"  # Least Recently Used
    LFU = "lfu"  # Least Frequently Used
    TTL = "ttl"  # Time-based expiration
    FIFO = "fifo"  # First In First Out


class CacheConfig:
    """
    Cache configuration manager

    Centralizes all cache-related settings:
    - Redis connection
    - TTL definitions
    - Cache sizes
    - Eviction policies
    - Feature flags
    """

    def __init__(self, environment: str = None):
        """
        Initialize cache configuration

        Args:
            environment: Environment name (development, staging, production)
        """
        self.environment = environment or os.getenv('ENVIRONMENT', 'development')

        # ==========================================
        # REDIS CONNECTION
        # ==========================================

        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self.redis_password = os.getenv('REDIS_PASSWORD', '')
        self.redis_max_connections = int(os.getenv('REDIS_MAX_CONNECTIONS', '50'))
        self.redis_socket_timeout = int(os.getenv('REDIS_SOCKET_TIMEOUT', '5'))
        self.redis_socket_connect_timeout = int(os.getenv('REDIS_SOCKET_CONNECT_TIMEOUT', '5'))

        # ==========================================
        # L1 CACHE (IN-MEMORY)
        # ==========================================

        self.l1_enabled = os.getenv('CACHE_L1_ENABLED', 'true').lower() == 'true'
        self.l1_max_size = int(os.getenv('CACHE_L1_MAX_SIZE', '1000'))
        self.l1_ttl = int(os.getenv('CACHE_L1_TTL', '60'))  # seconds
        self.l1_eviction_policy = CachePolicy.LRU

        # ==========================================
        # L2 CACHE (REDIS)
        # ==========================================

        self.l2_enabled = os.getenv('CACHE_L2_ENABLED', 'true').lower() == 'true'
        self.l2_max_memory = os.getenv('REDIS_MAX_MEMORY', '2gb')
        self.l2_eviction_policy = os.getenv('REDIS_EVICTION_POLICY', 'allkeys-lru')

        # ==========================================
        # TTL DEFINITIONS (seconds)
        # ==========================================

        # Exploit data
        self.ttl_exploits_recent = int(os.getenv('CACHE_TTL_EXPLOITS_RECENT', '300'))  # 5 min
        self.ttl_exploits_single = int(os.getenv('CACHE_TTL_EXPLOITS_SINGLE', '600'))  # 10 min
        self.ttl_exploits_list = int(os.getenv('CACHE_TTL_EXPLOITS_LIST', '300'))  # 5 min
        self.ttl_exploits_historical = int(os.getenv('CACHE_TTL_EXPLOITS_HISTORICAL', '86400'))  # 24 hours

        # Statistics
        self.ttl_stats_24h = int(os.getenv('CACHE_TTL_STATS_24H', '300'))  # 5 min
        self.ttl_stats_weekly = int(os.getenv('CACHE_TTL_STATS_WEEKLY', '1800'))  # 30 min
        self.ttl_stats_monthly = int(os.getenv('CACHE_TTL_STATS_MONTHLY', '3600'))  # 1 hour
        self.ttl_stats_yearly = int(os.getenv('CACHE_TTL_STATS_YEARLY', '7200'))  # 2 hours

        # Chain data
        self.ttl_chains_list = int(os.getenv('CACHE_TTL_CHAINS_LIST', '3600'))  # 1 hour
        self.ttl_chains_stats = int(os.getenv('CACHE_TTL_CHAINS_STATS', '1800'))  # 30 min

        # Source data
        self.ttl_source_health = int(os.getenv('CACHE_TTL_SOURCE_HEALTH', '120'))  # 2 min
        self.ttl_source_rankings = int(os.getenv('CACHE_TTL_SOURCE_RANKINGS', '1800'))  # 30 min

        # User/subscription data
        self.ttl_user_profile = int(os.getenv('CACHE_TTL_USER_PROFILE', '300'))  # 5 min
        self.ttl_subscription_tier = int(os.getenv('CACHE_TTL_SUBSCRIPTION_TIER', '300'))  # 5 min
        self.ttl_customer_data = int(os.getenv('CACHE_TTL_CUSTOMER_DATA', '600'))  # 10 min

        # API responses
        self.ttl_api_response_default = int(os.getenv('CACHE_TTL_API_RESPONSE', '300'))  # 5 min

        # ==========================================
        # CACHE WARMING
        # ==========================================

        self.warming_enabled = os.getenv('CACHE_WARMING_ENABLED', 'true').lower() == 'true'
        self.warming_on_startup = os.getenv('CACHE_WARMING_STARTUP', 'true').lower() == 'true'
        self.warming_scheduled = os.getenv('CACHE_WARMING_SCHEDULED', 'true').lower() == 'true'
        self.warming_predictive = os.getenv('CACHE_WARMING_PREDICTIVE', 'false').lower() == 'true'
        self.warming_interval = int(os.getenv('CACHE_WARMING_INTERVAL', '300'))  # 5 min
        self.warming_max_concurrent = int(os.getenv('CACHE_WARMING_MAX_CONCURRENT', '5'))

        # ==========================================
        # CACHE INVALIDATION
        # ==========================================

        self.invalidation_enabled = os.getenv('CACHE_INVALIDATION_ENABLED', 'true').lower() == 'true'
        self.invalidation_cascade = os.getenv('CACHE_INVALIDATION_CASCADE', 'true').lower() == 'true'
        self.invalidation_delay = int(os.getenv('CACHE_INVALIDATION_DELAY', '0'))  # seconds

        # ==========================================
        # CACHE MIDDLEWARE
        # ==========================================

        self.middleware_enabled = os.getenv('CACHE_MIDDLEWARE_ENABLED', 'true').lower() == 'true'
        self.middleware_skip_authenticated = os.getenv('CACHE_MIDDLEWARE_SKIP_AUTH', 'true').lower() == 'true'
        self.middleware_etags_enabled = os.getenv('CACHE_MIDDLEWARE_ETAGS', 'true').lower() == 'true'
        self.middleware_cache_headers = os.getenv('CACHE_MIDDLEWARE_HEADERS', 'true').lower() == 'true'

        # ==========================================
        # SERIALIZATION
        # ==========================================

        self.serializer = os.getenv('CACHE_SERIALIZER', 'json')  # json or pickle

        # ==========================================
        # MONITORING
        # ==========================================

        self.metrics_enabled = os.getenv('CACHE_METRICS_ENABLED', 'true').lower() == 'true'
        self.metrics_per_key = os.getenv('CACHE_METRICS_PER_KEY', 'true').lower() == 'true'

        # ==========================================
        # NAMESPACE
        # ==========================================

        self.namespace = os.getenv('CACHE_NAMESPACE', 'kamiyo')

        # ==========================================
        # ENVIRONMENT-SPECIFIC OVERRIDES
        # ==========================================

        if self.environment == 'development':
            self._apply_development_config()
        elif self.environment == 'staging':
            self._apply_staging_config()
        elif self.environment == 'production':
            self._apply_production_config()

    def _apply_development_config(self):
        """Apply development environment overrides"""
        # Shorter TTLs for faster testing
        self.ttl_exploits_recent = 60  # 1 min
        self.ttl_stats_24h = 60  # 1 min
        self.warming_interval = 60  # 1 min

        # Smaller L1 cache
        self.l1_max_size = 100

    def _apply_staging_config(self):
        """Apply staging environment overrides"""
        # Similar to production but with some adjustments
        pass

    def _apply_production_config(self):
        """Apply production environment overrides"""
        # Ensure critical features are enabled
        self.l1_enabled = True
        self.l2_enabled = True
        self.warming_enabled = True
        self.invalidation_enabled = True
        self.metrics_enabled = True

    def get_ttl(self, cache_type: str) -> int:
        """
        Get TTL for cache type

        Args:
            cache_type: Type of cached data

        Returns:
            TTL in seconds
        """
        ttl_map = {
            'exploits:recent': self.ttl_exploits_recent,
            'exploits:single': self.ttl_exploits_single,
            'exploits:list': self.ttl_exploits_list,
            'exploits:historical': self.ttl_exploits_historical,
            'stats:24h': self.ttl_stats_24h,
            'stats:weekly': self.ttl_stats_weekly,
            'stats:monthly': self.ttl_stats_monthly,
            'stats:yearly': self.ttl_stats_yearly,
            'chains:list': self.ttl_chains_list,
            'chains:stats': self.ttl_chains_stats,
            'source:health': self.ttl_source_health,
            'source:rankings': self.ttl_source_rankings,
            'user:profile': self.ttl_user_profile,
            'subscription:tier': self.ttl_subscription_tier,
            'customer:data': self.ttl_customer_data,
            'api:response': self.ttl_api_response_default,
        }

        return ttl_map.get(cache_type, self.ttl_api_response_default)

    def to_dict(self) -> Dict:
        """
        Export configuration as dictionary

        Returns:
            Configuration dictionary
        """
        return {
            'environment': self.environment,
            'redis': {
                'url': self.redis_url,
                'max_connections': self.redis_max_connections,
            },
            'l1': {
                'enabled': self.l1_enabled,
                'max_size': self.l1_max_size,
                'ttl': self.l1_ttl,
            },
            'l2': {
                'enabled': self.l2_enabled,
                'max_memory': self.l2_max_memory,
                'eviction_policy': self.l2_eviction_policy,
            },
            'warming': {
                'enabled': self.warming_enabled,
                'on_startup': self.warming_on_startup,
                'scheduled': self.warming_scheduled,
                'interval': self.warming_interval,
            },
            'invalidation': {
                'enabled': self.invalidation_enabled,
                'cascade': self.invalidation_cascade,
            },
            'middleware': {
                'enabled': self.middleware_enabled,
                'etags': self.middleware_etags_enabled,
            },
            'metrics': {
                'enabled': self.metrics_enabled,
                'per_key': self.metrics_per_key,
            },
        }


# Global configuration instance
_config: Optional[CacheConfig] = None


def get_cache_config() -> CacheConfig:
    """Get global cache configuration"""
    global _config
    if _config is None:
        _config = CacheConfig()
    return _config


def set_cache_config(config: CacheConfig):
    """Set global cache configuration"""
    global _config
    _config = config
