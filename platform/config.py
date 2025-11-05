# -*- coding: utf-8 -*-
"""
KAMIYO Platform Configuration
Multi-tier deployment configuration system
"""

import os
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class DeploymentMode(Enum):
    """Deployment mode determines feature availability"""
    OPEN_SOURCE = "open_source"
    CLOUD_BASIC = "cloud_basic"
    CLOUD_PRO = "cloud_pro"
    CLOUD_ENTERPRISE = "cloud_enterprise"


@dataclass
class PlatformConfig:
    """
    Platform-level configuration
    Defines feature availability and limits per deployment tier
    """

    # Deployment
    mode: DeploymentMode
    is_managed_hosting: bool
    is_multi_tenant: bool

    # Features
    enable_ml_advanced: bool
    enable_multi_protocol: bool
    enable_cross_protocol_correlation: bool
    enable_predictive_analytics: bool
    enable_social_sentiment: bool
    enable_enterprise_features: bool

    # Limits
    max_monitored_protocols: int
    max_api_calls_per_day: int
    max_alerts_per_day: int
    max_historical_data_days: int

    # Support
    support_tier: str
    sla_guaranteed: bool
    priority_support: bool

    # Customization
    white_label_allowed: bool
    custom_branding: bool
    custom_domain: bool


def get_platform_config() -> PlatformConfig:
    """
    Get platform configuration based on environment

    Returns:
        PlatformConfig with appropriate feature flags
    """
    mode_str = os.getenv('DEPLOYMENT_MODE', 'open_source')
    mode = DeploymentMode(mode_str)

    configs = {
        DeploymentMode.OPEN_SOURCE: PlatformConfig(
            mode=mode,
            is_managed_hosting=False,
            is_multi_tenant=False,
            enable_ml_advanced=False,
            enable_multi_protocol=False,
            enable_cross_protocol_correlation=False,
            enable_predictive_analytics=True,
            enable_social_sentiment=False,
            enable_enterprise_features=False,
            max_monitored_protocols=1,
            max_api_calls_per_day=100000,
            max_alerts_per_day=1000,
            max_historical_data_days=90,
            support_tier='community',
            sla_guaranteed=False,
            priority_support=False,
            white_label_allowed=False,
            custom_branding=False,
            custom_domain=False
        ),

        DeploymentMode.CLOUD_BASIC: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,
            enable_ml_advanced=False,
            enable_multi_protocol=True,
            enable_cross_protocol_correlation=False,
            enable_predictive_analytics=True,
            enable_social_sentiment=False,
            enable_enterprise_features=False,
            max_monitored_protocols=5,
            max_api_calls_per_day=10000,
            max_alerts_per_day=100,
            max_historical_data_days=30,
            support_tier='email',
            sla_guaranteed=False,
            priority_support=False,
            white_label_allowed=False,
            custom_branding=False,
            custom_domain=False
        ),

        DeploymentMode.CLOUD_PRO: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,
            enable_ml_advanced=True,
            enable_multi_protocol=True,
            enable_cross_protocol_correlation=True,
            enable_predictive_analytics=True,
            enable_social_sentiment=True,
            enable_enterprise_features=False,
            max_monitored_protocols=20,
            max_api_calls_per_day=100000,
            max_alerts_per_day=500,
            max_historical_data_days=180,
            support_tier='priority',
            sla_guaranteed=False,
            priority_support=True,
            white_label_allowed=False,
            custom_branding=True,
            custom_domain=True
        ),

        DeploymentMode.CLOUD_ENTERPRISE: PlatformConfig(
            mode=mode,
            is_managed_hosting=True,
            is_multi_tenant=True,
            enable_ml_advanced=True,
            enable_multi_protocol=True,
            enable_cross_protocol_correlation=True,
            enable_predictive_analytics=True,
            enable_social_sentiment=True,
            enable_enterprise_features=True,
            max_monitored_protocols=999,
            max_api_calls_per_day=1000000,
            max_alerts_per_day=10000,
            max_historical_data_days=365,
            support_tier='dedicated',
            sla_guaranteed=True,
            priority_support=True,
            white_label_allowed=True,
            custom_branding=True,
            custom_domain=True
        ),
    }

    return configs[mode]


def is_feature_enabled(feature: str) -> bool:
    """
    Check if a feature is enabled for current deployment mode

    Args:
        feature: Feature name to check

    Returns:
        True if feature is enabled, False otherwise
    """
    config = get_platform_config()
    return getattr(config, f"enable_{feature}", False)


def get_limit(limit_name: str) -> int:
    """
    Get limit value for current deployment mode

    Args:
        limit_name: Limit name to retrieve

    Returns:
        Limit value as integer
    """
    config = get_platform_config()
    return getattr(config, f"max_{limit_name}", 0)
