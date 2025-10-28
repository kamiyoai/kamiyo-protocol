# KAMIYO MCP Tools - Quick Usage Guide

**For AI Agents (Claude Desktop) and Developers**

This guide provides quick reference examples for using the KAMIYO MCP tools.

---

## Tool 1: search_crypto_exploits

**Purpose:** Search the KAMIYO exploit database

**When to use:**
- Looking for exploits related to a specific protocol
- Investigating vulnerability patterns (flash loans, reentrancy, etc.)
- Researching exploits on a specific blockchain
- Finding recent security incidents

### Basic Examples

**Search by protocol name:**
```
search_crypto_exploits("Uniswap")
```

**Search for vulnerability type:**
```
search_crypto_exploits("flash loan")
search_crypto_exploits("reentrancy")
search_crypto_exploits("oracle manipulation")
```

**Filter by blockchain:**
```
search_crypto_exploits("DeFi", chain="Ethereum")
search_crypto_exploits("bridge", chain="BSC")
```

**Search with date filter:**
```
search_crypto_exploits("exploit", since="2024-01-01T00:00:00Z")
search_crypto_exploits("Curve", since="2024-06-01T00:00:00Z", limit=50)
```

**Request more results (limited by tier):**
```
search_crypto_exploits("Ethereum", limit=50)  # Personal tier
search_crypto_exploits("DeFi", limit=200)     # Team tier
```

### Use Cases

**1. Protocol Due Diligence**
```
# Before integrating with a protocol, check its security history
result = search_crypto_exploits("Aave")
print(f"Found {result['metadata']['total_matching']} incidents")
```

**2. Vulnerability Research**
```
# Research flash loan attacks
result = search_crypto_exploits("flash loan", limit=100)
for exploit in result['exploits']:
    print(f"{exploit['protocol']}: ${exploit['amount_usd']:,.0f}")
```

**3. Chain-Specific Analysis**
```
# Analyze security on Base chain
result = search_crypto_exploits("", chain="Base", limit=200)
print(f"Base chain has {result['metadata']['total_matching']} exploits")
```

---

## Tool 2: assess_defi_protocol_risk

**Purpose:** Calculate risk score for DeFi protocols

**When to use:**
- Evaluating protocol security before investment
- Comparing security of different protocols
- Monitoring protocol risk over time
- Getting actionable security recommendations

### Basic Examples

**Assess a protocol:**
```
assess_defi_protocol_risk("Uniswap")
```

**Assess with longer history:**
```
assess_defi_protocol_risk("Curve", time_window_days=180)
```

**Filter by specific chain:**
```
assess_defi_protocol_risk("Aave", chain="Ethereum", time_window_days=365)
```

**Get full enterprise analysis:**
```
assess_defi_protocol_risk("Compound", subscription_tier="enterprise")
```

### Response Interpretation

**Risk Scores:**
- 0-29: LOW - Minimal risk, good security track record
- 30-59: MEDIUM - Moderate risk, some security concerns
- 60-84: HIGH - Significant risk, multiple exploit incidents
- 85-100: CRITICAL - Severe risk, urgent action required

**Personal Tier Response:**
```json
{
  "protocol": "Uniswap",
  "risk_score": 15,
  "risk_level": "low",
  "analysis_period_days": 90
}
```

**Team Tier Response (adds):**
```json
{
  "exploit_count": 1,
  "total_loss_usd": 25000.0,
  "last_exploit_date": "2024-08-15",
  "recent_exploits": [...]
}
```

**Enterprise Tier Response (adds):**
```json
{
  "risk_factors": {
    "exploit_frequency_score": 10,
    "severity_score": 5,
    "recency_score": 0,
    "maturity_score": 0
  },
  "recommendations": [
    "Low risk: Maintain current security practices",
    "Continue regular security monitoring"
  ],
  "comparison_to_peers": {
    "percentile": 85,
    "message": "Better than 85% of similar protocols"
  }
}
```

### Use Cases

**1. Investment Decision**
```
# Before investing, check protocol security
result = assess_defi_protocol_risk("Yearn Finance")
if result['risk_level'] in ['high', 'critical']:
    print("⚠️ High risk protocol - proceed with caution")
```

**2. Portfolio Review**
```
# Check risk for all protocols in your portfolio
protocols = ["Uniswap", "Curve", "Aave", "Compound"]
for protocol in protocols:
    result = assess_defi_protocol_risk(protocol)
    print(f"{protocol}: Risk Score {result['risk_score']} ({result['risk_level']})")
```

