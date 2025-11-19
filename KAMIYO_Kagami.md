# **Kagami: Production Agent Identity & Development Protocol**
## Full Development Plan for Claude Sonnet 4.5 Agent Infrastructure

---

## **Executive Summary**

Build a Solana-native agent identity and reputation system that combines:
- **PDA-based agent wallets** (no private keys needed)
- **Surfpool integration** for safe testing with mainnet data
- **Claude Sonnet 4.5** as the agent intelligence layer
- **MEV protection and manifest verification** (proven in KAMIYO production)
- **Revenue generation** from day one

**Target: Working MVP in 14 days, production-ready in 30 days**

---

## **Phase 1: Foundation (Days 1-3)**

### Day 1: Project Setup & Architecture (Monorepo + Subtree Pattern)

```bash
# Set up as package within kamiyo monorepo
cd /Users/dennisgoslar/Projekter/kamiyo

# Create kagami package directory
mkdir -p kagami
cd kagami

# Initialize standalone git repo for open source
git init
git remote add origin https://github.com/kamiyo-ai/kagami.git

# Project structure (within kamiyo monorepo)
kamiyo/
├── website/           # Existing Next.js site
├── kagami/            # New: Agent framework package
│   ├── programs/      # Solana programs (Rust/Anchor)
│   │   ├── agent-identity/
│   │   └── agent-registry/
│   ├── sdk/          # TypeScript SDK
│   ├── agent/        # Claude Sonnet 4.5 agent implementation
│   ├── api/          # FastAPI backend (reusable)
│   ├── database/     # PostgreSQL schemas
│   ├── surfpool/     # Surfpool integration
│   ├── package.json  # NPM package config
│   ├── pyproject.toml # Python package config
│   ├── README.md     # Standalone docs
│   └── LICENSE       # CC BY-NC 4.0
└── .gitignore

# Add kagami as git subtree (allows open source + monorepo integration)
cd /Users/dennisgoslar/Projekter/kamiyo
git subtree add --prefix=kagami https://github.com/kamiyo-ai/kagami.git main --squash

# Setup sync automation
echo "#!/bin/bash
# Sync kagami to standalone repo
git subtree push --prefix=kagami https://github.com/kamiyo-ai/kagami.git main

# Pull updates from standalone repo
# git subtree pull --prefix=kagami https://github.com/kamiyo-ai/kagami.git main --squash
" > .github/scripts/sync-kagami.sh
chmod +x .github/scripts/sync-kagami.sh
```

**Setup commands:**
```bash
# Install Anchor
sh -c "$(curl -sSfL https://release.anchor-lang.com/stable/install)"

# Initialize Anchor project in kagami package
cd kagami
anchor init programs/agent-identity --javascript

# Install Surfpool
curl -fsSL https://surfpool.run/install.sh | sh

# Setup Python environment (for API)
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary anthropic

# Setup as npm package (for TypeScript SDK)
npm init -y
npm install @solana/web3.js @coral-xyz/anchor

# Setup as Python package
cat > pyproject.toml << EOF
[project]
name = "kagami"
version = "0.1.0"
description = "Solana agent identity and reputation framework"
license = {text = "CC BY-NC 4.0"}
authors = [{name = "KAMIYO", email = "hello@kamiyo.ai"}]
dependencies = [
    "fastapi>=0.104.0",
    "anthropic>=0.8.0",
    "solana>=0.30.0",
]
EOF
```

**Benefits of this structure:**
- ✅ Develop kagami integrated with kamiyo core
- ✅ Open source kagami as standalone package
- ✅ Import kagami in website: `import { KagamiSDK } from '../kagami/sdk'`
- ✅ Sync to standalone repo: `git subtree push --prefix=kagami origin main`
- ✅ Pull community contributions: `git subtree pull --prefix=kagami origin main`

### Day 2: Core Solana Program - Agent Identity PDA

