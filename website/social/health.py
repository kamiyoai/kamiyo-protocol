# -*- coding: utf-8 -*-
"""
Health Check Endpoint for Kamiyo Social Media Posting Module
FastAPI health endpoint with platform authentication status and API connectivity checks
"""

import os
import sys
import logging
from datetime import datetime
from typing import Dict, Optional
import requests

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from social.poster import SocialMediaPoster
from social.models import Platform

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Kamiyo Social Health Check", version="1.0.0")

# Global social poster instance (lazy initialization)
_social_poster: Optional[SocialMediaPoster] = None


class HealthStatus(BaseModel):
    """Health check response model"""
    status: str
    timestamp: str
    version: str
    kamiyo_api: Dict[str, any]
    platforms: Dict[str, Dict[str, any]]
    uptime_seconds: float


def get_social_poster() -> SocialMediaPoster:
    """Get or initialize social media poster instance"""
    global _social_poster

    if _social_poster is None:
        # Initialize social poster with environment config
        social_config = {
            'reddit': {
                'enabled': os.getenv('REDDIT_ENABLED', 'false').lower() == 'true',
                'client_id': os.getenv('REDDIT_CLIENT_ID'),
                'client_secret': os.getenv('REDDIT_CLIENT_SECRET'),
                'username': os.getenv('REDDIT_USERNAME'),
                'password': os.getenv('REDDIT_PASSWORD'),
                'subreddits': os.getenv('REDDIT_SUBREDDITS', 'defi,CryptoCurrency').split(',')
            },
            'discord': {
                'enabled': os.getenv('DISCORD_SOCIAL_ENABLED', 'false').lower() == 'true',
                'webhooks': {
                    name: url
                    for name, url in (
                        item.split('=')
                        for item in os.getenv('DISCORD_SOCIAL_WEBHOOKS', '').split(',')
                        if '=' in item
                    )
                }
            },
            'telegram': {
                'enabled': os.getenv('TELEGRAM_SOCIAL_ENABLED', 'false').lower() == 'true',
                'bot_token': os.getenv('TELEGRAM_SOCIAL_BOT_TOKEN'),
                'chat_ids': {
                    name: chat_id
                    for name, chat_id in (
                        item.split('=')
                        for item in os.getenv('TELEGRAM_SOCIAL_CHATS', '').split(',')
                        if '=' in item
                    )
                }
            },
            'x_twitter': {
                'enabled': os.getenv('X_TWITTER_ENABLED', 'false').lower() == 'true',
                'api_key': os.getenv('X_API_KEY'),
                'api_secret': os.getenv('X_API_SECRET'),
                'access_token': os.getenv('X_ACCESS_TOKEN'),
                'access_secret': os.getenv('X_ACCESS_SECRET'),
                'bearer_token': os.getenv('X_BEARER_TOKEN')
            }
        }

        _social_poster = SocialMediaPoster(social_config)
        logger.info("Social poster initialized for health checks")

    return _social_poster


def check_kamiyo_api() -> Dict:
    """Check Kamiyo API connectivity"""
    api_url = os.getenv('KAMIYO_API_URL', 'https://api.kamiyo.ai')
    api_key = os.getenv('KAMIYO_API_KEY')

    headers = {}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    try:
        response = requests.get(
            f"{api_url}/exploits",
            headers=headers,
            params={'page': 1, 'page_size': 1},
            timeout=10
        )

        if response.status_code == 200:
            return {
                'status': 'healthy',
                'reachable': True,
                'authenticated': bool(api_key),
                'response_time_ms': int(response.elapsed.total_seconds() * 1000)
            }
        else:
            return {
                'status': 'degraded',
                'reachable': True,
                'authenticated': bool(api_key),
                'error': f'HTTP {response.status_code}'
            }

    except requests.RequestException as e:
        logger.error(f"Kamiyo API health check failed: {e}")
        return {
            'status': 'unhealthy',
            'reachable': False,
            'error': str(e)
        }


