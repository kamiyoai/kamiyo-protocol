# KAMIYO FRONTEND ALIGNMENT PLAN
## MCP Subscriptions + x402 Hybrid Model

**Objective:** Update all frontend texts to reflect new positioning:
- **Security Intelligence for AI Agents** (not payment facilitator)
- **MCP Subscriptions** for persistent AI agent access ($19/99/299/mo)
- **x402 API** for direct queries ($0.01/query)
- Real-time exploit data from 20+ sources

---

## PHASE 1: CRITICAL PAGES (Launch Blockers)

### 1.1 Homepage (`/pages/index.js`)

**Current issues:**
- Hero focuses on "x402 payment protocol" not security intelligence
- Wrong pricing ($0.10 instead of $0.01)
- Generic "payment facilitator" messaging
- No mention of MCP subscriptions

**Required changes:**
```javascript
OLD HERO:
"Real-Time Crypto Exploit Intelligence via x402"
"Pay with USDC on-chain, no API keys required"

NEW HERO:
"Security Intelligence for AI Agents"
"Subscribe via MCP for unlimited queries, or pay $0.01 per query via x402"

CTA BUTTONS:
- "Add to Claude Desktop" (MCP subscription)
- "View API Docs" (x402 direct access)
```

**Pricing updates:**
- Change all `$0.10` to `$0.01`
- Add MCP subscription tiers section
- Show both options: "MCP for AI agents, x402 for direct API"

**Sections to rewrite:**
1. Hero (lines 27-65)
2. Feature badges (lines 37-50)
3. x402 code example (lines 315-360) - change pricing
4. Hidden SEO content (lines 480-527) - add MCP keywords

---

### 1.2 Pricing Page (`/pages/pricing.js`)

**Current issues:**
- Shows Free/Pro/Team/Enterprise subscription tiers
- No mention of MCP
- Wrong pricing ($0.0001/call)
- Confusing hybrid model

**Required changes:**

**New structure:**
```
OPTION 1: MCP Subscriptions (For AI Agents)
├── Personal ($19/mo) - Unlimited queries, Claude Desktop integration
├── Team ($99/mo) - 5 AI agents, team workspace
└── Enterprise ($299/mo) - Unlimited agents, SLA, custom tools

OPTION 2: x402 API (For Direct Access)
└── Pay per query - $0.01 per exploit query, no subscription needed

FAQ: "Which should I choose?"
- Use MCP if: Running persistent AI agents, need unlimited calls
- Use x402 if: Building custom integrations, sporadic queries
```

**Sections to update:**
1. Page title: "Pricing Plans for AI Agents"
2. Remove old Free tier (or clarify it's just x402)
3. Add MCP tier cards with "Add to Claude Desktop" buttons
4. Add x402 pricing card
5. Comparison table: MCP vs x402
6. Update FAQ section

---

### 1.3 Features Page (`/pages/features.js`)

**Current issues:**
- 100% focused on x402 payment protocol features
- Zero mention of security intelligence features
- Wrong pricing throughout
- No MCP integration mentioned

**Required changes:**

**New structure:**
```
SECURITY INTELLIGENCE FEATURES
├── 20+ Source Aggregation
├── Real-Time Exploit Detection
├── Protocol Risk Scoring
├── Wallet Screening
├── Historical Database
└── Source Quality Ranking

MCP INTEGRATION FEATURES
├── Claude Desktop Integration
├── Unlimited Tool Calls
├── Persistent Connections
├── Team Collaboration
└── Usage Analytics

x402 API FEATURES
├── Pay-per-Query
├── No Account Required
├── Multi-Chain Payment
└── 24h Token Validity
```

**Sections to rewrite:**
1. Main heading: "Security Intelligence + AI Agent Access"
2. Add security features section (what data you get)
3. Add MCP features section (how AI agents connect)
4. Update x402 section (payment method, not main feature)
5. Fix all pricing references

---

### 1.4 API Documentation (`/pages/api-docs.js`)

**Current issues:**
- Generic API docs focused on payment
- Wrong pricing ($0.10)
- No MCP integration guide

**Required changes:**

**New structure:**
```
GETTING STARTED
├── Option 1: Add to Claude Desktop (MCP)
└── Option 2: Direct API Access (x402)

MCP INTEGRATION
├── Installation guide
├── Available tools
├── Example: Claude querying exploits
└── Subscription management

x402 API REFERENCE
├── Authentication (payment tokens)
├── Endpoints (/exploits, /protocols, /wallets)
├── Pricing ($0.01/query)
└── Code examples (curl, Python, JavaScript)
```

**Sections to update:**
1. Add MCP integration section (top priority)
2. Update x402 examples with correct pricing
3. Add Claude Desktop screenshot
4. Show MCP tool calling examples

---

## PHASE 2: SUPPORTING PAGES

### 2.1 About Page (`/pages/about.js`)

**Changes needed:**
- Legal name: "KAMIYO x402 Payment Facilitator" → "KAMIYO Security Intelligence"
- Mission statement: Focus on security intelligence, not payment infrastructure
- Core features: Lead with security data, mention MCP + x402 as access methods
- Technology section: Add MCP protocol explanation

---

### 2.2 Security Intelligence Page (`/pages/security-intelligence.js`)

**Changes needed:**
- Add MCP subscription option
- Update hero CTAs: "Add to Claude Desktop" primary
- Clarify: "Available via MCP subscription or x402 API"
- Add MCP integration code example

---

## PHASE 3: COMPONENTS

### 3.1 FAQ Component (`/components/FAQ.js`)

**Current issues:**
- 9/9 questions about x402 payment protocol
- Zero questions about security intelligence
- Zero questions about MCP

**New FAQ structure:**
```
SECURITY INTELLIGENCE (4 questions):
1. How quickly do you detect exploits?
2. What sources do you aggregate?
3. How accurate is your data?
4. What chains do you cover?

MCP INTEGRATION (3 questions):
5. How do I add KAMIYO to Claude Desktop?
6. What tools are available via MCP?
7. How much do MCP subscriptions cost?

x402 API (2 questions):
8. Can I use x402 without a subscription?
9. How does x402 payment work?
```

---

### 3.2 SEO Component (`/components/SEO.js`)

**Changes needed:**
- Update default title: "Security Intelligence for AI Agents | KAMIYO"
- Update description: Mention MCP + x402
- Keywords: Add "MCP server", "Claude Desktop", "AI agent security"
- Remove "payment facilitator" focus

---

### 3.3 PayButton Component (`/components/PayButton.js`)

**Changes needed:**
- Default text: "Summon a Kami" → "Add to Claude Desktop"
- Default action: Stripe checkout → MCP subscription page
- Support multiple CTAs:
  - "Add to Claude Desktop" (MCP subscription)
  - "View API Docs" (x402 info)
  - "Start Free Trial" (MCP 7-day trial)

---

## PHASE 4: NAVIGATION & STRUCTURE

### 4.1 Header Navigation (`/components/Header.js`)

**New menu structure:**
```
- Security Intelligence (new!)
- MCP Integration (new!)
- API Docs (updated)
- Pricing
- About
```

---

### 4.2 Footer Links

**Update footer sections:**
- Product: Add "MCP Server", "Claude Desktop Integration"
- Resources: Add "MCP Documentation", "Integration Guide"
- Remove: Generic x402 payment links

---

## PHASE 5: DASHBOARD (Simplified)

### 5.1 Main Dashboard (`/pages/dashboard.js`)

**Options:**
A) Keep for MCP subscribers (show usage analytics)
B) Remove entirely (MCP handles auth)

