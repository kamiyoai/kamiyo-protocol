# -*- coding: utf-8 -*-
"""
Fork Detector

High-level service for detecting fork relationships between CONFIRMED exploited contracts.

IMPORTANT: This only analyzes HISTORICAL exploits, not arbitrary contracts.
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass

from analyzers.base import BaseAnalyzer
from analyzers.fork_detection.bytecode_analyzer import BytecodeAnalyzer

logger = logging.getLogger(__name__)


@dataclass
class ForkRelationship:
    """Represents a fork relationship between two exploited contracts"""

    exploit_id_1: int
    exploit_id_2: int
    similarity_score: float
    relationship_type: str  # 'exact_fork', 'likely_fork', 'similar'
    shared_features: List[str]


class ForkDetector(BaseAnalyzer):
    """
    Detects fork relationships in CONFIRMED exploits

    Use cases:
    - "Show me all exploits that used the same underlying codebase"
    - "Is this new exploit a fork of a previously exploited protocol?"
    - "Build a graph of related exploits based on code similarity"
    """

    def __init__(self):
        super().__init__()
        self.bytecode_analyzer = BytecodeAnalyzer()

    def analyze(self, exploit_id: int) -> Dict[str, any]:
        """
        Analyze an exploit to find fork relationships

        Returns:
            - Direct forks (very high similarity)
            - Likely forks (high similarity)
            - Related contracts (moderate similarity)
        """
        # Use bytecode analyzer
        bytecode_analysis = self.bytecode_analyzer.analyze(exploit_id)

        if 'error' in bytecode_analysis:
            return bytecode_analysis

        similar_exploits = bytecode_analysis.get('similar_exploits', [])

        # Categorize by similarity
        direct_forks = []
        likely_forks = []
        related = []

        for similar in similar_exploits:
            score = similar['similarity_score']

            if score >= 0.95:
                direct_forks.append(similar)
            elif score >= 0.8:
                likely_forks.append(similar)
            else:
                related.append(similar)

        return {
            "exploit_id": exploit_id,
            "analysis_type": "fork_detection",
            "direct_forks": direct_forks,
            "likely_forks": likely_forks,
            "related_exploits": related,
            "total_related": len(similar_exploits),
            "is_part_of_fork_family": len(direct_forks) + len(likely_forks) > 0,
        }

    def build_fork_graph(
        self,
        chain: Optional[str] = None,
        min_similarity: float = 0.8
    ) -> Dict[str, any]:
        """
        Build a graph of fork relationships across all exploits

        Returns nodes (exploits) and edges (fork relationships)
        """
        exploits = self.get_all_exploits(chain=chain, limit=100)

        nodes = []
        edges = []

        # Analyze each exploit
        for exploit in exploits:
            analysis = self.analyze(exploit['id'])

            if 'error' in analysis:
                continue

            # Add node
            nodes.append({
                "id": exploit['id'],
                "protocol": exploit['protocol'],
                "chain": exploit['chain'],
                "amount_usd": exploit.get('amount_usd', 0),
                "timestamp": exploit['timestamp'],
            })

            # Add edges for forks
            for fork in analysis.get('direct_forks', []) + analysis.get('likely_forks', []):
                if fork['similarity_score'] >= min_similarity:
                    edges.append({
                        "source": exploit['id'],
                        "target": fork['exploit_id'],
                        "similarity": fork['similarity_score'],
                        "type": "fork" if fork['similarity_score'] >= 0.95 else "likely_fork"
                    })

        return {
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "total_exploits": len(nodes),
                "total_relationships": len(edges),
                "fork_families": self._count_fork_families(nodes, edges),
            }
        }

    def find_fork_family(self, exploit_id: int) -> List[int]:
        """
        Find all exploits in the same fork family

        Returns list of exploit IDs that share the same codebase
        """
        visited = set()
        family = []

        def dfs(current_id: int):
            if current_id in visited:
                return

            visited.add(current_id)
            family.append(current_id)

            # Find forks of this exploit
            analysis = self.analyze(current_id)

            if 'error' not in analysis:
                for fork in analysis.get('direct_forks', []) + analysis.get('likely_forks', []):
                    dfs(fork['exploit_id'])

        dfs(exploit_id)

        return family

    def get_fork_timeline(self, exploit_ids: List[int]) -> List[Dict[str, any]]:
        """
        Get chronological timeline of exploits in a fork family

        Shows how a vulnerable codebase was exploited over time
        """
        timeline = []

        for exploit_id in exploit_ids:
            exploit = self.get_exploit(exploit_id)
            if exploit:
                timeline.append({
                    "exploit_id": exploit_id,
                    "protocol": exploit['protocol'],
                    "chain": exploit['chain'],
                    "amount_usd": exploit.get('amount_usd', 0),
                    "timestamp": exploit['timestamp'],
                })

        # Sort by timestamp
        timeline.sort(key=lambda x: x['timestamp'])

        return timeline

    def _count_fork_families(
        self,
        nodes: List[Dict],
        edges: List[Dict]
    ) -> int:
        """Count number of distinct fork families using Union-Find"""

        # Build adjacency list
        adj = {node['id']: [] for node in nodes}
        for edge in edges:
            adj[edge['source']].append(edge['target'])
            adj[edge['target']].append(edge['source'])

        # Find connected components
        visited = set()
        families = 0

        def dfs(node_id: int):
            if node_id in visited:
                return
            visited.add(node_id)
            for neighbor in adj.get(node_id, []):
                dfs(neighbor)

        for node in nodes:
            if node['id'] not in visited:
                dfs(node['id'])
                families += 1

        return families


# Singleton instance
_fork_detector = None

def get_fork_detector() -> ForkDetector:
    """Get singleton instance of ForkDetector"""
    global _fork_detector
    if _fork_detector is None:
        _fork_detector = ForkDetector()
    return _fork_detector