```rust
// programs/agent-identity/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("Agent11111111111111111111111111111111111111");

#[program]
pub mod agent_identity {
    use super::*;

    pub fn create_agent(
        ctx: Context<CreateAgent>,
        agent_name: String,
        agent_type: AgentType,
        initial_stake: u64,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.owner = ctx.accounts.owner.key();
        agent.name = agent_name;
        agent.agent_type = agent_type;
        agent.reputation_score = 0;
        agent.total_transactions = 0;
        agent.stake_amount = initial_stake;
        agent.created_at = Clock::get()?.unix_timestamp;
        agent.is_active = true;
        agent.bump = ctx.bumps.agent_account;
        
        // Transfer initial stake
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.agent_account.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, initial_stake)?;
        
        emit!(AgentCreated {
            agent_pda: agent.key(),
            owner: agent.owner,
            name: agent.name.clone(),
            stake: initial_stake,
        });
        
        Ok(())
    }

    pub fn agent_action(
        ctx: Context<AgentAction>,
        action_type: ActionType,
        metadata: Vec<u8>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.total_transactions += 1;
        
        // Record action for reputation
        match action_type {
            ActionType::Payment => agent.reputation_score += 1,
            ActionType::Service => agent.reputation_score += 2,
            ActionType::Verification => agent.reputation_score += 5,
        }
        
        emit!(AgentActionRecorded {
            agent_pda: agent.key(),
            action_type,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(agent_name: String)]
pub struct CreateAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + AgentAccount::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref(), agent_name.as_bytes()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct AgentAccount {
    pub owner: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub agent_type: AgentType,
    pub reputation_score: u64,
    pub total_transactions: u64,
    pub stake_amount: u64,
    pub created_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum AgentType {
    Trading,
    Service,
    Oracle,
    Custom,
}
```

### Day 3: Database Schema (Adapt from KAMIYO Core)

```sql
-- database/migrations/001_agent_schema.sql
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pda_address VARCHAR(44) UNIQUE NOT NULL,
    owner_address VARCHAR(44) NOT NULL,
    name VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL,
    
    -- Reputation tracking
    reputation_score BIGINT DEFAULT 0,
    total_transactions BIGINT DEFAULT 0,
    successful_transactions BIGINT DEFAULT 0,
    
    -- Staking
    stake_amount BIGINT DEFAULT 0,
    stake_locked_until TIMESTAMP,
    
    -- Claude integration
    claude_api_key_encrypted TEXT,
    claude_model VARCHAR(50) DEFAULT 'claude-3-5-sonnet-20241022',
    
    -- Surfpool testing
    surfpool_dev_pda VARCHAR(44),
    last_tested_at TIMESTAMP,
    test_success_rate DECIMAL(5,2),
    
    -- Metadata
    manifest JSONB, -- Reuse KAMIYO manifest structure
    capabilities TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reuse from KAMIYO: Forward verification
CREATE TABLE forward_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_transaction VARCHAR(66) NOT NULL,
    source_agent UUID REFERENCES agents(id),
    target_agent UUID REFERENCES agents(id),
    verification_result JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent actions log
CREATE TABLE agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id),
    action_type VARCHAR(50) NOT NULL,
    transaction_signature VARCHAR(88),
    metadata JSONB,
    reputation_delta INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## **Phase 2: Claude Integration (Days 4-6)**

### Day 4: Claude Sonnet 4.5 Agent Core

```python
# agent/claude_agent.py
import os
import json
import asyncio
from typing import Dict, Any, Optional
from anthropic import Anthropic
from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey
import aiohttp

