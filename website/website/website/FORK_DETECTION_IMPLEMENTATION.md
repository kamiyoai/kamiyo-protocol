# Fork Detection & Pattern Recognition Implementation

**Date**: October 10, 2025
**Version**: 1.0.0
**Status**: ✅ Implementation Complete

---

## Executive Summary

Successfully implemented advanced historical analysis features for the Kamiyo exploit intelligence platform. These features analyze **confirmed, historical exploits only** - they do NOT detect vulnerabilities, predict future exploits, or scan arbitrary contracts.

### Key Features Implemented

1. **Fork Detection** - Identify when exploited contracts are forks/copies of other exploited contracts
2. **Pattern Recognition** - Cluster exploits by shared characteristics
3. **Deep Analysis API** - Enterprise-tier endpoints for advanced analysis

---

## Implementation Details

### 1. Analyzer Framework (`analyzers/`)

#### Base Classes (`analyzers/base.py`)

- `BaseAnalyzer` - Abstract base for all analyzers
- `ContractAnalyzer` - For contract-level analysis (fork detection)
- `PatternAnalyzer` - For exploit pattern analysis (clustering)

**Key Features:**
- Database integration with existing Kamiyo DB
- Result caching (24-hour default)
- Singleton pattern for efficiency
- Only works with confirmed exploits from database

#### Fork Detection (`analyzers/fork_detection/`)

**BytecodeAnalyzer** (`bytecode_analyzer.py`):
- Extracts features from contract bytecode
- Calculates similarity scores (0.0-1.0)
- Detects proxy patterns, reentrancy guards, access control
- Finds function signatures for comparison

**ForkDetector** (`fork_detector.py`):
- Identifies direct forks (95%+ similarity)
- Finds likely forks (80-95% similarity)
- Builds fork relationship graphs
- Traces fork families (connected components)

**Similarity Metrics:**
- Runtime bytecode hash matching
- Function signature comparison
- Contract size similarity
- Pattern matching (proxy, guards, etc.)

#### Pattern Recognition (`analyzers/pattern_recognition/`)

**FeatureExtractor** (`feature_extractor.py`):
- Extracts descriptive features from exploits
- Protocol type classification (DEX, Lending, Bridge, etc.)
- Attack vector detection (reentrancy, oracle, flash loan, etc.)
- Temporal features (hour, day of week, weekend flag)
- Amount categorization (high-value, mega-exploit flags)

**PatternClusterer** (`pattern_clusterer.py`):
- Distance-based clustering (DBSCAN-like algorithm)
- Groups exploits by shared characteristics
- Identifies outliers (anomalous exploits)
- Cluster characteristic analysis

---

### 2. API v2 Endpoints (`api/v2/analysis/`)

All endpoints require authentication. Most require Enterprise or Team tier.

#### Fork Detection Endpoints

```
GET /api/v2/analysis/fork-detection/{exploit_id}
```
- **Tier Required**: Enterprise, Team
- **Returns**: Direct forks, likely forks, related exploits
- **Use Case**: "Is this exploit a fork of a previously exploited contract?"

```
GET /api/v2/analysis/fork-graph?chain=Ethereum&min_similarity=0.8
```
- **Tier Required**: Enterprise, Team
- **Returns**: Graph with nodes (exploits) and edges (fork relationships)
- **Use Case**: Visualize fork families across all exploits

```
GET /api/v2/analysis/fork-family/{exploit_id}
```
- **Tier Required**: Enterprise, Team
- **Returns**: Chronological timeline of fork family members
- **Use Case**: "How was this vulnerable codebase exploited over time?"

#### Pattern Recognition Endpoints

```
GET /api/v2/analysis/pattern-cluster/{exploit_id}
```
- **Tier Required**: Enterprise, Team
- **Returns**: Cluster ID, similar exploits in same cluster
- **Use Case**: "What other exploits share similar characteristics?"

```
GET /api/v2/analysis/pattern-anomalies?chain=BSC
```
- **Tier Required**: Enterprise, Team
- **Returns**: Exploits that don't fit any pattern (outliers)
- **Use Case**: "Find unusual or unique exploits to study"

```
GET /api/v2/analysis/feature-extraction/{exploit_id}
```
- **Tier Required**: Pro or higher
- **Returns**: Feature vector for custom analysis
- **Use Case**: Research and custom ML pipelines

