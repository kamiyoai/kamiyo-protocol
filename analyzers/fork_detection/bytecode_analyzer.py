# -*- coding: utf-8 -*-
"""
Bytecode Analyzer for Fork Detection

IMPORTANT: This analyzer ONLY works with CONFIRMED exploited contracts.
- It does NOT analyze arbitrary contracts for vulnerabilities
- It does NOT predict which contracts will be exploited
- It ONLY identifies if exploited contract X is a fork of exploited contract Y

Purpose: Help users understand if multiple exploits were caused by the same
underlying codebase (e.g., multiple forks of a vulnerable protocol).
"""

import logging
from typing import Dict, List, Optional, Tuple
import hashlib
from dataclasses import dataclass

from analyzers.base import ContractAnalyzer

logger = logging.getLogger(__name__)


@dataclass
class BytecodeFeatures:
    """Features extracted from contract bytecode for comparison"""

    # Hashes
    full_hash: str                    # Hash of entire bytecode
    runtime_hash: str                 # Hash without constructor code
    function_signatures_hash: str     # Hash of function selectors

    # Metadata
    size: int                         # Bytecode size in bytes
    function_count: int               # Number of functions
    opcode_distribution: Dict[str, int]  # Frequency of each opcode

    # Structure
    has_proxy_pattern: bool           # Contains proxy/upgrade pattern
    has_reentrancy_guard: bool        # Contains reentrancy protection
    has_access_control: bool          # Contains access control patterns