class SolanaClaudeAgent:
    def __init__(
        self,
        agent_name: str,
        agent_pda: str,
        anthropic_api_key: str,
        solana_rpc: str = "http://localhost:8899",
        surfpool_rpc: str = "http://localhost:8899"
    ):
        self.name = agent_name
        self.pda = Pubkey.from_string(agent_pda)
        self.anthropic = Anthropic(api_key=anthropic_api_key)
        self.solana_client = AsyncClient(solana_rpc)
        self.surfpool_client = AsyncClient(surfpool_rpc)
        self.memory = []  # Agent memory/context
        
    async def think(self, prompt: str, context: Dict[str, Any] = None) -> str:
        """Use Claude to process and respond to prompts"""
        
        # Build system prompt with agent identity
        system_prompt = f"""You are {self.name}, an autonomous AI agent on Solana.
        Your PDA address: {self.pda}
        Your capabilities: {context.get('capabilities', [])}
        Current reputation: {context.get('reputation_score', 0)}
        
        You can:
        1. Execute on-chain transactions through your PDA
        2. Interact with other agents and protocols
        3. Manage your reputation and stake
        4. Test strategies in Surfpool before mainnet execution
        
        Always act in accordance with your reputation and user delegations.
        """
        
        # Add recent memory/context
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add conversation history
        for memory in self.memory[-10:]:  # Last 10 interactions
            messages.append(memory)
            
        messages.append({"role": "user", "content": prompt})
        
        try:
            response = self.anthropic.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2000,
                messages=messages,
                temperature=0.7
            )
            
            # Store in memory
            self.memory.append({"role": "user", "content": prompt})
            self.memory.append({"role": "assistant", "content": response.content[0].text})
            
            return response.content[0].text
            
        except Exception as e:
            return f"Error in Claude processing: {str(e)}"
    
    async def test_strategy_surfpool(self, strategy: Dict[str, Any]) -> Dict[str, Any]:
        """Test a strategy in Surfpool before mainnet execution"""
        
        # Use Surfpool cheatcodes to bootstrap test environment
        async with aiohttp.ClientSession() as session:
            # Give ourselves test tokens
            await session.post(
                f"{self.surfpool_client.endpoint}/",
                json={
                    "jsonrpc": "2.0",
                    "method": "surfnet_setTokenAccount",
                    "params": [
                        str(self.pda),
                        "So11111111111111111111111111111111111112",  # SOL
                        {"amount": 1000000000000, "state": "initialized"}
                    ],
                    "id": 1
                }
            )
            
            # Execute strategy in test environment
            results = await self._execute_strategy(strategy, is_test=True)
            
            return {
                "success": results.get("success", False),
                "profit_loss": results.get("pnl", 0),
                "gas_used": results.get("gas", 0),
                "would_execute_mainnet": results.get("pnl", 0) > 0
            }
    
    async def execute_action(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an on-chain action through the agent's PDA"""
        
        # First, ask Claude if this action should be executed
        decision = await self.think(
            f"Should I execute this action? Action: {action}, Parameters: {params}. "
            f"Consider my reputation and current state. Respond with JSON containing "
            f"'execute': true/false and 'reasoning': your explanation."
        )
        
        try:
            decision_json = json.loads(decision)
            if not decision_json.get("execute", False):
                return {
                    "executed": False,
                    "reasoning": decision_json.get("reasoning", "Declined by agent")
                }
        except:
            pass
            
        # Test in Surfpool first if high-value
        if params.get("value", 0) > 1000000000:  # > 1 SOL
            test_result = await self.test_strategy_surfpool({
                "action": action,
                "params": params
            })
            
            if not test_result["would_execute_mainnet"]:
                return {
                    "executed": False,
                    "reasoning": "Failed Surfpool test",
                    "test_result": test_result
                }
        
        # Execute on-chain
        # This would integrate with your Anchor program
        return await self._execute_onchain(action, params)
```

### Day 5: API Layer (Adapt from KAMIYO Core)

```python
# api/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncpg
from agent.claude_agent import SolanaClaudeAgent

app = FastAPI(title="Kagami Agent API")

class AgentRegistration(BaseModel):
    name: str
    owner_address: str
    agent_type: str
    initial_stake: int
    anthropic_api_key: str

class AgentAction(BaseModel):
    agent_id: str
    action: str
    params: Dict[str, Any]
    test_first: bool = True

@app.post("/agents/register")
async def register_agent(registration: AgentRegistration):
    """Register a new agent with PDA creation"""
    
    # Create PDA on-chain
    # This would call your Anchor program
    pda_address = await create_agent_pda(
        registration.name,
        registration.owner_address,
        registration.initial_stake
    )
    
    # Store in database
    async with asyncpg.create_pool(DATABASE_URL) as pool:
        async with pool.acquire() as conn:
            agent_id = await conn.fetchval(
                """
                INSERT INTO agents (
                    pda_address, owner_address, name, agent_type,
                    stake_amount, claude_api_key_encrypted
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
                """,
                pda_address,
                registration.owner_address,
                registration.name,
                registration.agent_type,
                registration.initial_stake,
                encrypt(registration.anthropic_api_key)  # Implement encryption
            )
    
    return {
        "agent_id": agent_id,
        "pda_address": pda_address,
        "name": registration.name,
        "status": "active"
    }

@app.post("/agents/{agent_id}/think")
async def agent_think(agent_id: str, prompt: str):
    """Have an agent process a prompt using Claude"""
    
    agent = await load_agent(agent_id)
    claude_agent = SolanaClaudeAgent(
        agent["name"],
        agent["pda_address"],
        decrypt(agent["claude_api_key_encrypted"])
    )
    
    response = await claude_agent.think(prompt, {
        "reputation_score": agent["reputation_score"],
        "capabilities": agent["capabilities"]
    })
    
    return {"response": response}

@app.post("/agents/{agent_id}/execute")
async def execute_agent_action(agent_id: str, action: AgentAction):
    """Execute an action through an agent"""
    
    agent = await load_agent(agent_id)
    claude_agent = SolanaClaudeAgent(
        agent["name"],
        agent["pda_address"],
        decrypt(agent["claude_api_key_encrypted"])
    )
    
    # Test in Surfpool if requested
    if action.test_first:
        test_result = await claude_agent.test_strategy_surfpool({
            "action": action.action,
            "params": action.params
        })
        
        if not test_result["would_execute_mainnet"]:
            return {
                "executed": False,
                "reason": "Failed test",
                "test_result": test_result
            }
    
    # Execute action
    result = await claude_agent.execute_action(
        action.action,
        action.params
    )
    
    # Update reputation based on success
    if result.get("executed", False):
        await update_reputation(agent_id, 1)
    
    return result

# Reuse KAMIYO's manifest verification
@app.post("/agents/{agent_id}/verify-forward")
async def verify_forward(
    agent_id: str,
    root_tx: str,
    target_agent: str
):
    """Verify forward safety using KAMIYO's proven algorithm"""
    # Implement using KAMIYO's forward verification logic
    pass
```

### Day 6: Surfpool Integration & Testing Framework

```typescript
// surfpool/agent-testing.ts
import { PublicKey, Connection } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

export class AgentTestEnvironment {
    private surfpoolRpc: string;
    private connection: Connection;
    
    constructor(surfpoolRpc: string = "http://localhost:8899") {
        this.surfpoolRpc = surfpoolRpc;
        this.connection = new Connection(surfpoolRpc);
    }
    
    async bootstrapAgent(
        agentPda: PublicKey,
        initialSol: number = 10,
        tokens: Map<string, number> = new Map()
    ) {
        // Use Surfpool cheatcodes to setup test environment
        
        // Give SOL
        await this.setSolBalance(agentPda, initialSol);
        
        // Setup token accounts
        for (const [mint, amount] of tokens) {
            await this.setTokenBalance(agentPda, mint, amount);
        }
        
        return {
            pda: agentPda,
            balances: await this.getBalances(agentPda)
        };
    }
    
    async timeTravel(slot: number) {
        // Use Surfpool's time travel feature
        const response = await fetch(this.surfpoolRpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "surfnet_setSlot",
                params: [slot],
                id: 1
            })
        });
        
        return response.json();
    }
    
    async testStrategy(
        agentPda: PublicKey,
        strategy: any,
        historicalSlot?: number
    ) {
        // Travel to historical slot if specified
        if (historicalSlot) {
            await this.timeTravel(historicalSlot);
        }
        
        // Execute strategy
        const results = await strategy.execute(this.connection, agentPda);
        
        // Analyze results
        return {
            profitable: results.pnl > 0,
            pnl: results.pnl,
            gasUsed: results.gasUsed,
            transactions: results.transactions,
            wouldExecuteMainnet: results.pnl > results.gasUsed * 2
        };
    }
}
```

---

## **Phase 3: Production Features (Days 7-10)**

### Day 7: Reputation System

```rust
// programs/agent-registry/src/reputation.rs
pub fn update_reputation(
    ctx: Context<UpdateReputation>,
    action_type: ActionType,
    success: bool,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent_account;
    
    // Calculate reputation delta
    let delta = match (action_type, success) {
        (ActionType::Payment, true) => 5,
        (ActionType::Payment, false) => -10,
        (ActionType::Service, true) => 10,
        (ActionType::Service, false) => -5,
        (ActionType::Verification, true) => 20,
        (ActionType::Verification, false) => -30,
    };
    
    // Update reputation with bounds
    agent.reputation_score = (agent.reputation_score as i64 + delta)
        .max(0) as u64;
    
    // Emit event
    emit!(ReputationUpdated {
        agent_pda: agent.key(),
        old_score: agent.reputation_score - delta.abs() as u64,
        new_score: agent.reputation_score,
        action_type,
        success,
    });
    
    Ok(())
}