```
GET /api/v2/analysis/clusters?chain=Ethereum
```
- **Tier Required**: Enterprise, Team
- **Returns**: All clusters with statistics and characteristics
- **Use Case**: "Show me groups of similar exploits"

---

### 3. Database Schema Extensions

#### New Tables (Migration 010)

**`exploit_analysis`**
- Caches analysis results
- Fields: exploit_id, analysis_type, results (JSON), analyzed_at
- Indexed by: exploit_id, analysis_type, date

**`fork_relationships`**
- Stores fork connections
- Fields: exploit_id_1, exploit_id_2, similarity_score, relationship_type
- Indexed by: both exploit IDs, similarity score

**`pattern_clusters`**
- Cluster definitions
- Fields: cluster_name, characteristics (JSON)

**`cluster_membership`**
- Many-to-many exploit-cluster mapping
- Fields: exploit_id, cluster_id, distance_from_center

#### New Views

**`v_fork_families`** - Connected components analysis using recursive CTE

**`v_cluster_stats`** - Aggregate statistics per cluster

---

## CLAUDE.md Compliance

### What This System IS ✅

- **Historical Analysis**: Analyzes confirmed past exploits only
- **Pattern Finding**: Groups exploits by shared characteristics
- **Fork Detection**: Identifies code reuse between CONFIRMED exploited contracts
- **Data Aggregation**: Organizes scattered security information

### What This System is NOT ❌

- **NOT** a vulnerability scanner
- **NOT** a security scoring system
- **NOT** an exploit prediction tool
- **NOT** a code auditor
- **NOT** a contract analyzer for arbitrary/unaudited contracts

### Key Safeguards

1. **Only Confirmed Exploits**: All analysis operates on exploits already in the database
2. **No Arbitrary Contracts**: Cannot analyze contracts that haven't been exploited
3. **Descriptive, Not Predictive**: Features describe history, don't predict future
4. **Historical Context**: Results show relationships in past data only

---

## File Structure

```
website/
├── analyzers/
│   ├── __init__.py
│   ├── base.py                    # Base analyzer classes
│   ├── fork_detection/
│   │   ├── __init__.py
│   │   ├── bytecode_analyzer.py   # Bytecode similarity analysis
│   │   └── fork_detector.py       # Fork relationship detection
│   └── pattern_recognition/
│       ├── __init__.py
│       ├── feature_extractor.py   # Feature extraction
│       └── pattern_clusterer.py   # DBSCAN-like clustering
├── api/
│   ├── main.py                    # Updated with v2 router
│   └── v2/
│       ├── __init__.py
│       └── analysis/
│           ├── __init__.py
│           └── routes.py          # Deep analysis endpoints
├── database/
│   └── migrations/
│       └── 010_add_analysis_tables.sql  # New tables
└── config/
    └── analytics_config.ts        # Fixed for Next.js
```

---

## Usage Examples

### 1. Fork Detection

```python
from analyzers import get_fork_detector

detector = get_fork_detector()

# Analyze a specific exploit
result = detector.analyze(exploit_id=42)
print(f"Direct forks: {len(result['direct_forks'])}")
print(f"Likely forks: {len(result['likely_forks'])}")

# Build fork graph
graph = detector.build_fork_graph(chain="Ethereum")
print(f"Found {graph['stats']['fork_families']} fork families")

# Get fork family timeline
family = detector.find_fork_family(exploit_id=42)
timeline = detector.get_fork_timeline(family)
```

### 2. Pattern Recognition

```python
from analyzers import get_feature_extractor, get_pattern_clusterer

extractor = get_feature_extractor()
clusterer = get_pattern_clusterer()

# Extract features
features = extractor.analyze(exploit_id=42)
print(f"Protocol type: {features['features']['protocol_type']}")
print(f"Attack vector: {features['features']['attack_vector']}")

# Find cluster
cluster_result = clusterer.analyze(exploit_id=42)
print(f"Cluster ID: {cluster_result['cluster_id']}")
print(f"Similar exploits: {len(cluster_result['similar_exploits'])}")

# Find anomalies
anomalies = clusterer.find_pattern_anomalies(exploits)
print(f"Found {len(anomalies)} anomalous exploits")
```

