# -*- coding: utf-8 -*-
"""
Protocol Watchlist API Routes
Enterprise feature for monitoring specific protocols
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import logging

from api.auth import get_current_user
from api.watchlists.manager import get_watchlist_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/watchlists", tags=["Protocol Watchlists"])


class CreateWatchlistRequest(BaseModel):
    """Request to create a watchlist"""
    name: str = Field(..., min_length=1, max_length=100)
    protocols: List[str] = Field(..., min_items=1, max_items=50)
    chains: Optional[List[str]] = None
    min_amount_usd: Optional[float] = Field(None, ge=0)


class UpdateWatchlistRequest(BaseModel):
    """Request to update a watchlist"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    protocols: Optional[List[str]] = Field(None, min_items=1, max_items=50)
    chains: Optional[List[str]] = None
    min_amount_usd: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class WatchlistResponse(BaseModel):
    """Watchlist response"""
    id: int
    name: str
    protocols: List[str]
    chains: Optional[List[str]]
    min_amount_usd: Optional[float]
    is_active: bool
    created_at: str
    updated_at: str
    match_count: int


class WatchlistMatchResponse(BaseModel):
    """Watchlist match response"""
    exploit_id: int
    tx_hash: str
    protocol: str
    chain: str
    amount_usd: Optional[float]
    timestamp: str
    matched_at: str
    notified: bool


@router.post("", response_model=WatchlistResponse, status_code=201)
async def create_watchlist(
    request: CreateWatchlistRequest,
    user=Depends(get_current_user)
):
    """
    Create a new protocol watchlist (Enterprise only)

    Monitor specific protocols across chains with custom filters.
    """
    try:
        manager = get_watchlist_manager()

        watchlist = manager.create_watchlist(
            user_id=user['id'],
            name=request.name,
            protocols=request.protocols,
            chains=request.chains,
            min_amount_usd=request.min_amount_usd
        )

        # Add metadata
        watchlist['created_at'] = watchlist.get('created_at', '')
        watchlist['updated_at'] = watchlist.get('updated_at', '')
        watchlist['match_count'] = 0

        return WatchlistResponse(**watchlist)

    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating watchlist: {e}")
        raise HTTPException(status_code=500, detail="Failed to create watchlist")


@router.get("", response_model=List[WatchlistResponse])
async def list_watchlists(user=Depends(get_current_user)):
    """
    Get all watchlists for current user

    Returns list of protocol watchlists with match counts.
    """
    manager = get_watchlist_manager()
    watchlists = manager.get_user_watchlists(user['id'])

    return [WatchlistResponse(**w) for w in watchlists]


@router.get("/{watchlist_id}", response_model=WatchlistResponse)
async def get_watchlist(
    watchlist_id: int,
    user=Depends(get_current_user)
):
    """Get details of a specific watchlist"""
    manager = get_watchlist_manager()
    watchlists = manager.get_user_watchlists(user['id'])

    watchlist = next((w for w in watchlists if w['id'] == watchlist_id), None)

    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    return WatchlistResponse(**watchlist)


@router.patch("/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(
    watchlist_id: int,
    request: UpdateWatchlistRequest,
    user=Depends(get_current_user)
):
    """Update a watchlist"""
    manager = get_watchlist_manager()

    # Build updates dict (only include provided fields)
    updates = {}
    if request.name is not None:
        updates['name'] = request.name
    if request.protocols is not None:
        updates['protocols'] = request.protocols
    if request.chains is not None:
        updates['chains'] = request.chains
    if request.min_amount_usd is not None:
        updates['min_amount_usd'] = request.min_amount_usd
    if request.is_active is not None:
        updates['is_active'] = request.is_active

    success = manager.update_watchlist(watchlist_id, user['id'], **updates)

    if not success:
        raise HTTPException(status_code=404, detail="Watchlist not found or access denied")

    # Return updated watchlist
    return await get_watchlist(watchlist_id, user)


@router.delete("/{watchlist_id}", status_code=204)
async def delete_watchlist(
    watchlist_id: int,
    user=Depends(get_current_user)
):
    """Delete a watchlist"""
    manager = get_watchlist_manager()
    success = manager.delete_watchlist(watchlist_id, user['id'])

    if not success:
        raise HTTPException(status_code=404, detail="Watchlist not found or access denied")

    return None


@router.get("/{watchlist_id}/matches", response_model=List[WatchlistMatchResponse])
async def get_watchlist_matches(
    watchlist_id: int,
    limit: int = 100,
    user=Depends(get_current_user)
):
    """
    Get exploits that matched this watchlist

    Returns recent exploits that triggered this watchlist.
    """
    # Verify ownership
    manager = get_watchlist_manager()
    watchlists = manager.get_user_watchlists(user['id'])

    if not any(w['id'] == watchlist_id for w in watchlists):
        raise HTTPException(status_code=404, detail="Watchlist not found")

    matches = manager.get_watchlist_matches(watchlist_id, limit)

    return [WatchlistMatchResponse(**m) for m in matches]