// Time-decay reputation
pub fn apply_reputation_decay(
    ctx: Context<ApplyDecay>,
) -> Result<()> {
    let agent = &mut ctx.accounts.agent_account;
    let current_time = Clock::get()?.unix_timestamp;
    let days_inactive = (current_time - agent.last_action) / 86400;
    
    if days_inactive > 7 {
        let decay = (days_inactive - 7) as u64 * 2;
        agent.reputation_score = agent.reputation_score.saturating_sub(decay);
    }
    
    Ok(())
}
```

### Day 8: MEV Protection (Adapt from KAMIYO Core)

```python
# api/mev_protection.py
from typing import Dict, Any, List
import asyncio
import hashlib

class MEVProtection:
    """MEV protection using KAMIYO's proven manifest verification"""

    def __init__(self, max_recursion_depth: int = 5):
        self.max_recursion_depth = max_recursion_depth
        self.forward_cache = {}  # Cache verified forwards

    async def verify_forward_safety(
        self,
        root_tx: str,
        source_agent: str,
        target_agent: str,
        current_depth: int = 0
    ) -> Dict[str, Any]:
        """Verify forward is safe from MEV attacks"""
        
        if current_depth > self.max_recursion_depth:
            return {
                "safe": False,
                "reason": "Max recursion depth exceeded",
                "depth": current_depth
            }
        
        # Check for circular dependencies
        cache_key = f"{root_tx}:{source_agent}:{target_agent}"
        if cache_key in self.forward_cache:
            return {
                "safe": False,
                "reason": "Circular dependency detected",
                "loop": cache_key
            }
        
        self.forward_cache[cache_key] = True
        
        # Verify manifests (from Kagami)
        source_manifest = await self.get_agent_manifest(source_agent)
        target_manifest = await self.get_agent_manifest(target_agent)
        
        # Check capabilities match
        if not self._verify_capability_match(source_manifest, target_manifest):
            return {
                "safe": False,
                "reason": "Capability mismatch"
            }
        
        # Check for sandwich attack patterns
        if await self._detect_sandwich_pattern(root_tx, source_agent, target_agent):
            return {
                "safe": False,
                "reason": "Potential sandwich attack detected"
            }
        
        return {
            "safe": True,
            "depth": current_depth,
            "verified_at": asyncio.get_event_loop().time()
        }
    
    def _verify_capability_match(
        self,
        source: Dict[str, Any],
        target: Dict[str, Any]
    ) -> bool:
        """Verify agent capabilities are compatible"""
        
        required_caps = source.get("required_target_capabilities", [])
        target_caps = target.get("capabilities", [])
        
        return all(cap in target_caps for cap in required_caps)
    
    async def _detect_sandwich_pattern(
        self,
        root_tx: str,
        source: str,
        target: str
    ) -> bool:
        """Detect potential sandwich attacks"""
        
        # Check if target has pending transactions that could sandwich
        # This would query on-chain data
        return False  # Simplified for now