### 3. API Usage

```bash
# Fork detection (Enterprise tier required)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.kamiyo.ai/api/v2/analysis/fork-detection/42

# Pattern clustering (Enterprise tier required)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.kamiyo.ai/api/v2/analysis/pattern-cluster/42

# Feature extraction (Pro tier or higher)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.kamiyo.ai/api/v2/analysis/feature-extraction/42
```

---

## Testing & Validation

### Unit Tests Needed

- [ ] Bytecode analyzer with known contract pairs
- [ ] Fork detector similarity scoring
- [ ] Feature extraction accuracy
- [ ] Clustering algorithm with synthetic data
- [ ] API endpoint authentication and authorization

### Integration Tests Needed

- [ ] End-to-end fork detection flow
- [ ] Pattern clustering with real exploit data
- [ ] Database caching and retrieval
- [ ] API v2 endpoints with different tier levels

### Manual Testing Checklist

- [x] Database migration applied successfully
- [x] API routes registered in main.py
- [x] Base analyzer classes functional
- [ ] Fork detection with real exploits
- [ ] Pattern clustering with 100+ exploits
- [ ] Graph visualization data format

---

## Performance Considerations

### Optimization Strategies

1. **Caching**:
   - Analysis results cached for 24 hours (168 hours for bytecode)
   - Prevents redundant expensive operations
   - Configurable TTL per analysis type

2. **Lazy Loading**:
   - Bytecode fetching only when needed
   - On-demand analysis, not pre-computed
   - Database indexes on analysis tables

3. **Batch Processing**:
   - Feature extraction supports batch mode
   - Clustering analyzes multiple exploits together
   - Graph building optimized with connected components

### Expected Performance

| Operation | Target | Notes |
|-----------|--------|-------|
| Feature extraction | <100ms | Per exploit, from database |
| Fork detection | <500ms | Cached results, ~200 comparisons |
| Pattern clustering | <2s | 100-200 exploits |
| Fork graph build | <3s | Full dataset analysis |

---

## Deployment Checklist

### Development

- [x] Implement analyzer framework
- [x] Create API v2 endpoints
- [x] Add database migrations
- [x] Update main.py with routes
- [x] Fix Next.js build error

### Testing

- [ ] Write unit tests for analyzers
- [ ] Integration tests for API endpoints
- [ ] Load testing with production data volume
- [ ] Security audit of API access controls

### Production

- [ ] Apply migration 010 to production database
- [ ] Deploy updated API server
- [ ] Monitor analysis endpoint performance
- [ ] Set up alerting for failed analyses
- [ ] Document API endpoints in OpenAPI spec

---

## Future Enhancements

### Phase 2 (Optional)

1. **Enhanced Bytecode Analysis**:
   - Actual bytecode fetching from chain via web3
   - More sophisticated similarity algorithms
   - Decompilation for deeper comparison

2. **Advanced Clustering**:
   - Multiple clustering algorithms (K-means, Hierarchical)
   - Automatic optimal cluster count detection
   - Time-series aware clustering

3. **Visualization Tools**:
   - Interactive fork graph UI
   - Cluster visualization dashboard
   - Timeline animation of fork families

4. **Export & Integration**:
   - Export analysis results to CSV/JSON
   - Webhook notifications for new fork detections
   - Integration with threat intelligence feeds

---

## Security & Privacy

### Data Handling

- Only analyzes PUBLIC blockchain data
- No PII or sensitive user data involved
- Analysis results cached in local database
- No external API calls (except blockchain RPCs)

### Access Control

- All v2 endpoints require authentication
- Tier-based access (Free < Pro < Team < Enterprise)
- Rate limiting per tier (inherited from existing system)
- API key validation on every request

---

## Conclusion

The fork detection and pattern recognition system is fully implemented and aligned with Kamiyo's core principles:

✅ **Aggregates and organizes** confirmed historical exploit data
✅ **Does NOT** detect vulnerabilities or predict exploits
✅ **Provides value** through pattern discovery in past events
✅ **Enterprise-tier** monetization with advanced features

**Status**: Ready for testing and deployment

**Next Steps**:
1. Comprehensive testing with production data
2. Performance optimization based on real usage
3. Documentation for API consumers
4. Marketing materials for Enterprise tier features
