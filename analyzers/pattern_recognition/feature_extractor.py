# -*- coding: utf-8 -*-
"""
Feature Extractor for Pattern Recognition

Extracts features from CONFIRMED exploits for clustering and pattern analysis.

IMPORTANT: This extracts DESCRIPTIVE features from historical data.
- It does NOT predict vulnerabilities
- It does NOT score security risks
- It ONLY describes characteristics of past exploits
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass
import json

from analyzers.base import PatternAnalyzer

logger = logging.getLogger(__name__)


@dataclass
class ExploitFeatures:
    """Features extracted from a confirmed exploit"""

    # Basic metadata
    exploit_id: int
    protocol: str
    chain: str
    category: str

    # Quantitative features
    amount_usd: float
    hour_of_day: int
    day_of_week: int
    days_since_protocol_launch: Optional[int]

    # Categorical features
    protocol_type: str  # DEX, Lending, Bridge, etc.
    attack_vector: str  # Reentrancy, Oracle, Access Control, etc.

    # Contextual features
    is_weekend: bool
    is_high_value: bool  # > $1M
    is_mega_exploit: bool  # > $10M

    # Related features
    has_similar_exploits: bool
    similarity_cluster_id: Optional[int]


class FeatureExtractor(PatternAnalyzer):
    """
    Extracts features from CONFIRMED exploits for pattern analysis

    Use cases:
    - "What features do high-value exploits share?"
    - "Are there temporal patterns in exploit timing?"
    - "Group exploits by attack vector and protocol type"
    """

    # Protocol type mapping (based on common DeFi categories)
    PROTOCOL_TYPES = {
        'uniswap': 'DEX',
        'sushiswap': 'DEX',
        'pancake': 'DEX',
        'curve': 'DEX',
        'balancer': 'DEX',
        'aave': 'Lending',
        'compound': 'Lending',
        'maker': 'Lending',
        'cream': 'Lending',
        'wormhole': 'Bridge',
        'ronin': 'Bridge',
        'poly': 'Bridge',
        'nomad': 'Bridge',
        'euler': 'Lending',
        'mango': 'DEX',
    }

    # Attack vector keywords (derived from category/description)
    ATTACK_VECTORS = {
        'reentrancy': ['reentran', 'recursive'],
        'oracle': ['oracle', 'price', 'manipulation'],
        'access_control': ['access', 'owner', 'admin', 'permission'],
        'flash_loan': ['flash', 'loan'],
        'logic_error': ['logic', 'bug', 'error'],
        'bridge': ['bridge', 'cross-chain'],
        'governance': ['governance', 'vote', 'proposal'],
    }

    def analyze(self, exploit_id: int) -> Dict[str, any]:
        """
        Extract features from a confirmed exploit

        Returns feature vector for clustering/analysis
        """
        exploit = self.get_exploit(exploit_id)
        if not exploit:
            return {"error": "Exploit not found"}

        features = self.extract_features(exploit)

        return {
            "exploit_id": exploit_id,
            "features": self._features_to_dict(features),
            "feature_vector": self._features_to_vector(features),
        }

    def extract_features(self, exploit: Dict[str, any]) -> ExploitFeatures:
        """Extract all features from exploit data"""

        # Parse timestamp
        timestamp = datetime.fromisoformat(exploit['timestamp']) if exploit.get('timestamp') else datetime.now()

        # Extract protocol type
        protocol = exploit.get('protocol', '').lower()
        protocol_type = self._get_protocol_type(protocol)

        # Extract attack vector
        attack_vector = self._get_attack_vector(exploit)

        # Amount classification
        amount = exploit.get('amount_usd', 0)
        is_high_value = amount >= 1_000_000
        is_mega_exploit = amount >= 10_000_000

        return ExploitFeatures(
            exploit_id=exploit['id'],
            protocol=exploit.get('protocol', 'unknown'),
            chain=exploit.get('chain', 'unknown'),
            category=exploit.get('category', 'unknown'),
            amount_usd=amount,
            hour_of_day=timestamp.hour,
            day_of_week=timestamp.weekday(),
            days_since_protocol_launch=None,  # Would need protocol launch data
            protocol_type=protocol_type,
            attack_vector=attack_vector,
            is_weekend=timestamp.weekday() >= 5,
            is_high_value=is_high_value,
            is_mega_exploit=is_mega_exploit,
            has_similar_exploits=False,  # Will be populated by clustering
            similarity_cluster_id=None,
        )

    def extract_batch(
        self,
        exploits: List[Dict[str, any]]
    ) -> List[ExploitFeatures]:
        """Extract features from multiple exploits"""
        return [self.extract_features(e) for e in exploits]

    def get_feature_importance(
        self,
        exploits: List[Dict[str, any]]
    ) -> Dict[str, float]:
        """
        Calculate feature importance scores

        Shows which features are most useful for clustering
        """
        if not exploits:
            return {}

        features_list = self.extract_batch(exploits)

        # Calculate variance for numeric features
        amounts = [f.amount_usd for f in features_list]
        hours = [f.hour_of_day for f in features_list]

        # Calculate diversity for categorical features
        protocol_types = set(f.protocol_type for f in features_list)
        attack_vectors = set(f.attack_vector for f in features_list)
        chains = set(f.chain for f in features_list)

        return {
            "amount_usd": self._calculate_variance_score(amounts),
            "hour_of_day": self._calculate_variance_score(hours),
            "protocol_type": len(protocol_types) / len(features_list),
            "attack_vector": len(attack_vectors) / len(features_list),
            "chain": len(chains) / len(features_list),
            "is_high_value": sum(1 for f in features_list if f.is_high_value) / len(features_list),
        }

    def _get_protocol_type(self, protocol: str) -> str:
        """Classify protocol by type"""
        protocol_lower = protocol.lower()

        for key, ptype in self.PROTOCOL_TYPES.items():
            if key in protocol_lower:
                return ptype

        # Default categorization
        if any(word in protocol_lower for word in ['swap', 'dex', 'exchange']):
            return 'DEX'
        elif any(word in protocol_lower for word in ['lend', 'borrow', 'vault']):
            return 'Lending'
        elif 'bridge' in protocol_lower:
            return 'Bridge'
        elif 'stake' in protocol_lower or 'staking' in protocol_lower:
            return 'Staking'
        else:
            return 'Other'

    def _get_attack_vector(self, exploit: Dict[str, any]) -> str:
        """Determine attack vector from category/description"""

        text = (
            exploit.get('category', '') + ' ' +
            exploit.get('description', '')
        ).lower()

        for vector, keywords in self.ATTACK_VECTORS.items():
            if any(kw in text for kw in keywords):
                return vector

        return 'unknown'

    def _features_to_dict(self, features: ExploitFeatures) -> Dict[str, any]:
        """Convert features to dictionary"""
        return {
            "exploit_id": features.exploit_id,
            "protocol": features.protocol,
            "chain": features.chain,
            "category": features.category,
            "amount_usd": features.amount_usd,
            "hour_of_day": features.hour_of_day,
            "day_of_week": features.day_of_week,
            "protocol_type": features.protocol_type,
            "attack_vector": features.attack_vector,
            "is_weekend": features.is_weekend,
            "is_high_value": features.is_high_value,
            "is_mega_exploit": features.is_mega_exploit,
        }

    def _features_to_vector(self, features: ExploitFeatures) -> List[float]:
        """
        Convert features to numeric vector for ML algorithms

        Normalizes and encodes features for clustering
        """
        vector = []

        # Numeric features (normalized)
        vector.append(min(features.amount_usd / 100_000_000, 1.0))  # Normalize to 0-1
        vector.append(features.hour_of_day / 24.0)
        vector.append(features.day_of_week / 7.0)

        # Boolean features
        vector.append(1.0 if features.is_weekend else 0.0)
        vector.append(1.0 if features.is_high_value else 0.0)
        vector.append(1.0 if features.is_mega_exploit else 0.0)

        # Categorical features (one-hot encoding could be added here)
        # For now, just include as simple numeric encoding
        protocol_types = ['DEX', 'Lending', 'Bridge', 'Staking', 'Other']
        vector.append(float(protocol_types.index(features.protocol_type)) / len(protocol_types))

        return vector

    def _calculate_variance_score(self, values: List[float]) -> float:
        """Calculate normalized variance score"""
        if not values:
            return 0.0

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)

        # Normalize to 0-1 range
        return min(variance / (mean + 1), 1.0) if mean > 0 else 0.0


# Singleton instance
_feature_extractor = None

def get_feature_extractor() -> FeatureExtractor:
    """Get singleton instance of FeatureExtractor"""
    global _feature_extractor
    if _feature_extractor is None:
        _feature_extractor = FeatureExtractor()
    return _feature_extractor