class BytecodeAnalyzer(ContractAnalyzer):
    """
    Analyzes bytecode of CONFIRMED exploited contracts

    Use cases:
    - "Was exploit X a fork of previously exploited protocol Y?"
    - "How many exploits used the same underlying codebase?"
    - "Find all exploits that share similar contract structure"
    """

    def __init__(self):
        super().__init__()
        self.cache = {}  # Cache bytecode features

    def analyze(self, exploit_id: int) -> Dict[str, any]:
        """
        Analyze bytecode of exploited contract

        Returns:
            Analysis results including:
            - Bytecode features
            - Potential forks (other exploited contracts with similar bytecode)
            - Similarity scores to other exploits
        """
        exploit = self.get_exploit(exploit_id)
        if not exploit:
            return {"error": "Exploit not found"}

        # Get contract address from exploit
        contract_address = self.get_contract_address(exploit_id)
        if not contract_address:
            return {"error": "No contract address available"}

        chain = exploit.get('chain')

        # Check cache first
        cached = self.get_cached_analysis(
            exploit_id,
            'bytecode_analysis',
            max_age_hours=168  # 1 week cache
        )
        if cached:
            return cached

        # Fetch and analyze bytecode
        bytecode = self.get_bytecode(chain, contract_address)
        if not bytecode:
            return {"error": "Could not fetch bytecode"}

        # Extract features
        features = self.extract_bytecode_features(bytecode)

        # Find similar exploits
        similar_exploits = self.find_similar_bytecode(features, exploit_id)

        results = {
            "exploit_id": exploit_id,
            "contract_address": contract_address,
            "chain": chain,
            "features": {
                "bytecode_size": features.size,
                "function_count": features.function_count,
                "has_proxy_pattern": features.has_proxy_pattern,
                "has_reentrancy_guard": features.has_reentrancy_guard,
                "has_access_control": features.has_access_control,
            },
            "similar_exploits": similar_exploits,
            "is_likely_fork": len(similar_exploits) > 0,
        }

        # Cache results
        self.save_analysis(exploit_id, 'bytecode_analysis', results)

        return results

    def extract_bytecode_features(self, bytecode: str) -> BytecodeFeatures:
        """
        Extract features from bytecode for comparison

        Note: This is NOT vulnerability analysis - just structural comparison
        """
        # Remove '0x' prefix if present
        if bytecode.startswith('0x'):
            bytecode = bytecode[2:]

        # Calculate hashes
        full_hash = hashlib.sha256(bytecode.encode()).hexdigest()

        # Extract runtime bytecode (after constructor)
        # Constructor is typically the first part; runtime starts after first CODECOPY
        runtime_bytecode = self._extract_runtime_code(bytecode)
        runtime_hash = hashlib.sha256(runtime_bytecode.encode()).hexdigest()

        # Extract function signatures (first 4 bytes of each function)
        function_sigs = self._extract_function_signatures(bytecode)
        function_signatures_hash = hashlib.sha256(
            ''.join(sorted(function_sigs)).encode()
        ).hexdigest()

        # Analyze opcode distribution
        opcode_dist = self._analyze_opcode_distribution(bytecode)

        # Detect patterns
        has_proxy = self._detect_proxy_pattern(bytecode)
        has_reentrancy_guard = self._detect_reentrancy_guard(bytecode)
        has_access_control = self._detect_access_control(bytecode)

        return BytecodeFeatures(
            full_hash=full_hash,
            runtime_hash=runtime_hash,
            function_signatures_hash=function_signatures_hash,
            size=len(bytecode) // 2,  # Convert hex to bytes
            function_count=len(function_sigs),
            opcode_distribution=opcode_dist,
            has_proxy_pattern=has_proxy,
            has_reentrancy_guard=has_reentrancy_guard,
            has_access_control=has_access_control,
        )

    def find_similar_bytecode(
        self,
        features: BytecodeFeatures,
        exclude_exploit_id: int
    ) -> List[Dict[str, any]]:
        """
        Find OTHER exploited contracts with similar bytecode

        Returns list of exploits that are likely forks/copies
        """
        similar = []

        # Get all exploits to compare
        all_exploits = self.get_all_exploits(limit=500)

        for exploit in all_exploits:
            if exploit['id'] == exclude_exploit_id:
                continue

            # Check if we've analyzed this one before
            other_analysis = self.get_cached_analysis(
                exploit['id'],
                'bytecode_analysis',
                max_age_hours=168
            )

            if not other_analysis or 'features' not in other_analysis:
                continue

            # Calculate similarity score
            similarity = self._calculate_similarity(
                features,
                other_analysis
            )

            if similarity > 0.7:  # 70% similarity threshold
                similar.append({
                    "exploit_id": exploit['id'],
                    "protocol": exploit['protocol'],
                    "chain": exploit['chain'],
                    "amount_usd": exploit.get('amount_usd', 0),
                    "timestamp": exploit['timestamp'],
                    "similarity_score": similarity,
                })

        # Sort by similarity
        similar.sort(key=lambda x: x['similarity_score'], reverse=True)

        return similar[:10]  # Top 10 most similar

    def _extract_runtime_code(self, bytecode: str) -> str:
        """Extract runtime bytecode (simplified version)"""
        # For now, just return the whole thing
        # A full implementation would parse the bytecode structure
        return bytecode

    def _extract_function_signatures(self, bytecode: str) -> List[str]:
        """Extract function selectors from bytecode"""
        signatures = []

        # Look for PUSH4 opcodes (0x63) which often precede function selectors
        i = 0
        while i < len(bytecode) - 8:
            if bytecode[i:i+2] == '63':  # PUSH4
                sig = bytecode[i+2:i+10]
                signatures.append(sig)
                i += 10
            else:
                i += 2

        return list(set(signatures))  # Deduplicate

    def _analyze_opcode_distribution(self, bytecode: str) -> Dict[str, int]:
        """Analyze distribution of opcodes (simplified)"""
        distribution = {}

        for i in range(0, len(bytecode), 2):
            opcode = bytecode[i:i+2]
            distribution[opcode] = distribution.get(opcode, 0) + 1

        return distribution

    def _detect_proxy_pattern(self, bytecode: str) -> bool:
        """Detect if contract uses proxy pattern"""
        # Look for DELEGATECALL opcode (0xf4)
        return 'f4' in bytecode.lower()

    def _detect_reentrancy_guard(self, bytecode: str) -> bool:
        """Detect potential reentrancy guard"""
        # This is a simplified check - look for SLOAD/SSTORE patterns
        # A real implementation would need more sophisticated analysis
        return 'reentrant' in bytecode.lower()

    def _detect_access_control(self, bytecode: str) -> bool:
        """Detect access control patterns"""
        # Look for common access control patterns (simplified)
        return 'owner' in bytecode.lower() or 'admin' in bytecode.lower()

    def _calculate_similarity(
        self,
        features1: BytecodeFeatures,
        other_analysis: Dict
    ) -> float:
        """
        Calculate similarity score between two contracts

        Returns score from 0.0 to 1.0
        """
        score = 0.0

        other_features = other_analysis.get('features', {})

        # Exact runtime hash match = 100% fork
        if features1.runtime_hash == other_analysis.get('runtime_hash'):
            return 1.0

        # Function signatures match
        if features1.function_signatures_hash == other_analysis.get('function_signatures_hash'):
            score += 0.5

        # Size similarity (within 10%)
        other_size = other_features.get('bytecode_size', 0)
        if other_size > 0:
            size_diff = abs(features1.size - other_size) / max(features1.size, other_size)
            if size_diff < 0.1:
                score += 0.2

        # Pattern matches
        if features1.has_proxy_pattern == other_features.get('has_proxy_pattern'):
            score += 0.1
        if features1.has_reentrancy_guard == other_features.get('has_reentrancy_guard'):
            score += 0.1
        if features1.has_access_control == other_features.get('has_access_control'):
            score += 0.1

        return min(score, 1.0)