```

### Day 9: SDK Development

```typescript
// sdk/kagami-sdk.ts
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import axios from 'axios';

export class KagamiSDK {
    private connection: Connection;
    private apiUrl: string;
    private program: anchor.Program;
    
    constructor(
        rpcUrl: string,
        apiUrl: string,
        programId: PublicKey
    ) {
        this.connection = new Connection(rpcUrl);
        this.apiUrl = apiUrl;
        // Initialize Anchor program
    }
    
    async createAgent(
        name: string,
        type: 'Trading' | 'Service' | 'Oracle' | 'Custom',
        initialStake: number,
        anthropicApiKey: string
    ): Promise<Agent> {
        // Create PDA
        const [agentPda, bump] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("agent"),
                this.wallet.publicKey.toBuffer(),
                Buffer.from(name)
            ],
            this.program.programId
        );
        
        // Create on-chain account
        const tx = await this.program.methods
            .createAgent(name, type, new anchor.BN(initialStake))
            .accounts({
                agentAccount: agentPda,
                owner: this.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId
            })
            .rpc();
        
        // Register with API
        const response = await axios.post(`${this.apiUrl}/agents/register`, {
            name,
            owner_address: this.wallet.publicKey.toString(),
            agent_type: type,
            initial_stake: initialStake,
            anthropic_api_key: anthropicApiKey
        });
        
        return {
            id: response.data.agent_id,
            pda: agentPda,
            name,
            type,
            reputation: 0
        };
    }
    
    async testAgentStrategy(
        agentId: string,
        strategy: Strategy
    ): Promise<TestResult> {
        // Test in Surfpool
        const response = await axios.post(
            `${this.apiUrl}/agents/${agentId}/test`,
            {
                strategy: strategy.toJSON(),
                use_surfpool: true
            }
        );
        
        return response.data;
    }
    
    async executeAgentAction(
        agentId: string,
        action: string,
        params: any,
        testFirst: boolean = true
    ): Promise<ExecutionResult> {
        const response = await axios.post(
            `${this.apiUrl}/agents/${agentId}/execute`,
            {
                action,
                params,
                test_first: testFirst
            }
        );
        
        return response.data;
    }
    
    async queryAgentReputation(
        agentPda: PublicKey
    ): Promise<number> {
        const agentAccount = await this.program.account.agentAccount.fetch(agentPda);
        return agentAccount.reputationScore.toNumber();
    }
}
```

### Day 10: Monitoring & Analytics

```python
# monitoring/agent_monitor.py
import asyncio
from datetime import datetime, timedelta
import pandas as pd
from typing import List, Dict, Any