**3. Competitor Analysis (Enterprise)**
```
# Compare multiple lending protocols
protocols = ["Aave", "Compound", "Maker"]
results = []
for protocol in protocols:
    result = assess_defi_protocol_risk(protocol, subscription_tier="enterprise")
    results.append({
        "protocol": protocol,
        "risk_score": result['risk_score'],
        "exploit_count": result['exploit_count'],
        "percentile": result['comparison_to_peers']['percentile']
    })
# Sort by safest
results.sort(key=lambda x: x['risk_score'])
```

---

## Tool 3: monitor_wallet

**Purpose:** Check if wallet has interacted with exploited protocols

**When to use:**
- Auditing wallet security exposure
- Checking if you have funds in compromised protocols
- Risk assessment before major transactions
- Portfolio security review

### Requirements

**Access Level:** Team+ subscription required

**Supported Chains:**
- ethereum
- bsc
- polygon
- arbitrum
- base
- solana

### Examples

**Check Ethereum wallet:**
```
monitor_wallet("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")
```

**Check with custom chain and lookback:**
```
monitor_wallet(
    "0xABC...",
    chain="polygon",
    lookback_days=180
)
```

**Check Solana wallet:**
```
monitor_wallet(
    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    chain="solana"
)
```

### Response Interpretation

**Risk Levels:**
- safe: No interactions detected
- low: Minor interactions, monitor closely
- medium: Multiple interactions, review positions
- high: Significant exposure, immediate review recommended
- critical: Critical exposure, urgent action required

**Team+ Response:**
```json
{
  "wallet_address": "0x742d35...",
  "chain": "ethereum",
  "interaction_count": 2,
  "interactions_found": [
    {
      "protocol": "Curve Finance",
      "wallet_interaction_count": 3,
      "last_interaction": "2024-10-15T12:00:00Z",
      "amount_usd": 2500.0,
      "status": "at_risk"
    }
  ],
  "risk_assessment": {
    "risk_level": "medium",
    "score": 42.5,
    "total_at_risk_usd": 5000.0,
    "recommendations": [
      "Review all active positions",
      "Consider reducing exposure"
    ]
  }
}
```

**Free/Personal Tier Response:**
```json
{
  "error": "premium_feature_required",
  "required_tier": "team",
  "upgrade_url": "https://kamiyo.io/pricing",
  "feature_benefits": [...]
}
```

### Use Cases

**1. Portfolio Security Audit**
```
# Check all your wallets
wallets = [
    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    "0x123...",
    "0x456..."
]
for wallet in wallets:
    result = monitor_wallet(wallet)
    if result['risk_assessment']['risk_level'] != 'safe':
        print(f"⚠️ Risk detected in {wallet}: {result['risk_assessment']['risk_level']}")
```

**2. Pre-Transaction Check**
```
# Before a major transaction, check wallet exposure
result = monitor_wallet("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0")
if result['risk_assessment']['total_at_risk_usd'] > 10000:
    print("🚨 High value at risk - review before proceeding")
```

**3. Multi-Chain Monitoring**
```
# Check wallet across multiple chains
chains = ["ethereum", "polygon", "arbitrum"]
wallet = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
for chain in chains:
    result = monitor_wallet(wallet, chain=chain)
    print(f"{chain}: {result['interaction_count']} interactions")
```

---

## Common Workflows

### Workflow 1: Protocol Investigation

**Scenario:** You want to understand the security track record of a protocol before using it.

```
# Step 1: Search for historical exploits
exploits = search_crypto_exploits("Protocol Name", limit=50)
print(f"Found {exploits['metadata']['total_matching']} incidents")

# Step 2: Assess overall risk
risk = assess_defi_protocol_risk("Protocol Name", time_window_days=365)
print(f"Risk Score: {risk['risk_score']} - {risk['risk_level'].upper()}")

# Step 3: Review recommendations (Enterprise tier)
if 'recommendations' in risk:
    print("\nRecommendations:")
    for rec in risk['recommendations']:
        print(f"  - {rec}")
```

### Workflow 2: Wallet Security Review

**Scenario:** You want to audit your wallet for exposure to compromised protocols.

```
# Step 1: Check wallet interactions
result = monitor_wallet("0xYourWallet", chain="ethereum")

# Step 2: Review each interaction
for interaction in result['interactions_found']:
    print(f"\nProtocol: {interaction['protocol']}")
    print(f"Status: {interaction['status']}")
    print(f"Amount at risk: ${interaction['amount_usd']:,.2f}")

    # Step 3: Assess protocol risk
    risk = assess_defi_protocol_risk(interaction['protocol'])
    print(f"Protocol risk: {risk['risk_level']}")
```

### Workflow 3: Vulnerability Research

**Scenario:** You're researching flash loan attacks to improve your protocol's security.

