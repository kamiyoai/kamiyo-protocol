# -*- coding: utf-8 -*-
"""
Minimal Kamiyo API for Testing New Features
Only loads core endpoints + new features (alert_status, watchlists, slack)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from api.models import (
    ExploitResponse,
    ExploitsListResponse,
    StatsResponse,
    HealthResponse,
    SourceHealth
)
from database import get_db

# NEW FEATURE ROUTERS - These are what we need to test
from api.alert_status import router as alert_status_router
from api.watchlists import router as watchlists_router
from api.slack import router as slack_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Kamiyo API - Test Version",
    description="Minimal API for testing new features",
    version="2.0.0-test",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://kamiyo.ai,https://www.kamiyo.ai,https://api.kamiyo.ai"
).split(",")

# In development, allow localhost
if os.getenv("ENVIRONMENT", "development") == "development":
    ALLOWED_ORIGINS.extend(["http://localhost:3000", "http://localhost:3001", "http://localhost:8000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    max_age=3600,
)

# Database instance
db = get_db()

# Include NEW FEATURE routers
app.include_router(alert_status_router, tags=["Alerts"])
app.include_router(watchlists_router, tags=["Protocol Watchlists"])
app.include_router(slack_router, tags=["Slack"])

@app.get("/", tags=["Root"])
async def root():
    """API root endpoint"""
    return {
        "name": "Kamiyo Exploit Intelligence API - Test Version",
        "version": "2.0.0-test",
        "description": "Testing new features: Alert Limits, Protocol Watchlists, Slack Integration",
        "docs": "/docs",
        "new_endpoints": {
            "alert_status": "/api/v1/alerts/status",
            "alert_history": "/api/v1/alerts/history",
            "watchlists": "/api/v1/watchlists",
            "slack": "/api/v1/slack"
        }
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Get health status of aggregation sources and database"""
    try:
        sources = db.get_source_health()
        total_exploits = db.get_total_exploits()
        chains = db.get_chains()

        # Convert sources to models
        source_models = [SourceHealth(**source) for source in sources]

        return HealthResponse(
            database_exploits=total_exploits,
            tracked_chains=len(chains),
            active_sources=len([s for s in sources if s.get('is_active')]),
            total_sources=len(sources),
            sources=source_models
        )

    except Exception as e:
        logger.error(f"Error fetching health: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/exploits", response_model=ExploitsListResponse, tags=["Exploits"])
async def get_exploits(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=1000, description="Items per page"),
    chain: str = Query(None, description="Filter by blockchain"),
    min_amount: float = Query(None, ge=0, description="Minimum loss amount (USD)"),
):
    """Get list of exploits with optional filtering and pagination"""
    try:
        offset = (page - 1) * page_size

        exploits = db.get_recent_exploits(
            limit=page_size,
            offset=offset,
            chain=chain,
            min_amount=min_amount
        )

        total = db.get_total_exploits()

        exploit_responses = [ExploitResponse(**exploit) for exploit in exploits]

        return ExploitsListResponse(
            data=exploit_responses,
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(exploits) < total
        )

    except Exception as e:
        logger.error(f"Error fetching exploits: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chains", tags=["Chains"])
async def get_chains():
    """Get list of all blockchains in database"""
    try:
        chains = db.get_chains()

        chain_counts = []
        for chain in chains:
            exploits = db.get_exploits_by_chain(chain)
            chain_counts.append({
                "chain": chain,
                "exploit_count": len(exploits)
            })

        chain_counts.sort(key=lambda x: x['exploit_count'], reverse=True)

        return {
            "total_chains": len(chains),
            "chains": chain_counts
        }

    except Exception as e:
        logger.error(f"Error fetching chains: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Not found", "detail": str(exc.detail) if hasattr(exc, 'detail') else "Resource not found"}
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Kamiyo Test API starting up...")
    logger.info(f"Database exploits: {db.get_total_exploits()}")
    logger.info(f"Tracked chains: {len(db.get_chains())}")
    logger.info("New feature routers loaded:")
    logger.info("  - Alert Status (/api/v1/alerts/*)")
    logger.info("  - Protocol Watchlists (/api/v1/watchlists/*)")
    logger.info("  - Slack Integration (/api/v1/slack/*)")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "test_main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