class AgentMonitor:
    def __init__(self, db_pool, solana_client):
        self.db = db_pool
        self.solana = solana_client
        
    async def calculate_agent_metrics(self, agent_id: str) -> Dict[str, Any]:
        """Calculate comprehensive agent metrics"""
        
        async with self.db.acquire() as conn:
            # Get agent data
            agent = await conn.fetchrow(
                "SELECT * FROM agents WHERE id = $1",
                agent_id
            )
            
            # Get action history
            actions = await conn.fetch(
                """
                SELECT action_type, created_at, reputation_delta
                FROM agent_actions
                WHERE agent_id = $1
                ORDER BY created_at DESC
                LIMIT 1000
                """,
                agent_id
            )
            
        # Calculate metrics
        df = pd.DataFrame(actions)
        
        metrics = {
            "agent_id": agent_id,
            "total_actions": len(actions),
            "reputation_score": agent["reputation_score"],
            "success_rate": self._calculate_success_rate(df),
            "avg_daily_actions": self._calculate_daily_average(df),
            "reputation_trend": self._calculate_reputation_trend(df),
            "risk_score": self._calculate_risk_score(agent, df),
            "profitability": await self._calculate_profitability(agent["pda_address"])
        }
        
        return metrics
    
    def _calculate_success_rate(self, df: pd.DataFrame) -> float:
        if df.empty:
            return 0.0
        positive = df[df['reputation_delta'] > 0]
        return len(positive) / len(df) * 100
    
    def _calculate_risk_score(
        self,
        agent: Dict,
        df: pd.DataFrame
    ) -> float:
        """Calculate agent risk score (0-100)"""
        
        factors = []
        
        # Factor 1: Reputation volatility
        if not df.empty:
            rep_std = df['reputation_delta'].std()
            factors.append(min(rep_std / 10, 10))
        
        # Factor 2: Stake ratio
        if agent['stake_amount'] > 0:
            stake_factor = min(1000000000 / agent['stake_amount'], 10)
            factors.append(stake_factor)
        
        # Factor 3: Age
        age_days = (datetime.now() - agent['created_at']).days
        age_factor = max(0, 10 - age_days / 10)
        factors.append(age_factor)
        
        return sum(factors) / len(factors) * 10 if factors else 50
```

---

## **Phase 4: Integration & Testing (Days 11-13)**

### Day 11: Integration Tests

```python
# tests/test_integration.py
import pytest
import asyncio
from agent.claude_agent import SolanaClaudeAgent
from surfpool.agent_testing import AgentTestEnvironment

@pytest.mark.asyncio
async def test_agent_lifecycle():
    """Test complete agent lifecycle"""
    
    # 1. Create agent
    agent = await create_test_agent("TestAgent", "Trading")
    assert agent.pda is not None
    
    # 2. Bootstrap in Surfpool
    test_env = AgentTestEnvironment()
    await test_env.bootstrapAgent(agent.pda, 10, {"USDC": 1000})
    
    # 3. Test strategy
    strategy = TradingStrategy(
        buy_token="SOL",
        sell_token="USDC",
        amount=100
    )
    
    result = await agent.test_strategy_surfpool(strategy.to_dict())
    assert result["success"] == True
    
    # 4. Execute if profitable
    if result["would_execute_mainnet"]:
        execution = await agent.execute_action("trade", strategy.params)
        assert execution["executed"] == True
    
    # 5. Verify reputation update
    new_reputation = await get_agent_reputation(agent.pda)
    assert new_reputation > 0

