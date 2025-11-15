#!/usr/bin/env python3
"""
ML-Based Confidence Scoring System
Learns from exploit patterns to improve confidence scores
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass
from collections import defaultdict
import math

@dataclass
class FeatureVector:
    # Code features
    has_external_calls: bool
    has_state_changes: bool
    has_value_transfer: bool
    has_delegatecall: bool
    has_assembly: bool

    # Protection features
    has_reentrancy_guard: bool
    has_checks: bool
    has_access_control: bool
    has_safe_math: bool

    # Complexity features
    cyclomatic_complexity: int
    function_length: int
    external_call_count: int

    # Historical match features
    similar_exploit_count: int
    total_similar_loss: float
    pattern_frequency: float

class MLConfidenceScorer:
    def __init__(self, exploit_db_path: str = None):
        self.exploit_db = []
        self.pattern_weights = self._initialize_weights()

        if exploit_db_path and Path(exploit_db_path).exists():
            with open(exploit_db_path) as f:
                data = json.load(f)
                self.exploit_db = data.get('exploits', []) if isinstance(data, dict) else data

        # Learn from historical exploits
        self._learn_from_exploits()

    def _initialize_weights(self) -> Dict[str, float]:
        """Initialize feature weights based on security research"""
        return {
            # Critical risk indicators
            'external_call_before_state': 0.85,
            'delegatecall_user_input': 0.90,
            'unchecked_external_call': 0.75,
            'missing_access_control': 0.80,

            # High risk indicators
            'flash_loan_available': 0.70,
            'price_oracle_manipulatable': 0.75,
            'integer_overflow_possible': 0.65,
            'reentrancy_possible': 0.70,

            # Protection modifiers (reduce risk)
            'has_reentrancy_guard': -0.30,
            'has_access_control_check': -0.25,
            'has_safe_math': -0.20,
            'has_require_statements': -0.15,

            # Historical evidence
            'similar_exploit_exists': 0.60,
            'pattern_common_in_exploits': 0.50,
            'high_value_similar_exploit': 0.40
        }

    def _learn_from_exploits(self):
        """Learn pattern frequencies from historical exploits"""
        self.pattern_stats = defaultdict(lambda: {'count': 0, 'total_loss': 0})

        for exploit in self.exploit_db:
            pattern = exploit.get('pattern', 'unknown')
            self.pattern_stats[pattern]['count'] += 1
            self.pattern_stats[pattern]['total_loss'] += exploit.get('amount_usd', 0)

    def extract_features(self, code: str, file_path: str = '') -> FeatureVector:
        """Extract features from source code"""
        # Code analysis
        has_external_calls = bool(re.search(r'\.(call|delegatecall|staticcall)\(', code))
        has_state_changes = bool(re.search(r'\.(push|pop|save|update|delete)\(', code))
        has_value_transfer = bool(re.search(r'(\.transfer\(|\.send\(|msg\.value)', code))
        has_delegatecall = bool(re.search(r'\.delegatecall\(', code))
        has_assembly = bool(re.search(r'assembly\s*\{', code))

        # Protection analysis
        has_reentrancy_guard = bool(re.search(r'(nonReentrant|ReentrancyGuard|reentrancyLock)', code))
        has_checks = bool(re.search(r'(require\(|assert\(|if\s*\(.*\)\s*revert)', code))
        has_access_control = bool(re.search(r'(onlyOwner|onlyAdmin|require\(msg\.sender)', code))
        has_safe_math = bool(re.search(r'(SafeMath|checked_add|checked_sub|checked_mul)', code))

        # Complexity metrics
        cyclomatic_complexity = len(re.findall(r'(if|for|while|&&|\|\|)', code))
        function_length = len(code.split('\n'))
        external_call_count = len(re.findall(r'\.(call|delegatecall|transfer|send)\(', code))

        return FeatureVector(
            has_external_calls=has_external_calls,
            has_state_changes=has_state_changes,
            has_value_transfer=has_value_transfer,
            has_delegatecall=has_delegatecall,
            has_assembly=has_assembly,
            has_reentrancy_guard=has_reentrancy_guard,
            has_checks=has_checks,
            has_access_control=has_access_control,
            has_safe_math=has_safe_math,
            cyclomatic_complexity=cyclomatic_complexity,
            function_length=function_length,
            external_call_count=external_call_count,
            similar_exploit_count=0,
            total_similar_loss=0,
            pattern_frequency=0
        )

    def calculate_confidence(self,
                           vuln_type: str,
                           features: FeatureVector,
                           pattern: str = '',
                           similar_exploits: List[str] = None) -> float:
        """Calculate ML-based confidence score (0.0 - 1.0)"""
        score = 0.0
        max_score = 0.0

        # Base confidence from vulnerability type
        base_scores = {
            'reentrancy': 0.70,
            'access_control': 0.75,
            'flash_loan': 0.65,
            'oracle_manipulation': 0.60,
            'integer_overflow': 0.55,
            'cross_chain_bridge': 0.70
        }
        score += base_scores.get(vuln_type.lower(), 0.50)
        max_score += 1.0

        # Risk indicators (increase confidence)
        if features.has_external_calls and features.has_state_changes:
            if not features.has_reentrancy_guard:
                score += self.pattern_weights['external_call_before_state']
                max_score += 1.0

        if features.has_delegatecall:
            score += self.pattern_weights['delegatecall_user_input']
            max_score += 1.0

        if features.has_external_calls and not features.has_checks:
            score += self.pattern_weights['unchecked_external_call']
            max_score += 1.0

        # Protection factors (decrease confidence if protections exist)
        protection_score = 0.0
        if features.has_reentrancy_guard:
            protection_score += abs(self.pattern_weights['has_reentrancy_guard'])
        if features.has_access_control:
            protection_score += abs(self.pattern_weights['has_access_control_check'])
        if features.has_safe_math:
            protection_score += abs(self.pattern_weights['has_safe_math'])
        if features.has_checks:
            protection_score += abs(self.pattern_weights['has_require_statements'])

        score -= protection_score * 0.5  # Reduce score based on protections

        # Historical evidence (increase confidence)
        if similar_exploits:
            features.similar_exploit_count = len(similar_exploits)
            if features.similar_exploit_count > 0:
                score += self.pattern_weights['similar_exploit_exists']
                max_score += 1.0

            # High-value similar exploits increase confidence
            total_loss = sum(self._extract_loss(exp) for exp in similar_exploits)
            if total_loss > 100_000_000:  # $100M+
                score += self.pattern_weights['high_value_similar_exploit']
                max_score += 1.0

        # Pattern frequency in exploits
        if pattern and pattern in self.pattern_stats:
            freq = self.pattern_stats[pattern]['count'] / len(self.exploit_db) if self.exploit_db else 0
            if freq > 0.1:  # Pattern in >10% of exploits
                score += self.pattern_weights['pattern_common_in_exploits'] * freq
                max_score += 1.0

        # Complexity adjustment
        complexity_factor = min(features.cyclomatic_complexity / 20.0, 1.0)
        score += complexity_factor * 0.1  # Small boost for complexity

        # Normalize to 0-1
        if max_score > 0:
            confidence = min(score / max_score, 1.0)
        else:
            confidence = 0.5

        # Ensure minimum confidence
        confidence = max(confidence, 0.10)

        # Apply sigmoid for smoothing
        confidence = self._sigmoid(confidence * 10 - 5)

        return round(confidence, 2)

    def _sigmoid(self, x: float) -> float:
        """Sigmoid function for smooth confidence curves"""
        return 1 / (1 + math.exp(-x))

    def _extract_loss(self, exploit_str: str) -> float:
        """Extract loss amount from exploit string"""
        # Format: "EXPLOIT_ID ($XXX,XXX,XXX)"
        match = re.search(r'\$([0-9,]+)', exploit_str)
        if match:
            return float(match.group(1).replace(',', ''))
        return 0

    def get_pattern_risk_score(self, pattern: str) -> Dict[str, any]:
        """Get risk statistics for a pattern"""
        if pattern not in self.pattern_stats:
            return {'risk_level': 'UNKNOWN', 'exploit_count': 0, 'avg_loss': 0}

        stats = self.pattern_stats[pattern]
        avg_loss = stats['total_loss'] / stats['count'] if stats['count'] > 0 else 0

        if avg_loss > 100_000_000:
            risk_level = 'CRITICAL'
        elif avg_loss > 50_000_000:
            risk_level = 'HIGH'
        elif avg_loss > 10_000_000:
            risk_level = 'MEDIUM'
        else:
            risk_level = 'LOW'

        return {
            'risk_level': risk_level,
            'exploit_count': stats['count'],
            'total_loss': stats['total_loss'],
            'avg_loss': avg_loss,
            'frequency': stats['count'] / len(self.exploit_db) if self.exploit_db else 0
        }

    def analyze_vulnerability(self, code: str, vuln_type: str, pattern: str = '',
                            similar_exploits: List[str] = None) -> Dict:
        """Complete vulnerability analysis with ML confidence"""
        features = self.extract_features(code)
        confidence = self.calculate_confidence(vuln_type, features, pattern, similar_exploits)
        pattern_risk = self.get_pattern_risk_score(pattern)

        return {
            'confidence': confidence,
            'confidence_level': self._confidence_level(confidence),
            'pattern_risk': pattern_risk,
            'features': {
                'external_calls': features.has_external_calls,
                'state_changes': features.has_state_changes,
                'protections': {
                    'reentrancy_guard': features.has_reentrancy_guard,
                    'access_control': features.has_access_control,
                    'safe_math': features.has_safe_math,
                    'checks': features.has_checks
                },
                'complexity': features.cyclomatic_complexity,
                'external_call_count': features.external_call_count
            },
            'similar_exploits': len(similar_exploits) if similar_exploits else 0
        }

    def _confidence_level(self, confidence: float) -> str:
        """Convert confidence score to level"""
        if confidence >= 0.85:
            return 'VERY_HIGH'
        elif confidence >= 0.70:
            return 'HIGH'
        elif confidence >= 0.50:
            return 'MEDIUM'
        elif confidence >= 0.30:
            return 'LOW'
        else:
            return 'VERY_LOW'


def main():
    base_dir = Path(__file__).resolve().parent.parent
    exploit_db = base_dir / 'intelligence/database/exploit_database.json'

    scorer = MLConfidenceScorer(str(exploit_db))

    # Test with sample vulnerable code
    sample_code = """
    function withdraw(uint amount) public {
        uint balance = balances[msg.sender];
        require(balance >= amount);

        // VULNERABLE: External call before state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);

        balances[msg.sender] -= amount;
    }
    """

    print("="*70)
    print("ML CONFIDENCE SCORING SYSTEM")
    print("="*70)
    print(f"\nLoaded {len(scorer.exploit_db)} historical exploits")
    print(f"Patterns learned: {len(scorer.pattern_stats)}")
    print()

    # Analyze sample vulnerability
    result = scorer.analyze_vulnerability(
        code=sample_code,
        vuln_type='reentrancy',
        pattern='reentrancy',
        similar_exploits=['CREAM_2021 ($130,000,000)', 'DAO_2016 ($60,000,000)']
    )

    print("Sample Analysis - Reentrancy Vulnerability:")
    print(f"  Confidence: {result['confidence']} ({result['confidence_level']})")
    print(f"  Pattern Risk: {result['pattern_risk']['risk_level']}")
    print(f"  Historical Exploits: {result['pattern_risk']['exploit_count']}")
    print(f"  Avg Loss: ${result['pattern_risk']['avg_loss']:,.0f}")
    print(f"  Similar Exploits Found: {result['similar_exploits']}")
    print()

    print("Feature Analysis:")
    print(f"  External Calls: {result['features']['external_calls']}")
    print(f"  State Changes: {result['features']['state_changes']}")
    print(f"  Reentrancy Guard: {result['features']['protections']['reentrancy_guard']}")
    print(f"  Access Control: {result['features']['protections']['access_control']}")
    print(f"  Complexity: {result['features']['complexity']}")
    print()

    # Pattern statistics
    print("Pattern Risk Scores:")
    for pattern in ['reentrancy', 'access_control', 'flash_loan_price_manipulation',
                   'oracle_manipulation', 'cross_chain_bridge']:
        risk = scorer.get_pattern_risk_score(pattern)
        print(f"  {pattern}:")
        print(f"    Risk: {risk['risk_level']}")
        print(f"    Count: {risk['exploit_count']}")
        print(f"    Avg Loss: ${risk.get('avg_loss', 0):,.0f}")
        print()

    # Save scorer configuration
    config = {
        'version': '1.0',
        'exploit_count': len(scorer.exploit_db),
        'pattern_weights': scorer.pattern_weights,
        'pattern_statistics': dict(scorer.pattern_stats)
    }

    config_path = base_dir / 'intelligence/ml/confidence_scorer_config.json'
    config_path.parent.mkdir(parents=True, exist_ok=True)

    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"✅ ML Confidence Scorer configured: {config_path}")


if __name__ == '__main__':
    main()
