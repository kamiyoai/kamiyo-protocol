# -*- coding: utf-8 -*-
"""
Pattern Clusterer

Groups CONFIRMED historical exploits by similarity using unsupervised ML.

IMPORTANT: This is DESCRIPTIVE clustering of historical data, NOT prediction.
- It groups past exploits by shared characteristics
- It does NOT predict future exploits
- It does NOT identify vulnerabilities
"""

import logging
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
import math

from analyzers.base import PatternAnalyzer
from analyzers.pattern_recognition.feature_extractor import (
    FeatureExtractor,
    ExploitFeatures,
    get_feature_extractor
)

logger = logging.getLogger(__name__)


class PatternClusterer(PatternAnalyzer):
    """
    Clusters CONFIRMED exploits by patterns

    Uses simple distance-based clustering (similar to DBSCAN but simpler)
    to group exploits that share characteristics.

    Use cases:
    - "Show me groups of similar exploits"
    - "What patterns exist in high-value exploits?"
    - "Find exploits that happened in similar conditions"
    """

    def __init__(self):
        super().__init__()
        self.feature_extractor = get_feature_extractor()

    def analyze(self, exploit_id: int) -> Dict[str, any]:
        """
        Analyze which cluster an exploit belongs to

        Returns the cluster and similar exploits in that cluster
        """
        exploit = self.get_exploit(exploit_id)
        if not exploit:
            return {"error": "Exploit not found"}

        # Get all exploits for clustering
        all_exploits = self.get_all_exploits(
            chain=exploit.get('chain'),
            limit=200
        )

        # Cluster all exploits
        clusters = self.cluster_exploits(all_exploits)

        # Find which cluster this exploit belongs to
        exploit_cluster = None
        cluster_members = []

        for cluster_id, members in clusters.items():
            if exploit_id in members:
                exploit_cluster = cluster_id
                cluster_members = members
                break

        if exploit_cluster is None:
            return {
                "exploit_id": exploit_id,
                "cluster_id": None,
                "is_outlier": True,
                "similar_exploits": [],
            }

        # Get details of cluster members
        similar_exploits = []
        for member_id in cluster_members:
            if member_id != exploit_id:
                member = next((e for e in all_exploits if e['id'] == member_id), None)
                if member:
                    similar_exploits.append({
                        "exploit_id": member_id,
                        "protocol": member['protocol'],
                        "chain": member['chain'],
                        "amount_usd": member.get('amount_usd', 0),
                        "timestamp": member['timestamp'],
                    })

        return {
            "exploit_id": exploit_id,
            "cluster_id": exploit_cluster,
            "cluster_size": len(cluster_members),
            "similar_exploits": similar_exploits[:10],  # Top 10
            "is_outlier": False,
        }

    def cluster_exploits(
        self,
        exploits: List[Dict[str, any]],
        eps: float = 0.3,
        min_samples: int = 2
    ) -> Dict[int, List[int]]:
        """
        Cluster exploits using distance-based algorithm

        Args:
            exploits: List of exploit dictionaries
            eps: Maximum distance for points to be in same cluster
            min_samples: Minimum cluster size

        Returns:
            Dictionary mapping cluster_id -> list of exploit_ids
        """
        if not exploits:
            return {}

        # Extract features for all exploits
        features_list = self.feature_extractor.extract_batch(exploits)

        # Convert to feature vectors
        vectors = [
            self.feature_extractor._features_to_vector(f)
            for f in features_list
        ]

        # Simple clustering algorithm (inspired by DBSCAN)
        clusters = {}
        visited = set()
        cluster_id = 0

        for i, feat in enumerate(features_list):
            if i in visited:
                continue

            # Find neighbors within eps distance
            neighbors = self._find_neighbors(i, vectors, eps)

            if len(neighbors) < min_samples:
                continue  # Noise point

            # Create new cluster
            cluster = []
            stack = neighbors.copy()

            while stack:
                idx = stack.pop()

                if idx in visited:
                    continue

                visited.add(idx)
                cluster.append(features_list[idx].exploit_id)

                # Expand cluster
                point_neighbors = self._find_neighbors(idx, vectors, eps)
                if len(point_neighbors) >= min_samples:
                    stack.extend(point_neighbors)

            if cluster:
                clusters[cluster_id] = cluster
                cluster_id += 1

        return clusters

    def get_cluster_characteristics(
        self,
        cluster_members: List[int]
    ) -> Dict[str, any]:
        """
        Analyze characteristics of a cluster

        Returns common features and statistics
        """
        exploits = []
        for member_id in cluster_members:
            exploit = self.get_exploit(member_id)
            if exploit:
                exploits.append(exploit)

        if not exploits:
            return {}

        features_list = self.feature_extractor.extract_batch(exploits)

        # Calculate statistics
        amounts = [f.amount_usd for f in features_list]
        protocol_types = [f.protocol_type for f in features_list]
        attack_vectors = [f.attack_vector for f in features_list]
        chains = [f.chain for f in features_list]

        return {
            "cluster_size": len(exploits),
            "total_loss_usd": sum(amounts),
            "avg_loss_usd": sum(amounts) / len(amounts) if amounts else 0,
            "max_loss_usd": max(amounts) if amounts else 0,
            "min_loss_usd": min(amounts) if amounts else 0,
            "common_protocol_type": self._most_common(protocol_types),
            "common_attack_vector": self._most_common(attack_vectors),
            "chains_affected": list(set(chains)),
            "time_range": {
                "earliest": min(e['timestamp'] for e in exploits),
                "latest": max(e['timestamp'] for e in exploits),
            },
        }

    def find_pattern_anomalies(
        self,
        exploits: List[Dict[str, any]]
    ) -> List[Dict[str, any]]:
        """
        Find exploits that don't fit typical patterns (outliers)

        These are interesting because they represent unusual exploit scenarios
        """
        clusters = self.cluster_exploits(exploits)

        # Get all clustered exploit IDs
        clustered_ids = set()
        for members in clusters.values():
            clustered_ids.update(members)

        # Find outliers (not in any cluster)
        outliers = []
        for exploit in exploits:
            if exploit['id'] not in clustered_ids:
                outliers.append({
                    "exploit_id": exploit['id'],
                    "protocol": exploit['protocol'],
                    "chain": exploit['chain'],
                    "amount_usd": exploit.get('amount_usd', 0),
                    "timestamp": exploit['timestamp'],
                    "reason": "Does not match any common pattern",
                })

        return outliers

    def _find_neighbors(
        self,
        point_idx: int,
        vectors: List[List[float]],
        eps: float
    ) -> List[int]:
        """Find all points within eps distance"""
        neighbors = []
        point = vectors[point_idx]

        for i, other in enumerate(vectors):
            if i == point_idx:
                continue

            distance = self._euclidean_distance(point, other)
            if distance <= eps:
                neighbors.append(i)

        return neighbors

    def _euclidean_distance(
        self,
        vec1: List[float],
        vec2: List[float]
    ) -> float:
        """Calculate Euclidean distance between two vectors"""
        if len(vec1) != len(vec2):
            return float('inf')

        return math.sqrt(sum((a - b) ** 2 for a, b in zip(vec1, vec2)))

    def _most_common(self, items: List[str]) -> str:
        """Find most common item in list"""
        if not items:
            return "unknown"

        counts = defaultdict(int)
        for item in items:
            counts[item] += 1

        return max(counts.items(), key=lambda x: x[1])[0]


# Singleton instance
_pattern_clusterer = None

def get_pattern_clusterer() -> PatternClusterer:
    """Get singleton instance of PatternClusterer"""
    global _pattern_clusterer
    if _pattern_clusterer is None:
        _pattern_clusterer = PatternClusterer()
    return _pattern_clusterer