@pytest.mark.asyncio
async def test_mev_protection():
    """Test MEV protection mechanisms"""
    
    protection = MEVProtection()
    
    # Test circular dependency detection
    result = await protection.verify_forward_safety(
        "0xabc...",
        "agent1",
        "agent2"
    )
    assert result["safe"] == True
    
    # Try to create circular reference
    result2 = await protection.verify_forward_safety(
        "0xabc...",
        "agent2",
        "agent1"
    )
    assert result2["safe"] == False
    assert "Circular" in result2["reason"]

@pytest.mark.asyncio
async def test_time_travel_validation():
    """Test historical strategy validation"""
    
    test_env = AgentTestEnvironment()
    agent = await create_test_agent("HistoryAgent", "Trading")
    
    # Travel to historical slot
    historical_slot = 260000000  # Some past slot
    await test_env.timeTravel(historical_slot)
    
    # Test strategy at that point in time
    result = await agent.test_strategy_surfpool({
        "action": "arbitrage",
        "params": {"pool": "RAY-SOL"}
    })
    
    # Verify we can validate historical performance
    assert "pnl" in result
```

### Day 12: CLI Tool

```python
#!/usr/bin/env python3
# cli/kagami-cli.py

import click
import asyncio
import json
from sdk.client import KagamiClient

@click.group()
def cli():
    """Kagami Agent CLI"""
    pass

@cli.command()
@click.option('--name', prompt='Agent name', help='Name for your agent')
@click.option('--type', type=click.Choice(['Trading', 'Service', 'Oracle']),
              default='Trading', help='Agent type')
@click.option('--stake', type=int, default=1000000000,
              help='Initial stake in lamports')
@click.option('--api-key', envvar='ANTHROPIC_API_KEY',
              help='Anthropic API key')
def create(name, type, stake, api_key):
    """Create a new agent"""
    
    async def _create():
        client = KagamiClient()
        agent = await client.create_agent(
            name=name,
            agent_type=type,
            initial_stake=stake,
            anthropic_api_key=api_key
        )
        
        click.echo(f"✅ Agent created!")
        click.echo(f"ID: {agent['id']}")
        click.echo(f"PDA: {agent['pda_address']}")
        click.echo(f"Name: {agent['name']}")
    
    asyncio.run(_create())

@cli.command()
@click.argument('agent_id')
@click.option('--strategy', type=click.File('r'),
              help='Strategy JSON file')
@click.option('--historical-slot', type=int,
              help='Test at historical slot')
def test(agent_id, strategy, historical_slot):
    """Test agent strategy in Surfpool"""
    
    async def _test():
        client = KagamiClient()

        strategy_data = json.load(strategy) if strategy else {
            "action": "trade",
            "params": {"amount": 100}
        }
        
        result = await client.test_strategy(
            agent_id=agent_id,
            strategy=strategy_data,
            historical_slot=historical_slot
        )
        
        if result['profitable']:
            click.echo(f"✅ Strategy profitable! PnL: {result['pnl']}")
        else:
            click.echo(f"❌ Strategy unprofitable. PnL: {result['pnl']}")
        
        click.echo(json.dumps(result, indent=2))
    
    asyncio.run(_test())

@cli.command()
@click.argument('agent_id')
@click.argument('prompt')
def think(agent_id, prompt):
    """Have agent think about something"""
    
    async def _think():
        client = KagamiClient()
        response = await client.agent_think(agent_id, prompt)
        click.echo(f"\n{response['response']}\n")
    
    asyncio.run(_think())

if __name__ == '__main__':
    cli()
```

### Day 13: Documentation & Examples

```markdown
# Kagami - Quick Start

## Installation

```bash
# Install dependencies
npm install @kamiyo/kagami
pip install kagami

# Start Surfpool for testing
surfpool start

# Deploy programs
anchor deploy --provider.cluster devnet
```

## Create Your First Agent

