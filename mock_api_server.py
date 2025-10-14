#!/usr/bin/env python3
"""
Temporary Mock Kamiyo API Server
For testing the autonomous growth engine without deploying the real API
"""
from fastapi import FastAPI, Query
from datetime import datetime, timedelta
import uvicorn

app = FastAPI(
    title="Mock Kamiyo API",
    description="Temporary test server with sample exploit data"
)

# Sample exploit data (2 recent exploits)
SAMPLE_EXPLOITS = [
    {
        "tx_hash": "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
        "protocol": "Abracadabra (MIM_Spell)",
        "chain": "Ethereum",
        "loss_amount_usd": 1700000,
        "exploit_type": "Smart Contract Logic Flaw",
        "timestamp": (datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z",
        "description": "The DeFi lending platform Abracadabra was exploited due to flawed implementation logic of the cook function, which allows users to execute multiple operations in a single transaction. The attacker manipulated smart contract variables to bypass a solvency check, borrowing assets beyond the intended limit.",
        "recovery_status": "Contracts paused, investigation ongoing",
        "source": "BeInCrypto, Security Researchers",
        "source_url": "https://beincrypto.com/defi-platform-abracadabra-hit-by-major-exploit/"
    },
    {
        "tx_hash": "0xdef456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
        "protocol": "CurveDEX",
        "chain": "Ethereum",
        "loss_amount_usd": 520000,
        "exploit_type": "Price Oracle Manipulation",
        "timestamp": (datetime.utcnow() - timedelta(hours=5)).isoformat() + "Z",
        "description": "Attacker exploited a vulnerability in the price oracle mechanism to manipulate asset prices and drain funds from the liquidity pool. The attack involved flash loans and precise timing to maximize extracted value.",
        "recovery_status": "Team investigating, partial funds recovered",
        "source": "PeckShield",
        "source_url": "https://twitter.com/peckshield"
    },
    {
        "tx_hash": "0x123abc456def789012abc456def789012abc456def789012abc456def789012a",
        "protocol": "BridgeProtocol",
        "chain": "BSC",
        "loss_amount_usd": 850000,
        "exploit_type": "Bridge Validation Bypass",
        "timestamp": (datetime.utcnow() - timedelta(hours=8)).isoformat() + "Z",
        "description": "Cross-chain bridge exploited due to insufficient validation of message signatures. Attacker forged withdrawal messages to extract funds without corresponding deposits.",
        "recovery_status": "Bridge paused, security audit in progress",
        "source": "BlockSec",
        "source_url": "https://blocksec.com"
    }
]

@app.get("/")
def root():
    """API root endpoint"""
    return {
        "name": "Mock Kamiyo API",
        "version": "test-1.0",
        "status": "testing",
        "message": "This is a temporary mock API for testing. Deploy the real API to Render for production.",
        "docs": "/docs",
        "endpoints": {
            "exploits": "/exploits",
            "health": "/health"
        }
    }

@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database_exploits": len(SAMPLE_EXPLOITS),
        "tracked_chains": 2,
        "active_sources": 3,
        "total_sources": 3,
        "sources": [
            {
                "name": "BeInCrypto",
                "is_active": True,
                "last_fetch": datetime.utcnow().isoformat() + "Z"
            },
            {
                "name": "PeckShield",
                "is_active": True,
                "last_fetch": datetime.utcnow().isoformat() + "Z"
            },
            {
                "name": "BlockSec",
                "is_active": True,
                "last_fetch": datetime.utcnow().isoformat() + "Z"
            }
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/exploits")
def get_exploits(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page"),
    chain: str = Query(None, description="Filter by blockchain"),
    min_amount: float = Query(None, ge=0, description="Minimum loss amount (USD)")
):
    """
    Get list of exploits with optional filtering

    This mock API returns 3 sample exploits for testing
    """
    exploits = SAMPLE_EXPLOITS.copy()

    # Filter by chain if specified
    if chain:
        exploits = [e for e in exploits if e['chain'].lower() == chain.lower()]

    # Filter by min_amount if specified
    if min_amount:
        exploits = [e for e in exploits if e['loss_amount_usd'] >= min_amount]

    # Apply pagination (though we only have 3 exploits)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_exploits = exploits[start_idx:end_idx]

    return {
        "data": paginated_exploits,
        "total": len(exploits),
        "page": page,
        "page_size": page_size,
        "has_more": end_idx < len(exploits)
    }

@app.get("/stats")
def get_stats():
    """Get statistics"""
    total_loss = sum(e['loss_amount_usd'] for e in SAMPLE_EXPLOITS)
    return {
        "total_exploits": len(SAMPLE_EXPLOITS),
        "total_loss_usd": total_loss,
        "affected_chains": ["Ethereum", "BSC"],
        "affected_protocols": [e['protocol'] for e in SAMPLE_EXPLOITS],
        "period_days": 1
    }

@app.get("/chains")
def get_chains():
    """Get list of chains"""
    chains = {}
    for exploit in SAMPLE_EXPLOITS:
        chain = exploit['chain']
        chains[chain] = chains.get(chain, 0) + 1

    return {
        "total_chains": len(chains),
        "chains": [{"name": k, "exploit_count": v} for k, v in chains.items()]
    }

if __name__ == "__main__":
    print("=" * 80)
    print("🚀 MOCK KAMIYO API SERVER")
    print("=" * 80)
    print()
    print("📊 Serving 3 sample exploits:")
    print(f"   • Abracadabra - $1.7M (Ethereum)")
    print(f"   • CurveDEX - $520K (Ethereum)")
    print(f"   • BridgeProtocol - $850K (BSC)")
    print()
    print("🔗 Endpoints:")
    print("   • http://localhost:8000/")
    print("   • http://localhost:8000/health")
    print("   • http://localhost:8000/exploits")
    print("   • http://localhost:8000/docs (Swagger UI)")
    print()
    print("🧪 Test commands:")
    print("   curl http://localhost:8000/health")
    print("   curl http://localhost:8000/exploits?page=1&page_size=10")
    print("   curl http://localhost:8000/exploits?chain=Ethereum")
    print("   curl http://localhost:8000/exploits?min_amount=1000000")
    print()
    print("⚙️  To use with social engine:")
    print("   export KAMIYO_API_URL=http://localhost:8000")
    print("   python social/autonomous_growth_engine.py --mode poll")
    print()
    print("=" * 80)
    print()

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
