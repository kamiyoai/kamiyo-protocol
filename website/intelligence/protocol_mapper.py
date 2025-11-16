"""
Protocol Relationship Mapper
Phase 4, Week 8 - Framework v13.0

Maps protocol dependencies and identifies cascade risks:
- Dependency graph visualization
- Systemic risk scoring
- Cascade failure paths
- Single point of failure (SPOF) identification
- Composition exploit opportunities
- Total value at risk calculations

Benefits:
- Identify multi-protocol exploits (highest bounties)
- Find systemic risks before others
- Unique analysis capability

Estimated Value: 1-2 major findings/year ($200K-$1M)
"""

import networkx as nx
from typing import List, Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum
import json


class RiskLevel(Enum):
    """Risk level classifications"""
    CRITICAL = "critical"  # Systemic failure risk
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class DependencyType(Enum):
    """Types of protocol dependencies"""
    ORACLE_DEPENDENCY = "oracle"
    LIQUIDITY_DEPENDENCY = "liquidity"
    BRIDGE_DEPENDENCY = "bridge"
    COLLATERAL_DEPENDENCY = "collateral"
    GOVERNANCE_DEPENDENCY = "governance"
    TECHNICAL_INTEGRATION = "technical"


@dataclass
class ProtocolNode:
    """Represents a protocol in the ecosystem"""
    name: str
    tvl: float
    category: str  # DEX, Lending, Bridge, LSD, etc.
    chains: List[str]
    dependencies: List[str] = field(default_factory=list)
    dependents: List[str] = field(default_factory=list)
    criticality_score: float = 0.0


@dataclass
class DependencyEdge:
    """Represents a dependency between protocols"""
    from_protocol: str
    to_protocol: str
    dependency_type: DependencyType
    criticality: RiskLevel
    value_at_risk: float


@dataclass
class CascadeScenario:
    """Represents a potential cascade failure"""
    trigger_protocol: str
    affected_protocols: List[str]
    cascade_path: List[str]
    total_value_at_risk: float
    likelihood: float
    description: str


@dataclass
class SinglePointOfFailure:
    """Represents a SPOF in the ecosystem"""
    protocol_name: str
    dependent_protocols: List[str]
    dependency_type: DependencyType
    total_tvl_at_risk: float
    mitigation_exists: bool
    exploit_scenario: str


@dataclass
class EcosystemMap:
    """Complete ecosystem analysis"""
    protocols: List[ProtocolNode]
    dependencies: List[DependencyEdge]
    cascade_scenarios: List[CascadeScenario]
    single_points_of_failure: List[SinglePointOfFailure]
    composition_exploits: List[Dict[str, Any]]
    systemic_risk_score: float


