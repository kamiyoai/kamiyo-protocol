# KAMIYO Feature Roadmap

## Production-Ready Features (Available Now)

### Core Platform
- ✅ Real-time exploit alerts (< 5 min avg detection)
- ✅ 425+ confirmed exploits database
- ✅ 54+ blockchain networks tracked
- ✅ Historical data API (90 days Pro, 2+ years Enterprise)
- ✅ REST API with rate limiting
- ✅ WebSocket real-time feed
- ✅ Multi-channel notifications (Email, Discord, Telegram)
- ✅ Webhook endpoints (Team: 5, Enterprise: 50)
- ✅ Protocol watchlists (Enterprise)
- ✅ CSV/JSON export functionality
- ✅ User authentication (NextAuth + email verification)
- ✅ Subscription management (Stripe integration)
- ✅ Dashboard with filtering and search

## Beta Features (Demo Data - Q1 2026 Target)

### 1. Fork Detection Analysis
**Status**: Infrastructure complete, demo data only
**Available To**: Team and Enterprise tiers
**Current State**:
- ✅ Frontend page with demo visualization (`/fork-analysis`)
- ✅ Backend analyzers implemented (`ForkDetector`, `BytecodeAnalyzer`)
- ✅ Database tables created (`fork_relationships`)
- ✅ API endpoints functional (`/api/v2/analysis/fork-families`)
- ⚠️ Demo data used for display

**What's Missing for Production**:
1. **Blockchain Integration**: Need Web3 provider connections to fetch contract bytecode
   - Etherscan API integration
   - Support for 54+ chains
   - Rate limiting and caching strategy
2. **Bytecode Analysis**: Real similarity comparison algorithms
   - Opcode extraction and normalization
   - Similarity scoring (Levenshtein, Jaccard)
   - Cache analysis results in database
3. **Data Population**: Backfill historical exploits with real bytecode data
   - ~425 contracts to analyze
   - Estimated 2-3 weeks for initial backfill

**Estimated Timeline**: 4-6 weeks
**Blockers**: Blockchain API costs, rate limits, contract source code availability

---

### 2. Pattern Clustering
**Status**: Infrastructure complete, demo data only
**Available To**: Team and Enterprise tiers
**Current State**:
- ✅ Frontend page with demo clusters (`/pattern-clustering`)
- ✅ Backend clusterers implemented (`PatternClusterer`, `FeatureExtractor`)
- ✅ Database tables created (`pattern_clusters`, `cluster_membership`)
- ✅ API endpoints functional (`/api/analysis/patterns`)
- ⚠️ Demo data used for display

**What's Missing for Production**:
1. **Feature Engineering**: Extract real features from exploit data
   - Attack vector classification (manual review of exploits)
   - Protocol type categorization
   - Temporal patterns analysis
2. **ML Model Training**: Run clustering algorithms on real data
   - DBSCAN implementation (already coded)
   - Parameter tuning (eps, min_samples)
   - Validate cluster quality
3. **Cluster Labeling**: Manual review and naming of discovered clusters
   - Domain expert validation
   - Common characteristics documentation

**Estimated Timeline**: 2-3 weeks
**Blockers**: Requires manual classification of existing exploits for training data

---

### 3. Fork Graph Visualization
**Status**: Component disabled, Enterprise tier only
**Available To**: Enterprise tier
**Current State**:
- ✅ Component exists (`ForkGraphVisualization.tsx`) but disabled
- ✅ Table fallback implemented for Team tier
- ⚠️ Graph disabled due to frontend rebuild

**What's Missing for Production**:
1. **Frontend Migration**: Component was in deleted `/frontend` directory
   - Need to recreate D3.js graph component in Next.js
   - Interactive node/edge visualization
   - Filtering and zoom controls
2. **Data Integration**: Connect to real fork detection backend
   - Once fork detection has real data
   - API integration for graph data

**Estimated Timeline**: 1-2 weeks (after fork detection is production-ready)
**Blockers**: Depends on fork detection production data

---

## Compliance with CLAUDE.md Principles

### What These Features ARE:
- ✅ **Aggregation**: Grouping historical exploits by similarity
- ✅ **Organization**: Visualizing relationships between confirmed incidents
- ✅ **Historical Analysis**: Understanding patterns in past exploits
- ✅ **Data Presentation**: Making complex relationships easier to understand