**If keeping, update:**
- Title: "x402 Payment Dashboard" → "Security Intelligence Dashboard"
- Show: MCP subscription status, query usage, recent alerts
- Remove: API key management (unless needed for legacy)

---

## EXECUTION PLAN

### Agent 1: Homepage & Pricing (CRITICAL)
**Files:**
- `/pages/index.js`
- `/pages/pricing.js`

**Deliverables:**
- Updated hero with MCP + x402 messaging
- New pricing tiers (MCP subscriptions + x402)
- Correct pricing ($0.01 not $0.10)
- MCP CTAs ("Add to Claude Desktop")

---

### Agent 2: Features & API Docs (HIGH PRIORITY)
**Files:**
- `/pages/features.js`
- `/pages/api-docs.js`

**Deliverables:**
- Security intelligence features section
- MCP integration guide
- Updated x402 API docs with correct pricing
- Claude Desktop integration examples

---

### Agent 3: About & Supporting Pages (MEDIUM PRIORITY)
**Files:**
- `/pages/about.js`
- `/pages/security-intelligence.js`

**Deliverables:**
- Updated company description
- MCP subscription options added
- Mission statement focused on security

---

### Agent 4: Components & FAQ (MEDIUM PRIORITY)
**Files:**
- `/components/FAQ.js`
- `/components/SEO.js`
- `/components/PayButton.js`

**Deliverables:**
- New FAQ structure (security + MCP focus)
- Updated SEO defaults
- PayButton with MCP CTAs

---

### Agent 5: Navigation & Global Updates (LOW PRIORITY)
**Files:**
- `/components/Header.js`
- `/components/Footer.js`
- Global search/replace for pricing

**Deliverables:**
- Updated navigation menu
- New footer links
- All `$0.10` → `$0.01` replacements

---

## GLOBAL SEARCH/REPLACE PATTERNS

**Pricing fixes:**
```
$0.10 USDC → $0.01 USDC
$0.0001 per call → $0.01 per query
0.10 per call → $0.01 per query
1000 requests per $1 → 100 queries per $1
```

**Messaging fixes:**
```
"x402 Payment Facilitator" → "Security Intelligence via MCP & x402"
"payment facilitator" → "security intelligence platform"
"on-chain API payments" → "AI agent security intelligence"
"autonomous agent payments" → "AI agent exploit detection"
```

---

## VALIDATION CHECKLIST

After all agents complete:

### Content Consistency
- [ ] All pages mention both MCP and x402 options
- [ ] All pricing shows $0.01 per query
- [ ] MCP subscriptions shown as $19/$99/$299
- [ ] "Security intelligence" is primary positioning
- [ ] "Payment facilitator" removed from all primary messaging

### MCP Integration
- [ ] "Add to Claude Desktop" CTA on homepage
- [ ] MCP integration guide in API docs
- [ ] MCP pricing tiers on pricing page
- [ ] MCP tools listed in features

### User Experience
- [ ] Clear choice: "MCP for AI agents, x402 for API"
- [ ] No confusion between subscriptions and pay-per-query
- [ ] Real-time data emphasized (not delayed)
- [ ] Security focus, not payment focus

---

## TIMELINE

**Phase 1 (Critical):** 2 hours - Homepage, Pricing
**Phase 2 (High):** 2 hours - Features, API Docs
**Phase 3 (Medium):** 1 hour - About, Supporting
**Phase 4 (Medium):** 1 hour - Components
**Phase 5 (Low):** 30 min - Navigation

**Total:** 6.5 hours across 5 parallel agents

---

## SUCCESS METRICS

**Before:**
- 85% payment facilitator messaging
- 15% security intelligence messaging
- 0% MCP mentioned
- Wrong pricing ($0.10)

**After:**
- 20% payment/access method messaging
- 80% security intelligence messaging
- MCP as primary AI agent option
- Correct pricing ($0.01)
- Clear hybrid model: MCP subscriptions + x402 API