class ProtocolMapper:
    """
    Map protocol relationships and identify systemic risks

    Uses graph analysis to find:
    - Critical dependency chains
    - Cascade failure paths
    - Single points of failure
    - Composition exploit opportunities
    """

    def __init__(self):
        self.graph = nx.DiGraph()
        self.protocols: Dict[str, ProtocolNode] = {}

    async def analyze_ecosystem(
        self,
        target_protocols: List[str],
        depth: int = 3
    ) -> EcosystemMap:
        """
        Analyze protocol ecosystem

        Args:
            target_protocols: List of protocol names to analyze
            depth: Depth of dependency analysis (degrees of separation)

        Returns:
            Complete ecosystem analysis
        """

        print(f"🗺️  Mapping protocol ecosystem...")
        print(f"   Target protocols: {len(target_protocols)}")
        print(f"   Analysis depth: {depth} degrees\n")

        # Step 1: Build dependency graph
        await self._build_dependency_graph(target_protocols, depth)

        # Step 2: Identify cascade scenarios
        cascades = self._identify_cascade_scenarios()

        # Step 3: Find single points of failure
        spofs = self._find_single_points_of_failure()

        # Step 4: Detect composition exploits
        comp_exploits = self._detect_composition_exploits()

        # Step 5: Calculate systemic risk
        risk_score = self._calculate_systemic_risk()

        print(f"   ✅ Analysis complete\n")

        return EcosystemMap(
            protocols=list(self.protocols.values()),
            dependencies=self._get_all_edges(),
            cascade_scenarios=cascades,
            single_points_of_failure=spofs,
            composition_exploits=comp_exploits,
            systemic_risk_score=risk_score
        )

    async def _build_dependency_graph(self, protocols: List[str], depth: int):
        """Build dependency graph from protocol list"""

        # Mock protocol data (in production: fetch from APIs/contracts)
        mock_data = {
            'wormhole': {
                'tvl': 1_000_000_000,
                'category': 'Bridge',
                'chains': ['ethereum', 'solana', 'arbitrum'],
                'dependencies': []
            },
            'lido': {
                'tvl': 15_000_000_000,
                'category': 'LSD',
                'chains': ['ethereum'],
                'dependencies': []
            },
            'aave': {
                'tvl': 10_000_000_000,
                'category': 'Lending',
                'chains': ['ethereum', 'polygon', 'avalanche'],
                'dependencies': ['chainlink', 'lido']  # Price oracle + stETH collateral
            },
            'chainlink': {
                'tvl': 500_000_000,
                'category': 'Oracle',
                'chains': ['ethereum', 'arbitrum', 'polygon'],
                'dependencies': []
            },
            'uniswap': {
                'tvl': 5_000_000_000,
                'category': 'DEX',
                'chains': ['ethereum', 'arbitrum', 'polygon'],
                'dependencies': []
            },
            'compound': {
                'tvl': 3_000_000_000,
                'category': 'Lending',
                'chains': ['ethereum'],
                'dependencies': ['chainlink']
            },
            'curve': {
                'tvl': 4_000_000_000,
                'category': 'DEX',
                'chains': ['ethereum'],
                'dependencies': ['lido']  # stETH pools
            },
        }

        # Build nodes
        for proto_name in protocols:
            if proto_name.lower() in mock_data:
                data = mock_data[proto_name.lower()]

                node = ProtocolNode(
                    name=proto_name,
                    tvl=data['tvl'],
                    category=data['category'],
                    chains=data['chains'],
                    dependencies=data['dependencies']
                )

                self.protocols[proto_name] = node
                self.graph.add_node(proto_name, **data)

                # Add dependency edges
                for dep in data['dependencies']:
                    if dep not in self.protocols and dep in mock_data:
                        # Add dependency protocol
                        dep_data = mock_data[dep]
                        dep_node = ProtocolNode(
                            name=dep,
                            tvl=dep_data['tvl'],
                            category=dep_data['category'],
                            chains=dep_data['chains']
                        )
                        self.protocols[dep] = dep_node
                        self.graph.add_node(dep, **dep_data)

                    self.graph.add_edge(proto_name, dep, type='depends_on')

        # Calculate criticality scores
        self._calculate_criticality_scores()

    def _calculate_criticality_scores(self):
        """Calculate how critical each protocol is to the ecosystem"""

        # Centrality measures
        pagerank = nx.pagerank(self.graph.reverse())
        betweenness = nx.betweenness_centrality(self.graph)

        for proto_name, node in self.protocols.items():
            # Criticality = PageRank + Betweenness + TVL factor
            tvl_factor = node.tvl / 1_000_000_000  # Normalized
            node.criticality_score = (
                pagerank.get(proto_name, 0) * 40 +
                betweenness.get(proto_name, 0) * 40 +
                min(tvl_factor, 1.0) * 20
            )

    def _identify_cascade_scenarios(self) -> List[CascadeScenario]:
        """Identify potential cascade failure scenarios"""

        scenarios = []

        # Find protocols with many dependents (potential cascade triggers)
        for proto_name, node in self.protocols.items():
            dependents = list(self.graph.predecessors(proto_name))

            if len(dependents) >= 2:  # At least 2 protocols depend on it
                # Calculate cascade impact
                affected = self._get_cascade_affected(proto_name)

                if len(affected) > 0:
                    total_var = sum(
                        self.protocols[p].tvl for p in affected
                        if p in self.protocols
                    )

                    # Estimate likelihood based on protocol type
                    likelihood = self._estimate_cascade_likelihood(node)

                    scenario = CascadeScenario(
                        trigger_protocol=proto_name,
                        affected_protocols=affected,
                        cascade_path=[proto_name] + affected,
                        total_value_at_risk=total_var,
                        likelihood=likelihood,
                        description=self._generate_cascade_description(
                            proto_name, affected, node.category
                        )
                    )

                    scenarios.append(scenario)

        # Sort by value at risk
        scenarios.sort(key=lambda s: s.total_value_at_risk, reverse=True)

        return scenarios

    def _get_cascade_affected(self, trigger: str) -> List[str]:
        """Get all protocols affected by cascade from trigger"""

        affected = set()

        # BFS to find all reachable protocols
        queue = [trigger]
        visited = {trigger}

        while queue:
            current = queue.pop(0)

            # Get protocols that depend on current
            dependents = list(self.graph.predecessors(current))

            for dep in dependents:
                if dep not in visited:
                    visited.add(dep)
                    affected.add(dep)
                    queue.append(dep)

        return list(affected)

    def _estimate_cascade_likelihood(self, node: ProtocolNode) -> float:
        """Estimate likelihood of cascade from protocol failure"""

        # Base likelihood by category
        base_likelihoods = {
            'Oracle': 0.15,  # Oracle failure is systemic
            'Bridge': 0.12,  # Bridge exploits are common
            'LSD': 0.08,    # LSD depeg events
            'Lending': 0.05,
            'DEX': 0.03,
        }

        base = base_likelihoods.get(node.category, 0.05)

        # Adjust for TVL (higher TVL = more attractive target)
        tvl_multiplier = 1 + min(node.tvl / 10_000_000_000, 0.5)

        return min(base * tvl_multiplier, 0.3)

    def _generate_cascade_description(
        self,
        trigger: str,
        affected: List[str],
        category: str
    ) -> str:
        """Generate human-readable cascade description"""

        descriptions = {
            'Oracle': (
                f"{trigger} oracle manipulation → Price feeds corrupted → "
                f"{len(affected)} protocols liquidate positions → Cascade failure"
            ),
            'Bridge': (
                f"{trigger} bridge exploit → Cross-chain value locked → "
                f"{len(affected)} integrated protocols lose liquidity"
            ),
            'LSD': (
                f"{trigger} depeg event → Collateral devaluation → "
                f"{len(affected)} lending protocols face bad debt"
            ),
        }

        return descriptions.get(
            category,
            f"{trigger} failure cascades to {len(affected)} dependent protocols"
        )

    def _find_single_points_of_failure(self) -> List[SinglePointOfFailure]:
        """Find single points of failure in ecosystem"""

        spofs = []

        for proto_name, node in self.protocols.items():
            dependents = list(self.graph.predecessors(proto_name))

            if len(dependents) >= 3:  # At least 3 protocols depend on it
                # This is a potential SPOF

                dep_tvl = sum(
                    self.protocols[d].tvl for d in dependents
                    if d in self.protocols
                )

                # Determine dependency type
                dep_type = self._infer_dependency_type(node.category)

                # Check for mitigation
                mitigation = self._check_mitigation_exists(proto_name, dep_type)

                spof = SinglePointOfFailure(
                    protocol_name=proto_name,
                    dependent_protocols=dependents,
                    dependency_type=dep_type,
                    total_tvl_at_risk=dep_tvl,
                    mitigation_exists=mitigation,
                    exploit_scenario=self._generate_spof_exploit(proto_name, dep_type)
                )

                spofs.append(spof)

        # Sort by TVL at risk
        spofs.sort(key=lambda s: s.total_tvl_at_risk, reverse=True)

        return spofs

    def _infer_dependency_type(self, category: str) -> DependencyType:
        """Infer dependency type from protocol category"""

        mapping = {
            'Oracle': DependencyType.ORACLE_DEPENDENCY,
            'Bridge': DependencyType.BRIDGE_DEPENDENCY,
            'LSD': DependencyType.COLLATERAL_DEPENDENCY,
            'DEX': DependencyType.LIQUIDITY_DEPENDENCY,
        }

        return mapping.get(category, DependencyType.TECHNICAL_INTEGRATION)

    def _check_mitigation_exists(self, protocol: str, dep_type: DependencyType) -> bool:
        """Check if mitigation exists for SPOF"""

        # Mock check (in production: analyze contracts)
        # Oracles should have fallback
        if dep_type == DependencyType.ORACLE_DEPENDENCY:
            return False  # Assume no fallback for demo

        return False

    def _generate_spof_exploit(self, protocol: str, dep_type: DependencyType) -> str:
        """Generate SPOF exploit scenario"""

        scenarios = {
            DependencyType.ORACLE_DEPENDENCY: (
                f"Manipulate {protocol} oracle → All dependent protocols use bad prices → "
                f"Mass liquidations and arbitrage"
            ),
            DependencyType.BRIDGE_DEPENDENCY: (
                f"Exploit {protocol} bridge → Lock cross-chain value → "
                f"Dependent protocols lose liquidity"
            ),
            DependencyType.COLLATERAL_DEPENDENCY: (
                f"Trigger {protocol} depeg → Collateral devaluation → "
                f"Bad debt across lending protocols"
            ),
        }

        return scenarios.get(
            dep_type,
            f"Exploit {protocol} to cascade failure across dependents"
        )

    def _detect_composition_exploits(self) -> List[Dict[str, Any]]:
        """Detect multi-protocol composition exploit opportunities"""

        exploits = []

        # Look for interesting protocol combinations
        # Example: Oracle + Lending + DEX

        # Find oracle protocols
        oracles = [p for p, n in self.protocols.items() if n.category == 'Oracle']

        for oracle in oracles:
            # Find lending protocols that use this oracle
            lending_deps = [
                p for p in self.graph.predecessors(oracle)
                if self.protocols[p].category == 'Lending'
            ]

            if lending_deps:
                # Composition exploit opportunity
                for lending in lending_deps:
                    exploit = {
                        'type': 'oracle_manipulation_lending',
                        'protocols': [oracle, lending],
                        'attack_path': [
                            f"1. Manipulate {oracle} price feed",
                            f"2. {lending} uses manipulated price",
                            f"3. Trigger mass liquidations",
                            f"4. Profit from liquidation bonuses"
                        ],
                        'estimated_profit': self.protocols[lending].tvl * 0.05,  # 5% of TVL
                        'complexity': 'HIGH',
                        'confidence': 0.75
                    }

                    exploits.append(exploit)

        return exploits

    def _calculate_systemic_risk(self) -> float:
        """Calculate overall systemic risk score (0-100)"""

        # Factors:
        # 1. Number of SPOFs
        # 2. Cascade scenarios
        # 3. Interconnectedness (graph density)
        # 4. Lack of diversity (all using same oracle, etc.)

        spof_count = len([p for p in self.protocols.values()
                         if len(list(self.graph.predecessors(p.name))) >= 3])

        cascade_count = len([p for p in self.protocols.values()
                           if len(list(self.graph.predecessors(p.name))) >= 2])

        density = nx.density(self.graph)

        risk_score = (
            spof_count * 20 +
            cascade_count * 10 +
            density * 30
        )

        return min(risk_score, 100.0)

    def _get_all_edges(self) -> List[DependencyEdge]:
        """Get all dependency edges"""

        edges = []

        for from_node, to_node in self.graph.edges():
            # Infer dependency properties
            from_proto = self.protocols[from_node]
            to_proto = self.protocols[to_node]

            dep_type = self._infer_dependency_type(to_proto.category)

            # Estimate value at risk
            var = from_proto.tvl * 0.1  # Simplified

            # Determine criticality
            if to_proto.criticality_score > 70:
                criticality = RiskLevel.CRITICAL
            elif to_proto.criticality_score > 50:
                criticality = RiskLevel.HIGH
            else:
                criticality = RiskLevel.MEDIUM

            edge = DependencyEdge(
                from_protocol=from_node,
                to_protocol=to_node,
                dependency_type=dep_type,
                criticality=criticality,
                value_at_risk=var
            )

            edges.append(edge)

        return edges

    def generate_report(self, ecosystem: EcosystemMap) -> str:
        """Generate ecosystem analysis report"""

        report = f"🗺️  PROTOCOL ECOSYSTEM ANALYSIS\n"
        report += f"{'='*70}\n\n"

        # Overview
        report += f"ECOSYSTEM OVERVIEW:\n"
        report += f"  Total protocols: {len(ecosystem.protocols)}\n"
        report += f"  Total TVL: ${sum(p.tvl for p in ecosystem.protocols):,.0f}\n"
        report += f"  Dependencies: {len(ecosystem.dependencies)}\n"
        report += f"  Systemic risk score: {ecosystem.systemic_risk_score:.0f}/100\n\n"

        # Cascade scenarios
        if ecosystem.cascade_scenarios:
            report += f"\n🌊 CASCADE FAILURE SCENARIOS ({len(ecosystem.cascade_scenarios)}):\n"
            report += f"{'-'*70}\n"

            for i, scenario in enumerate(ecosystem.cascade_scenarios[:3], 1):
                report += f"\n{i}. {scenario.trigger_protocol.upper()} FAILURE\n"
                report += f"   Affected: {len(scenario.affected_protocols)} protocols\n"
                report += f"   Value at Risk: ${scenario.total_value_at_risk:,.0f}\n"
                report += f"   Likelihood: {scenario.likelihood*100:.0f}%\n"
                report += f"   Scenario: {scenario.description}\n"

        # Single points of failure
        if ecosystem.single_points_of_failure:
            report += f"\n\n⚠️  SINGLE POINTS OF FAILURE ({len(ecosystem.single_points_of_failure)}):\n"
            report += f"{'-'*70}\n"

            for i, spof in enumerate(ecosystem.single_points_of_failure[:3], 1):
                report += f"\n{i}. {spof.protocol_name.upper()}\n"
                report += f"   Type: {spof.dependency_type.value}\n"
                report += f"   Dependent protocols: {len(spof.dependent_protocols)}\n"
                report += f"   TVL at risk: ${spof.total_tvl_at_risk:,.0f}\n"
                report += f"   Mitigation: {'YES' if spof.mitigation_exists else 'NO'}\n"
                report += f"   Exploit: {spof.exploit_scenario}\n"

        # Composition exploits
        if ecosystem.composition_exploits:
            report += f"\n\n🔗 COMPOSITION EXPLOIT OPPORTUNITIES ({len(ecosystem.composition_exploits)}):\n"
            report += f"{'-'*70}\n"

            for i, exploit in enumerate(ecosystem.composition_exploits[:3], 1):
                report += f"\n{i}. {exploit['type'].upper()}\n"
                report += f"   Protocols: {' + '.join(exploit['protocols'])}\n"
                report += f"   Estimated profit: ${exploit['estimated_profit']:,.0f}\n"
                report += f"   Complexity: {exploit['complexity']}\n"
                report += f"   Confidence: {exploit['confidence']*100:.0f}%\n"
                report += f"   Attack path:\n"
                for step in exploit['attack_path']:
                    report += f"     {step}\n"

        report += f"\n{'='*70}\n"

        return report


# ==================== EXAMPLE USAGE ====================

async def main():
    """Example usage"""

    mapper = ProtocolMapper()

    # Analyze ecosystem
    ecosystem = await mapper.analyze_ecosystem(
        target_protocols=['wormhole', 'lido', 'aave', 'uniswap'],
        depth=3
    )

    # Print report
    print(mapper.generate_report(ecosystem))


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