### What These Features ARE NOT:
- ❌ **Vulnerability Detection**: NOT scanning code for new vulnerabilities
- ❌ **Predictive**: NOT forecasting future exploits
- ❌ **Security Analysis**: NOT assessing risk or providing security scores
- ❌ **Original Research**: Only analyzing confirmed, historical exploits

### Value Proposition:
- "See which exploits were forks of the same vulnerable codebase"
- "Understand common patterns in historical exploit techniques"
- "Visualize how vulnerabilities spread through the ecosystem"
- All based on CONFIRMED exploits with transaction hashes

---

## Implementation Phases

### Phase 1: Beta Labels & Documentation (CURRENT - Complete)
**Duration**: 2 days
**Status**: ✅ Complete on workstream-2-features branch
- [x] Add Beta labels to pricing page
- [x] Add Beta labels to homepage
- [x] Update FAQ with Beta feature clarification
- [x] Create this roadmap document
- [x] Mark API endpoints as Beta in documentation

### Phase 2: Fork Detection Production (Q1 2026)
**Duration**: 4-6 weeks
**Prerequisites**: Budget for blockchain API calls
1. Week 1-2: Blockchain integration (Etherscan, Web3 providers)
2. Week 2-3: Bytecode analysis implementation
3. Week 3-4: Historical data backfill
4. Week 4-5: Testing and validation
5. Week 5-6: Remove Beta labels, announce launch

### Phase 3: Pattern Clustering Production (Q1 2026)
**Duration**: 2-3 weeks
**Can run in parallel with Phase 2**
1. Week 1: Manual classification of exploits (attack vectors, protocol types)
2. Week 2: ML clustering on real data, parameter tuning
3. Week 3: Cluster validation, labeling, documentation

### Phase 4: Fork Graph Visualization (Q1 2026)
**Duration**: 1-2 weeks
**Prerequisites**: Phase 2 complete
1. Week 1: Recreate D3.js component in Next.js
2. Week 2: Integration testing, polish

---

## Success Metrics

### Beta Phase (Current)
- [ ] Users understand features are in Beta
- [ ] No confusion about functionality
- [ ] Clear timeline expectations set

### Production Launch
- [ ] Fork detection: >90% accuracy on similar bytecode
- [ ] Pattern clustering: 5-10 meaningful clusters identified
- [ ] Graph visualization: Load time < 2s for 100+ nodes
- [ ] User feedback: >80% find features useful
- [ ] Upgrade rate: 10%+ of Pro users upgrade to Team

---

## Risk Assessment

### Technical Risks
1. **Blockchain API Costs**: Etherscan rate limits expensive
   - Mitigation: Aggressive caching, batch processing
2. **Bytecode Availability**: Not all exploited contracts have verified source
   - Mitigation: Start with verified contracts only, expand later
3. **Clustering Quality**: May not find meaningful patterns
   - Mitigation: Manual validation before launch

### Business Risks
1. **User Expectations**: Marketing may set expectations too high
   - Mitigation: Clear Beta labels, realistic timelines
2. **Competitive Pressure**: Other platforms may launch similar features
   - Mitigation: Focus on aggregation value, not analysis claims
3. **Scope Creep**: Pressure to add "vulnerability detection"
   - Mitigation: Strict adherence to CLAUDE.md principles

---

## Questions & Decisions

### Q: Why not launch with real data now?
**A**: Requires blockchain API integration that costs $500-1000/month for historical backfill. Better to validate demand with Beta first.

### Q: Can we speed up the timeline?
**A**: Yes, if blockchain API costs are approved immediately. Could reduce to 6-8 weeks total.

### Q: What if Beta users complain about demo data?
**A**: Beta labels are prominent. If complaints arise, we can disable access until production-ready.

### Q: Should we charge for Beta features?
**A**: Current approach (include in Team/Enterprise) is correct. Users get preview, we get feedback, no refund risk.

---

## Contact & Updates

**Maintained By**: Work Stream 2 - Feature Engineering Specialist
**Last Updated**: 2025-10-13
**Next Review**: 2025-11-01 (after Beta feedback collection)

For questions about this roadmap, contact: [Project Lead Email]