def check_platform_auth(poster: SocialMediaPoster) -> Dict[str, Dict]:
    """Check authentication status for all configured platforms"""
    platform_status = {}

    for platform_enum, platform_poster in poster.platforms.items():
        try:
            status_info = platform_poster.get_status()

            platform_status[platform_enum.value] = {
                'enabled': status_info.get('enabled', False),
                'authenticated': status_info.get('authenticated', False),
                'can_post': status_info.get('can_post', False),
                'rate_limit': f"{status_info.get('posts_last_hour', 0)}/{status_info.get('rate_limit', 0)} posts/hour",
                'status': 'healthy' if status_info.get('can_post') else 'degraded'
            }

        except Exception as e:
            logger.error(f"Error checking {platform_enum.value} status: {e}")
            platform_status[platform_enum.value] = {
                'enabled': False,
                'authenticated': False,
                'status': 'unhealthy',
                'error': str(e)
            }

    return platform_status


# Store start time for uptime calculation
START_TIME = datetime.utcnow()


@app.get("/health", response_model=HealthStatus, status_code=status.HTTP_200_OK)
async def health_check():
    """
    Comprehensive health check endpoint

    Returns:
        JSON with service status, Kamiyo API connectivity, and platform authentication status
    """
    try:
        # Get social poster
        poster = get_social_poster()

        # Check Kamiyo API
        kamiyo_status = check_kamiyo_api()

        # Check platform authentication
        platform_statuses = check_platform_auth(poster)

        # Calculate uptime
        uptime = (datetime.utcnow() - START_TIME).total_seconds()

        # Determine overall health status
        overall_status = "healthy"

        # Degraded if Kamiyo API is not healthy
        if kamiyo_status['status'] != 'healthy':
            overall_status = "degraded"

        # Degraded if no platforms are enabled
        if not any(p['enabled'] for p in platform_statuses.values()):
            overall_status = "degraded"

        # Unhealthy if Kamiyo API is unreachable
        if not kamiyo_status.get('reachable', False):
            overall_status = "unhealthy"
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    'status': overall_status,
                    'timestamp': datetime.utcnow().isoformat(),
                    'version': '1.0.0',
                    'kamiyo_api': kamiyo_status,
                    'platforms': platform_statuses,
                    'uptime_seconds': uptime
                }
            )

        return {
            'status': overall_status,
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0',
            'kamiyo_api': kamiyo_status,
            'platforms': platform_statuses,
            'uptime_seconds': uptime
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                'status': 'unhealthy',
                'timestamp': datetime.utcnow().isoformat(),
                'version': '1.0.0',
                'error': str(e),
                'uptime_seconds': (datetime.utcnow() - START_TIME).total_seconds()
            }
        )


@app.get("/health/liveness")
async def liveness():
    """
    Simple liveness probe for Kubernetes
    Returns 200 if service is running
    """
    return {"status": "alive", "timestamp": datetime.utcnow().isoformat()}


@app.get("/health/readiness")
async def readiness():
    """
    Readiness probe for Kubernetes
    Returns 200 if service is ready to accept traffic
    """
    try:
        # Check if social poster can be initialized
        poster = get_social_poster()

        # Check if at least one platform is enabled
        if not poster.platforms:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    'status': 'not_ready',
                    'reason': 'No platforms configured'
                }
            )

        return {
            'status': 'ready',
            'timestamp': datetime.utcnow().isoformat(),
            'platforms_enabled': len(poster.platforms)
        }

    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                'status': 'not_ready',
                'error': str(e)
            }
        )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        'service': 'Kamiyo Social Media Posting Module',
        'version': '1.0.0',
        'endpoints': {
            'health': '/health',
            'liveness': '/health/liveness',
            'readiness': '/health/readiness'
        }
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv('HEALTH_CHECK_PORT', 8000))

    logger.info(f"Starting health check server on port {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level=os.getenv('LOG_LEVEL', 'info').lower()
    )
