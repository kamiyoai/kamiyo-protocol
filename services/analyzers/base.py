# -*- coding: utf-8 -*-
"""
Base Analyzer Classes for Historical Exploit Analysis

IMPORTANT: This module only analyzes CONFIRMED, HISTORICAL exploits.
- It does NOT detect vulnerabilities
- It does NOT predict future exploits
- It does NOT scan contracts for bugs
- It ONLY finds patterns in confirmed past exploits
"""

import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

from database import get_db

logger = logging.getLogger(__name__)


class BaseAnalyzer(ABC):
    """
    Base class for all exploit analyzers

    Analyzers process CONFIRMED historical exploits to find:
    - Relationships between past exploits (forks, similar code)
    - Patterns in exploit techniques (historical clustering)
    - Contextual information from blockchain data

    Analyzers DO NOT:
    - Detect vulnerabilities in arbitrary contracts
    - Predict future exploits
    - Provide security scores
    """

    def __init__(self):
        self.db = get_db()
        self.name = self.__class__.__name__
        logger.info(f"Initialized analyzer: {self.name}")

    @abstractmethod
    def analyze(self, exploit_id: int) -> Dict[str, Any]:
        """
        Analyze a CONFIRMED exploit from the database

        Args:
            exploit_id: ID of confirmed exploit in database

        Returns:
            Analysis results as dictionary
        """
        pass

    def get_exploit(self, exploit_id: int) -> Optional[Dict[str, Any]]:
        """Get confirmed exploit from database"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM exploits WHERE id = ?",
                    (exploit_id,)
                )
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error fetching exploit {exploit_id}: {e}")
            return None

    def get_all_exploits(
        self,
        chain: Optional[str] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """Get all confirmed exploits for analysis"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()

                query = """
                    SELECT * FROM exploits
                    WHERE LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                """
                params = []

                if chain:
                    query += " AND chain = ?"
                    params.append(chain)

                query += " ORDER BY timestamp DESC LIMIT ?"
                params.append(limit)

                cursor.execute(query, params)
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error fetching exploits: {e}")
            return []

    def save_analysis(
        self,
        exploit_id: int,
        analysis_type: str,
        results: Dict[str, Any]
    ) -> bool:
        """Save analysis results to database"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO exploit_analysis (
                        exploit_id, analysis_type, results, analyzed_at
                    ) VALUES (?, ?, ?, datetime('now'))
                """, (exploit_id, analysis_type, json.dumps(results)))

                logger.info(
                    f"Saved {analysis_type} analysis for exploit {exploit_id}"
                )
                return True
        except Exception as e:
            logger.error(f"Error saving analysis: {e}")
            return False

    def get_cached_analysis(
        self,
        exploit_id: int,
        analysis_type: str,
        max_age_hours: int = 24
    ) -> Optional[Dict[str, Any]]:
        """Get cached analysis if it exists and is fresh"""
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT results, analyzed_at FROM exploit_analysis
                    WHERE exploit_id = ? AND analysis_type = ?
                    AND datetime(analyzed_at) > datetime('now', '-' || ? || ' hours')
                """, (exploit_id, analysis_type, max_age_hours))

                row = cursor.fetchone()
                if row:
                    return json.loads(row['results'])
                return None
        except Exception as e:
            logger.error(f"Error fetching cached analysis: {e}")
            return None


class ContractAnalyzer(BaseAnalyzer):
    """
    Analyzer for contract-level historical analysis

    Analyzes relationships between CONFIRMED exploited contracts:
    - Fork detection (is contract X a copy of exploited contract Y?)
    - Code similarity (do two exploited contracts share similar code?)
    - Historical context (what other exploits used similar patterns?)
    """

    def get_contract_address(self, exploit_id: int) -> Optional[str]:
        """Extract contract address from exploit transaction"""
        exploit = self.get_exploit(exploit_id)
        if not exploit:
            return None

        # Contract address might be in tx_hash or separate field
        # This depends on how aggregators provide the data
        return exploit.get('contract_address') or exploit.get('tx_hash')

    def get_bytecode(self, chain: str, address: str) -> Optional[str]:
        """
        Fetch contract bytecode from blockchain

        Note: Only fetches bytecode for CONFIRMED exploited contracts
        Does NOT scan or analyze arbitrary contracts
        """
        # This will be implemented with web3 integration
        # For now, return None
        return None

    def find_similar_exploits(
        self,
        exploit_id: int,
        similarity_threshold: float = 0.8
    ) -> List[Dict[str, Any]]:
        """
        Find historically similar exploits

        Returns exploits that share characteristics with the given one:
        - Same protocol family
        - Similar dollar amounts
        - Same chain
        - Similar time period
        """
        exploit = self.get_exploit(exploit_id)
        if not exploit:
            return []

        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM exploits
                    WHERE id != ?
                    AND (
                        protocol = ?
                        OR chain = ?
                        OR ABS(amount_usd - ?) < ?
                    )
                    AND LOWER(protocol) NOT LIKE '%test%'
                    AND LOWER(COALESCE(category, '')) NOT LIKE '%test%'
                    ORDER BY timestamp DESC
                    LIMIT 10
                """, (
                    exploit_id,
                    exploit['protocol'],
                    exploit['chain'],
                    exploit.get('amount_usd', 0),
                    exploit.get('amount_usd', 0) * 0.5  # 50% tolerance
                ))

                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error finding similar exploits: {e}")
            return []


class PatternAnalyzer(BaseAnalyzer):
    """
    Analyzer for pattern recognition in historical exploits

    Clusters and categorizes CONFIRMED exploits by:
    - Attack technique (reentrancy, oracle manipulation, etc.)
    - Target type (DEX, lending, bridge, etc.)
    - Time patterns (common exploit times)
    - Amount patterns (typical loss ranges)

    Does NOT predict or score security risks
    """

    def extract_features(self, exploit: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract features from confirmed exploit for clustering

        Features are purely descriptive, not predictive:
        - Protocol category (DEX, Lending, etc.)
        - Amount range
        - Chain
        - Time of day
        """
        return {
            'protocol': exploit.get('protocol', 'unknown'),
            'chain': exploit.get('chain', 'unknown'),
            'amount_usd': exploit.get('amount_usd', 0),
            'category': exploit.get('category', 'unknown'),
            'timestamp': exploit.get('timestamp'),
            'hour': datetime.fromisoformat(exploit['timestamp']).hour if exploit.get('timestamp') else 0
        }

    def cluster_exploits(
        self,
        exploits: List[Dict[str, Any]]
    ) -> Dict[str, List[int]]:
        """
        Group historical exploits by similarity

        Returns clusters of exploit IDs that share characteristics
        """
        # Simple clustering by category
        clusters = {}

        for exploit in exploits:
            category = exploit.get('category', 'unknown')
            if category not in clusters:
                clusters[category] = []
            clusters[category].append(exploit['id'])

        return clusters