```
# Step 1: Search for flash loan exploits
exploits = search_crypto_exploits(
    "flash loan",
    limit=100,
    since="2024-01-01T00:00:00Z"
)

# Step 2: Analyze patterns
total_loss = sum(e['amount_usd'] for e in exploits['exploits'])
print(f"Flash loan exploits: {len(exploits['exploits'])}")
print(f"Total loss: ${total_loss:,.0f}")

# Step 3: Identify most affected protocols
protocols = {}
for exploit in exploits['exploits']:
    protocol = exploit['protocol']
    protocols[protocol] = protocols.get(protocol, 0) + 1

# Sort by frequency
sorted_protocols = sorted(protocols.items(), key=lambda x: x[1], reverse=True)
print("\nMost targeted protocols:")
for protocol, count in sorted_protocols[:5]:
    print(f"  {protocol}: {count} attacks")
```

---

## Subscription Tier Comparison

| Feature | Free | Personal | Team | Enterprise |
|---------|------|----------|------|------------|
| **search_crypto_exploits** |
| Max results | 10 | 50 | 200 | 1000 |
| Data freshness | 24h delay | Real-time | Real-time | Real-time |
| **assess_defi_protocol_risk** |
| Basic risk score | ❌ | ✅ | ✅ | ✅ |
| Exploit summary | ❌ | ❌ | ✅ | ✅ |
| Recommendations | ❌ | ❌ | ❌ | ✅ |
| Peer comparison | ❌ | ❌ | ❌ | ✅ |
| **monitor_wallet** |
| Access | ❌ | ❌ | ✅ | ✅ |

---

## Tips & Best Practices

### Search Optimization

**Use specific terms:**
```
✅ search_crypto_exploits("Curve Finance")
❌ search_crypto_exploits("curve")  # May return unrelated results
```

**Combine filters:**
```
✅ search_crypto_exploits("flash loan", chain="Ethereum", since="2024-01-01T00:00:00Z")
```

**Start broad, then narrow:**
```
# First get overview
broad = search_crypto_exploits("DeFi", limit=10)
# Then drill down
specific = search_crypto_exploits("DeFi", chain="Ethereum", limit=100)
```

### Risk Assessment

**Use appropriate time windows:**
```
# Recent security: 90 days (default)
assess_defi_protocol_risk("Protocol", time_window_days=90)

# Historical track record: 365 days
assess_defi_protocol_risk("Protocol", time_window_days=365)
```

**Compare before investing:**
```
# Compare similar protocols
protocols = ["Uniswap", "SushiSwap", "PancakeSwap"]
for p in protocols:
    risk = assess_defi_protocol_risk(p)
    print(f"{p}: {risk['risk_score']}")
```

### Wallet Monitoring

**Regular checks:**
```
# Weekly security check
result = monitor_wallet("0xYourWallet")
if result['risk_assessment']['risk_level'] != 'safe':
    # Take action
```

**Check before major actions:**
```
# Before large deposit/withdrawal
result = monitor_wallet("0xYourWallet")
print(f"Current risk: {result['risk_assessment']['risk_level']}")
```

---

## Error Handling

### Common Errors

**Invalid wallet address:**
```json
{
  "error": "invalid_address",
  "message": "Invalid EVM address format. Expected 0x followed by 40 hex characters."
}
```

**Premium feature (Free/Personal tier):**
```json
{
  "error": "premium_feature_required",
  "required_tier": "team",
  "upgrade_url": "https://kamiyo.io/pricing"
}
```

**Invalid date format:**
```
# Wrong: search_crypto_exploits("DeFi", since="2024-01-01")
# Right: search_crypto_exploits("DeFi", since="2024-01-01T00:00:00Z")
```

---

## Integration with Claude Desktop

**Example prompts:**

```
"Search for Uniswap exploits in the last 6 months"
"What's the risk score for Curve Finance?"
"Check if my wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 has interacted with any exploited protocols"
"Compare the security of Aave vs Compound"
"Find all flash loan attacks on Ethereum"
```

Claude will automatically call the appropriate MCP tools and present the results in a user-friendly format.

---

## Support & Resources

**Documentation:**
- Full README: `/mcp/README.md`
- Phase 2 Completion Report: `/mcp/PHASE_2_COMPLETE.md`

**Getting Help:**
- Check tool docstrings in code
- Review error messages for guidance
- Consult subscription tier comparison table

**Upgrade to unlock more features:**
- Personal: Real-time data, 50 results
- Team: Wallet monitoring, exploit summaries, 200 results
- Enterprise: Full recommendations, peer comparisons, 1000 results

---

**Last Updated:** October 28, 2025
**MCP Server Version:** 1.0.0
**Status:** Phase 2 Complete
