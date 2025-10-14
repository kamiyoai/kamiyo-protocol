# -*- coding: utf-8 -*-
"""
API v2 - Deep Analysis Routes

Advanced analysis endpoints for CONFIRMED exploits.

IMPORTANT: These routes provide HISTORICAL ANALYSIS only.
- They do NOT analyze arbitrary contracts for vulnerabilities
- They do NOT predict future exploits
- They ONLY analyze confirmed, historical exploits

Enterprise tier required for most endpoints.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel

from api.auth_helpers import get_current_user
from analyzers import (
    get_fork_detector,
    get_feature_extractor,
    get_pattern_clusterer
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/analysis", tags=["Deep Analysis"])


# Response models
class ForkAnalysisResponse(BaseModel):
    exploit_id: int
    analysis_type: str
    direct_forks: List[dict]
    likely_forks: List[dict]
    related_exploits: List[dict]
    total_related: int
    is_part_of_fork_family: bool


class PatternAnalysisResponse(BaseModel):
    exploit_id: int
    cluster_id: Optional[int]
    cluster_size: Optional[int]
    similar_exploits: List[dict]
    is_outlier: bool


class ForkGraphResponse(BaseModel):
    nodes: List[dict]
    edges: List[dict]
    stats: dict


# Fork Detection Endpoints

@router.get("/fork-detection/{exploit_id}", response_model=ForkAnalysisResponse)
async def analyze_forks(
    exploit_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Analyze if an exploit is a fork of other exploited contracts

    **Enterprise tier required**

    Returns:
    - Direct forks (>95% similarity)
    - Likely forks (>80% similarity)
    - Related exploits (>70% similarity)

    Note: This only compares against OTHER confirmed exploits.
    It does not analyze arbitrary contracts.
    """
    # Check tier
    if user['tier'] not in ['enterprise', 'team']:
        raise HTTPException(
            status_code=403,
            detail="Fork detection requires Enterprise or Team tier"
        )

    try:
        fork_detector = get_fork_detector()
        analysis = fork_detector.analyze(exploit_id)

        if 'error' in analysis:
            raise HTTPException(status_code=404, detail=analysis['error'])

        return ForkAnalysisResponse(**analysis)

    except Exception as e:
        logger.error(f"Fork analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fork-graph", response_model=ForkGraphResponse)
async def get_fork_graph(
    chain: Optional[str] = Query(None, description="Filter by chain"),
    min_similarity: float = Query(0.8, ge=0.0, le=1.0),
    user: dict = Depends(get_current_user)
):
    """
    Get graph of fork relationships across all exploits

    **Enterprise tier required**

    Returns:
    - Nodes: Exploits
    - Edges: Fork relationships with similarity scores
    - Stats: Fork family count, total relationships

    Useful for visualizing how exploits are connected through code reuse.
    """
    if user['tier'] != 'enterprise':
        raise HTTPException(
            status_code=403,
            detail="Fork graph visualization requires Enterprise tier"
        )

    try:
        fork_detector = get_fork_detector()
        graph = fork_detector.build_fork_graph(
            chain=chain,
            min_similarity=min_similarity
        )

        return ForkGraphResponse(**graph)

    except Exception as e:
        logger.error(f"Fork graph error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fork-families")
async def get_fork_families(
    chain: Optional[str] = Query(None, description="Filter by chain"),
    min_similarity: float = Query(0.7, ge=0.0, le=1.0),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user)
):
    """
    Get all fork families (groups of related exploits)

    **Team tier or higher required**

    Returns fork families with their root contracts and related exploits.
    Used by fork-analysis page for visualization.
    """
    if user['tier'] not in ['enterprise', 'team']:
        raise HTTPException(
            status_code=403,
            detail="Fork families require Enterprise or Team tier"
        )

    try:
        from database import get_db

        db = get_db()
        exploits = db.get_recent_exploits(limit=limit, chain=chain)

        fork_detector = get_fork_detector()

        # Find all fork relationships
        fork_families = []
        processed_exploits = set()

        for exploit in exploits:
            exploit_id = exploit.get('id')
            if exploit_id in processed_exploits:
                continue

            # Find fork family for this exploit
            family_ids = fork_detector.find_fork_family(exploit_id)

            if len(family_ids) > 1:  # Only include if there are relationships
                # Mark all as processed
                processed_exploits.update(family_ids)

                # Get timeline
                timeline = fork_detector.get_fork_timeline(family_ids)

                # Structure family data
                family = {
                    "root_contract": exploit.get('contract_address', ''),
                    "root_exploit_name": exploit.get('protocol', 'Unknown'),
                    "chain": exploit.get('chain', 'Unknown'),
                    "root_severity": 'critical' if exploit.get('amount_usd', 0) > 1000000 else 'high',
                    "total_loss_usd": sum([e.get('amount_usd', 0) for e in timeline]),
                    "first_exploit_date": min([e.get('date', '') for e in timeline]),
                    "related_contracts": [
                        {
                            "exploit_id": e.get('id'),
                            "contract_address": e.get('contract_address', ''),
                            "exploit_name": e.get('protocol', 'Unknown'),
                            "chain": e.get('chain', 'Unknown'),
                            "severity": 'critical' if e.get('amount_usd', 0) > 1000000 else 'medium',
                            "amount_usd": e.get('amount_usd', 0),
                            "date": e.get('date', ''),
                            "similarity_score": 0.85,  # Placeholder
                            "relationship_type": "similar_bytecode"
                        }
                        for e in timeline if e.get('id') != exploit_id
                    ]
                }

                fork_families.append(family)

        return {
            "fork_families": fork_families,
            "total_families": len(fork_families),
            "total_exploits_analyzed": len(exploits)
        }

    except Exception as e:
        logger.error(f"Fork families error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fork-family/{exploit_id}")
