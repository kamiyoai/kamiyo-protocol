# -*- coding: utf-8 -*-
"""
Kamiyo REST API
FastAPI application for exploit intelligence aggregation
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Query, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import logging

from api.models import (
    ExploitResponse,
    ExploitsListResponse,
    StatsResponse,
    HealthResponse,
    SourceHealth,
    ErrorResponse
)
from database import get_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Kamiyo Exploit Intelligence API",
    description="Real-time aggregation of cryptocurrency exploits from multiple sources",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database instance
db = get_db()


@app.get("/", tags=["Root"])
async def root():
    """API root endpoint"""
    return {
        "name": "Kamiyo Exploit Intelligence API",
        "version": "1.0.0",
        "description": "Aggregating crypto exploits from 20+ sources",
        "docs": "/docs",
        "endpoints": {
            "exploits": "/exploits",
            "stats": "/stats",
            "health": "/health",
            "chains": "/chains"
        }
    }


@app.get("/exploits", response_model=ExploitsListResponse, tags=["Exploits"])
async def get_exploits(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=1000, description="Items per page"),
    chain: Optional[str] = Query(None, description="Filter by blockchain"),
    min_amount: Optional[float] = Query(None, ge=0, description="Minimum loss amount (USD)"),
    protocol: Optional[str] = Query(None, description="Filter by protocol name"),
):
    """
    Get list of exploits with optional filtering and pagination

    - **page**: Page number (default: 1)
    - **page_size**: Items per page (default: 100, max: 1000)
    - **chain**: Filter by blockchain (e.g., "Ethereum", "BSC")
    - **min_amount**: Minimum loss amount in USD
    - **protocol**: Filter by protocol name (partial match)
    """
    try:
        # Calculate offset
        offset = (page - 1) * page_size

        # Fetch exploits
        exploits = db.get_recent_exploits(
            limit=page_size,
            offset=offset,
            chain=chain,
            min_amount=min_amount
        )

        # Filter by protocol if specified (case-insensitive partial match)
        if protocol:
            protocol_lower = protocol.lower()
            exploits = [
                e for e in exploits
                if protocol_lower in e['protocol'].lower()
            ]

        # Get total count (approximate for performance)
        total = db.get_total_exploits()

        # Convert to response models
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


@app.get("/exploits/{tx_hash}", response_model=ExploitResponse, tags=["Exploits"])
async def get_exploit(
    tx_hash: str = Path(..., description="Transaction hash")
):
    """
    Get single exploit by transaction hash

    - **tx_hash**: Transaction hash (or generated hash for sources without real tx hash)
    """
    try:
        exploit = db.get_exploit_by_tx_hash(tx_hash)

        if not exploit:
            raise HTTPException(status_code=404, detail="Exploit not found")

        return ExploitResponse(**exploit)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching exploit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats", response_model=StatsResponse, tags=["Statistics"])
async def get_stats(
    days: int = Query(1, ge=1, le=365, description="Time period in days")
):
    """
    Get statistics for specified time period

    - **days**: Number of days to include (default: 1, max: 365)

    Returns total exploits, total loss, affected chains/protocols, and more.
    """
    try:
        if days == 1:
            stats = db.get_stats_24h()
        else:
            stats = db.get_stats_custom(days=days)

        # Add period_days to response
        stats['period_days'] = days

        return StatsResponse(**stats)

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chains", tags=["Chains"])
async def get_chains():
    """
    Get list of all blockchains in database

    Returns list of chain names with exploit counts.
    """
    try:
        chains = db.get_chains()

        # Get count per chain
        chain_counts = []
        for chain in chains:
            exploits = db.get_exploits_by_chain(chain)
            chain_counts.append({
                "chain": chain,
                "exploit_count": len(exploits)
            })

        # Sort by count
        chain_counts.sort(key=lambda x: x['exploit_count'], reverse=True)

        return {
            "total_chains": len(chains),
            "chains": chain_counts
        }

    except Exception as e:
        logger.error(f"Error fetching chains: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Get health status of aggregation sources and database

    Returns source health, database statistics, and system status.
    """
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


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Not found", "detail": str(exc.detail)}
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


# Startup/shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("Kamiyo API starting up...")
    logger.info(f"Database exploits: {db.get_total_exploits()}")
    logger.info(f"Tracked chains: {len(db.get_chains())}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Kamiyo API shutting down...")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