```typescript
import { KagamiSDK } from '@kamiyo/kagami';

const sdk = new KagamiSDK(
    'https://api.devnet.solana.com',
    'https://api.kamiyo.ai'
);

// Create an agent
const agent = await sdk.createAgent({
    name: 'MyTradingBot',
    type: 'Trading',
    initialStake: 1_000_000_000, // 1 SOL
    anthropicApiKey: process.env.ANTHROPIC_KEY
});

// Test a strategy
const testResult = await sdk.testAgentStrategy(
    agent.id,
    {
        action: 'swap',
        params: {
            from: 'SOL',
            to: 'USDC',
            amount: 100
        }
    }
);

if (testResult.profitable) {
    // Execute on mainnet
    const result = await sdk.executeAgentAction(
        agent.id,
        'swap',
        testResult.params
    );
}
```

## Agent Capabilities

- **Autonomous Decision Making**: Claude Sonnet 4.5 powered reasoning
- **Safe Testing**: Surfpool integration for risk-free strategy testing
- **Time Travel**: Validate strategies against historical data
- **MEV Protection**: Built-in protections against sandwich attacks
- **Reputation System**: On-chain reputation tracking
```

---

## **Phase 5: Launch & Monetization (Day 14)**

### Day 14: Deployment & Revenue Model

```yaml
# deployment/production.yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: kamiyo
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./database/migrations:/docker-entrypoint-initdb.d
  
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres/kamiyo
      SOLANA_RPC: ${SOLANA_RPC}
      SURFPOOL_RPC: ${SURFPOOL_RPC}
    depends_on:
      - postgres
  
  monitoring:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

### Revenue Implementation

```solidity
// Revenue model contract
contract RevenueModel {
    uint256 public constant VERIFICATION_FEE = 0.5 ether; // 0.5 SOL
    uint256 public constant API_TIER_BASIC = 0;
    uint256 public constant API_TIER_PRO = 99 * 10**9; // $99/month in lamports
    uint256 public constant TRANSACTION_FEE_BPS = 10; // 0.1%
    
    mapping(address => uint256) public agentTiers;
    mapping(address => uint256) public monthlyRevenue;
    
    function verifyAgent(address agent) external payable {
        require(msg.value >= VERIFICATION_FEE, "Insufficient fee");
        // Verification logic
        agentTiers[agent] = 1;
    }
    
    function upgradeToPro(address agent) external payable {
        require(msg.value >= API_TIER_PRO, "Insufficient payment");
        agentTiers[agent] = 2;
        monthlyRevenue[address(this)] += msg.value;
    }
}
```

---

## **Execution Timeline**

### Week 1 (Days 1-7)
- ✅ Core Solana program
- ✅ Database schema
- ✅ Claude integration
- ✅ Basic API
- ✅ Surfpool setup

### Week 2 (Days 8-14)
- ✅ Reputation system
- ✅ MEV protection
- ✅ SDK development
- ✅ Testing suite
- ✅ CLI tool
- ✅ Documentation
- ✅ Deployment

## **Expected Outcomes**

### Technical Metrics
- 50ms average response time
- 99.9% uptime
- Support for 1000+ concurrent agents
- < $0.01 per agent action

### Business Metrics (Month 1)
- 100 registered agents
- 50 verified agents ($50 revenue)
- 10 Pro subscriptions ($990/month)
- $2000 total revenue

### Competitive Advantages
1. **First to market** with Surfpool integration
2. **Claude Sonnet 4.5** for superior reasoning
3. **Time-travel testing** unique feature
4. **Native Solana** approach vs. ported Ethereum standards
5. **Immediate revenue** model vs. token speculation

## **Next Steps**

1. **Deploy to Devnet** (Day 15)
2. **Launch on Product Hunt** (Day 20)
3. **Partner with Solana protocols** (Day 25)
4. **Integrate with Jupiter, Drift, etc.** (Day 30)
5. **Launch token if 1000+ agents** (Month 3)

**Kagami Architecture:**
- **Kagami** = Open-source agent framework package (git subtree synced to https://github.com/kamiyo-ai/kagami)
- **KAMIYO Core** = Production platform that uses Kagami + proprietary infrastructure
- **Development Pattern** = Build in monorepo, sync to standalone repo for open source, import in KAMIYO

This plan builds Kagami as a reusable package that leverages KAMIYO's proven MEV protection and manifest verification while creating a completely Solana-native solution that's immediately usable and revenue-generating.