"""
MCP Configuration Management

Loads and manages configuration for the KAMIYO MCP server.
Configuration is loaded from environment variables.
"""

import os
from typing import Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


@dataclass
class MCPConfig:
    """MCP Server Configuration"""

    # Server Info
    name: str
    version: str
    description: str

    # API Integration
    kamiyo_api_url: str
    kamiyo_api_timeout: int

    # Authentication
    jwt_secret: str
    jwt_algorithm: str
    token_expiry_days: int

    # Stripe Integration
    stripe_secret_key: Optional[str]
    stripe_webhook_secret: Optional[str]

    # Database
    database_url: str

    # Rate Limiting (per subscription tier)
    rate_limit_personal_rpm: int
    rate_limit_personal_daily: int
    rate_limit_team_rpm: int
    rate_limit_team_daily: int
    rate_limit_enterprise_rpm: int
    rate_limit_enterprise_daily: int

    # Feature Flags
    enable_wallet_monitoring: bool
    enable_advanced_analytics: bool
    enable_real_time_alerts: bool

    # Logging
    log_level: str

    # Environment
    environment: str

    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.environment == "production"


def load_mcp_config() -> MCPConfig:
    """Load MCP configuration from environment variables"""

    # Determine environment
    environment = os.getenv("ENVIRONMENT", "development")

    # Server info
    name = os.getenv("MCP_SERVER_NAME", "kamiyo-security")
    version = os.getenv("MCP_SERVER_VERSION", "1.0.0")
    description = os.getenv(
        "MCP_SERVER_DESCRIPTION",
        "Real-time crypto exploit intelligence for AI agents"
    )

    # API Integration
    kamiyo_api_url = os.getenv(
        "KAMIYO_API_URL",
        "http://localhost:8000" if environment == "development" else "https://api.kamiyo.ai"
    )
    kamiyo_api_timeout = int(os.getenv("KAMIYO_API_TIMEOUT", "30"))

    # Authentication
    jwt_secret = os.getenv("MCP_JWT_SECRET")
    if not jwt_secret:
        if environment == "production":
            raise ValueError("MCP_JWT_SECRET must be set in production")
        jwt_secret = "dev_jwt_secret_change_in_production"

    jwt_algorithm = os.getenv("MCP_JWT_ALGORITHM", "HS256")
    token_expiry_days = int(os.getenv("MCP_TOKEN_EXPIRY_DAYS", "365"))

    # Stripe Integration
    stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")
    stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    # Database
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        if environment == "production":
            raise ValueError("DATABASE_URL must be set in production")
        database_url = "sqlite:///data/kamiyo.db"

    # Rate Limiting
    rate_limit_personal_rpm = int(os.getenv("RATE_LIMIT_PERSONAL_RPM", "30"))
    rate_limit_personal_daily = int(os.getenv("RATE_LIMIT_PERSONAL_DAILY", "1000"))
    rate_limit_team_rpm = int(os.getenv("RATE_LIMIT_TEAM_RPM", "100"))
    rate_limit_team_daily = int(os.getenv("RATE_LIMIT_TEAM_DAILY", "10000"))
    rate_limit_enterprise_rpm = int(os.getenv("RATE_LIMIT_ENTERPRISE_RPM", "500"))
    rate_limit_enterprise_daily = int(os.getenv("RATE_LIMIT_ENTERPRISE_DAILY", "100000"))

    # Feature Flags
    enable_wallet_monitoring = os.getenv("ENABLE_WALLET_MONITORING", "true").lower() == "true"
    enable_advanced_analytics = os.getenv("ENABLE_ADVANCED_ANALYTICS", "true").lower() == "true"
    enable_real_time_alerts = os.getenv("ENABLE_REAL_TIME_ALERTS", "true").lower() == "true"

    # Logging
    log_level = os.getenv("LOG_LEVEL", "INFO")

    return MCPConfig(
        name=name,
        version=version,
        description=description,
        kamiyo_api_url=kamiyo_api_url,
        kamiyo_api_timeout=kamiyo_api_timeout,
        jwt_secret=jwt_secret,
        jwt_algorithm=jwt_algorithm,
        token_expiry_days=token_expiry_days,
        stripe_secret_key=stripe_secret_key,
        stripe_webhook_secret=stripe_webhook_secret,
        database_url=database_url,
        rate_limit_personal_rpm=rate_limit_personal_rpm,
        rate_limit_personal_daily=rate_limit_personal_daily,
        rate_limit_team_rpm=rate_limit_team_rpm,
        rate_limit_team_daily=rate_limit_team_daily,
        rate_limit_enterprise_rpm=rate_limit_enterprise_rpm,
        rate_limit_enterprise_daily=rate_limit_enterprise_daily,
        enable_wallet_monitoring=enable_wallet_monitoring,
        enable_advanced_analytics=enable_advanced_analytics,
        enable_real_time_alerts=enable_real_time_alerts,
        log_level=log_level,
        environment=environment,
    )


# Global config instance
_mcp_config: Optional[MCPConfig] = None


def get_mcp_config() -> MCPConfig:
    """Get the global MCP configuration instance"""
    global _mcp_config
    if _mcp_config is None:
        _mcp_config = load_mcp_config()
    return _mcp_config


def reload_mcp_config() -> MCPConfig:
    """Reload configuration from environment (useful for testing)"""
    global _mcp_config
    _mcp_config = load_mcp_config()
    return _mcp_config