async def get_fork_family(
    exploit_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Get all exploits in the same fork family

    **Enterprise tier required**

    Returns chronological timeline of exploits that share the same codebase.
    Useful for understanding how a vulnerable codebase was exploited over time.
    """
    if user['tier'] != 'enterprise':
        raise HTTPException(
            status_code=403,
            detail="Fork family analysis requires Enterprise tier"
        )

    try:
        fork_detector = get_fork_detector()

        # Get family members
        family_ids = fork_detector.find_fork_family(exploit_id)

        # Get timeline
        timeline = fork_detector.get_fork_timeline(family_ids)

        return {
            "exploit_id": exploit_id,
            "family_size": len(family_ids),
            "family_members": family_ids,
            "timeline": timeline,
        }

    except Exception as e:
        logger.error(f"Fork family error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Pattern Recognition Endpoints

@router.get("/pattern-cluster/{exploit_id}", response_model=PatternAnalysisResponse)
async def analyze_pattern(
    exploit_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Analyze which pattern cluster an exploit belongs to

    **Enterprise tier required**

    Clusters exploits by:
    - Attack vector (reentrancy, oracle, etc.)
    - Protocol type (DEX, lending, etc.)
    - Amount range
    - Temporal patterns

    Returns exploits with similar characteristics.
    """
    if user['tier'] not in ['enterprise', 'team']:
        raise HTTPException(
            status_code=403,
            detail="Pattern clustering requires Enterprise or Team tier"
        )

    try:
        clusterer = get_pattern_clusterer()
        analysis = clusterer.analyze(exploit_id)

        if 'error' in analysis:
            raise HTTPException(status_code=404, detail=analysis['error'])

        return PatternAnalysisResponse(**analysis)

    except Exception as e:
        logger.error(f"Pattern analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pattern-anomalies")
async def find_anomalies(
    chain: Optional[str] = Query(None, description="Filter by chain"),
    limit: int = Query(50, le=200),
    user: dict = Depends(get_current_user)
):
    """
    Find exploit anomalies (outliers that don't fit patterns)

    **Enterprise tier required**

    Returns exploits that are unusual or unique in their characteristics.
    These are often the most interesting exploits to study.
    """
    if user['tier'] not in ['enterprise', 'team']:
        raise HTTPException(
            status_code=403,
            detail="Anomaly detection requires Enterprise or Team tier"
        )

    try:
        from database import get_db

        db = get_db()
        exploits = db.get_recent_exploits(limit=limit, chain=chain)

        clusterer = get_pattern_clusterer()
        anomalies = clusterer.find_pattern_anomalies(exploits)

        return {
            "total_analyzed": len(exploits),
            "anomalies_found": len(anomalies),
            "anomalies": anomalies,
        }

    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feature-extraction/{exploit_id}")
async def extract_features(
    exploit_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Extract analytical features from an exploit

    **Pro tier or higher**

    Returns feature vector used for clustering and pattern matching.
    Useful for custom analysis and research.
    """
    if user['tier'] == 'free':
        raise HTTPException(
            status_code=403,
            detail="Feature extraction requires Pro tier or higher"
        )

    try:
        extractor = get_feature_extractor()
        features = extractor.analyze(exploit_id)

        if 'error' in features:
            raise HTTPException(status_code=404, detail=features['error'])

        return features

    except Exception as e:
        logger.error(f"Feature extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Cluster Analysis Endpoints

@router.get("/clusters")
async def get_all_clusters(
    chain: Optional[str] = Query(None, description="Filter by chain"),
    limit: int = Query(100, le=500),
    user: dict = Depends(get_current_user)
):
    """
    Get all exploit clusters with their characteristics

    **Enterprise tier required**

    Returns:
    - All clusters found
    - Cluster statistics
    - Common characteristics of each cluster
    """
    if user['tier'] not in ['enterprise', 'team']:
        raise HTTPException(
            status_code=403,
            detail="Cluster analysis requires Enterprise or Team tier"
        )

    try:
        from database import get_db

        db = get_db()
        exploits = db.get_recent_exploits(limit=limit, chain=chain)

        clusterer = get_pattern_clusterer()
        clusters = clusterer.cluster_exploits(exploits)

        # Get characteristics for each cluster
        cluster_details = []
        for cluster_id, members in clusters.items():
            chars = clusterer.get_cluster_characteristics(members)
            cluster_details.append({
                "cluster_id": cluster_id,
                "characteristics": chars,
                "member_count": len(members),
                "members": members[:10],  # First 10 members
            })

        return {
            "total_clusters": len(clusters),
            "total_exploits": len(exploits),
            "clusters": cluster_details,
        }

    except Exception as e:
        logger.error(f"Cluster retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
