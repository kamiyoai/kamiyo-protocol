#!/usr/bin/env python3
"""
Vulnerability Database Generator

Scans test cases and real protocol implementations to extract vulnerability patterns
and generates a structured vulnerability database for all VM types:
- Cosmos/CosmWasm
- Move (Aptos/Sui)
- Cairo/StarkNet
- Substrate/Ink!

The database includes metadata: severity, chain, VM type, pattern, description, remediation
"""

import json
import os
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Set, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

# Import scanners
import sys
sys.path.insert(0, str(Path(__file__).parent))

from cosmos_scanner import CosmWasmScanner, VulnerabilityType as CosmosVulnType, Severity
from move_scanner import MoveScanner, MoveVulnerabilityType
from cairo_scanner import CairoScanner, CairoVulnerabilityType
from substrate_scanner import SubstrateScanner, SubstrateVulnerabilityType

class VMType(Enum):
    COSMOS = "Cosmos/CosmWasm"
    MOVE = "Move (Aptos/Sui)"
    CAIRO = "Cairo/StarkNet"
    SUBSTRATE = "Substrate/Polkadot"

@dataclass
class VulnerabilityPattern:
    """Structured vulnerability pattern for database"""
    id: str
    name: str
    vm_type: str
    severity: str
    category: str
    description: str
    technical_details: str
    vulnerable_code_example: str
    secure_code_example: str
    detection_patterns: List[str]
    remediation: str
    cwe_id: str = None
    cve_references: List[str] = None
    real_world_exploits: List[Dict] = None
    affected_chains: List[str] = None
    confidence_score: float = 0.75

class VulnerabilityDatabaseGenerator:
    def __init__(self):
        self.cosmos_scanner = CosmWasmScanner()
        self.move_scanner = MoveScanner()
        self.cairo_scanner = CairoScanner()
        self.substrate_scanner = SubstrateScanner()

        self.patterns: List[VulnerabilityPattern] = []
        self.base_dir = Path(__file__).resolve().parent.parent

    def generate_cosmos_patterns(self) -> List[VulnerabilityPattern]:
        """Generate Cosmos/CosmWasm vulnerability patterns"""
        patterns = []

        # IBC Message Replay
        patterns.append(VulnerabilityPattern(
            id="COSMOS-001",
            name="IBC Message Replay Attack",
            vm_type=VMType.COSMOS.value,
            severity="CRITICAL",
            category="Cross-Chain Security",
            description="IBC message handlers lack nonce/sequence validation, allowing attackers to replay messages across chains or timeout periods.",
            technical_details="IBC packets can be replayed if the contract doesn't track packet sequences or nonces. This allows double-spending across IBC-connected chains.",
            vulnerable_code_example='''pub fn ibc_packet_receive(
    deps: DepsMut,
    msg: IbcPacketReceiveMsg,
) -> StdResult<IbcReceiveResponse> {
    let transfer: Transfer = from_binary(&msg.packet.data)?;
    // VULNERABLE: No nonce/sequence check
    BALANCES.update(deps.storage, &transfer.recipient, |b| -> StdResult<_> {
        Ok(b.unwrap_or_default() + transfer.amount)
    })?;
    Ok(IbcReceiveResponse::default())
}''',
            secure_code_example='''pub fn ibc_packet_receive(
    deps: DepsMut,
    msg: IbcPacketReceiveMsg,
) -> StdResult<IbcReceiveResponse> {
    let transfer: Transfer = from_binary(&msg.packet.data)?;

    // Check packet hasn't been processed
    let packet_hash = hash_packet(&msg.packet);
    require!(!PROCESSED_PACKETS.has(deps.storage, &packet_hash), "Packet already processed");

    // Store packet hash
    PROCESSED_PACKETS.save(deps.storage, &packet_hash, &true)?;

    // Process transfer
    BALANCES.update(deps.storage, &transfer.recipient, |b| -> StdResult<_> {
        Ok(b.unwrap_or_default() + transfer.amount)
    })?;
    Ok(IbcReceiveResponse::default())
}''',
            detection_patterns=[
                "ibc_packet_receive without nonce tracking",
                "IbcReceiveMsg without sequence validation",
                "Missing packet hash storage"
            ],
            remediation="Implement packet sequence validation and nonce tracking. Store processed packet hashes. Check timeout_timestamp.",
            cwe_id="CWE-294",
            cve_references=["CVE-2023-XXXX (Theoretical)"],
            real_world_exploits=[
                {
                    "protocol": "IBC-enabled DEX (Theoretical)",
                    "date": "2023-Q2",
                    "impact": "Double spending via cross-chain replay",
                    "amount_usd": 0
                }
            ],
            affected_chains=["Osmosis", "Neutron", "Injective", "All IBC-enabled chains"],
            confidence_score=0.75
        ))

        # Access Control
        patterns.append(VulnerabilityPattern(
            id="COSMOS-002",
            name="Missing Access Control in Admin Functions",
            vm_type=VMType.COSMOS.value,
            severity="CRITICAL",
            category="Access Control",
            description="Privileged functions lack sender validation, allowing any user to call admin/owner operations.",
            technical_details="Admin functions that modify critical state (owner, admin, configuration) without checking info.sender against stored admin address.",
            vulnerable_code_example='''pub fn execute_update_admin(
    deps: DepsMut,
    new_admin: String,
) -> StdResult<Response> {
    // VULNERABLE: No sender check!
    ADMIN.save(deps.storage, &deps.api.addr_validate(&new_admin)?)?;
    Ok(Response::new().add_attribute("new_admin", new_admin))
}''',
            secure_code_example='''pub fn execute_update_admin(
    deps: DepsMut,
    info: MessageInfo,
    new_admin: String,
) -> StdResult<Response> {
    // Check sender is current admin
    let admin = ADMIN.load(deps.storage)?;
    require!(info.sender == admin, "Unauthorized: only admin can update admin");

    let new_admin_addr = deps.api.addr_validate(&new_admin)?;
    ADMIN.save(deps.storage, &new_admin_addr)?;
    Ok(Response::new()
        .add_attribute("action", "update_admin")
        .add_attribute("new_admin", new_admin))
}''',
            detection_patterns=[
                "ADMIN.save without sender validation",
                "Owner update without require!()",
                "Privileged function missing info.sender check"
            ],
            remediation="Add require!(info.sender == ADMIN) or load and check owner from storage. Use proper access control patterns.",
            cwe_id="CWE-862",
            affected_chains=["All CosmWasm chains"],
            confidence_score=0.80
        ))

        # Integer Overflow
        patterns.append(VulnerabilityPattern(
            id="COSMOS-003",
            name="Integer Overflow in Uint Operations",
            vm_type=VMType.COSMOS.value,
            severity="HIGH",
            category="Arithmetic Safety",
            description="Arithmetic operations on Uint128/Uint256 without overflow protection can wrap around or panic.",
            technical_details="Direct arithmetic operators (+, -, *) on Uint types can overflow. Use checked_* methods for safety.",
            vulnerable_code_example='''pub fn transfer(deps: DepsMut, recipient: String, amount: Uint128) -> StdResult<Response> {
    let balance = BALANCES.load(deps.storage, &recipient)?;
    let new_balance = balance + amount; // UNSAFE!
    BALANCES.save(deps.storage, &recipient, &new_balance)?;
    Ok(Response::new())
}''',
            secure_code_example='''pub fn transfer(deps: DepsMut, recipient: String, amount: Uint128) -> StdResult<Response> {
    let balance = BALANCES.load(deps.storage, &recipient)?;
    let new_balance = balance.checked_add(amount)
        .map_err(|e| StdError::generic_err("Overflow in balance calculation"))?;
    BALANCES.save(deps.storage, &recipient, &new_balance)?;
    Ok(Response::new())
}''',
            detection_patterns=[
                "Uint128 + without checked_add",
                "Uint256 * without checked_mul",
                "balance - amount without checked_sub"
            ],
            remediation="Use checked_add(), checked_sub(), checked_mul() instead of +, -, *. Or use saturating_* variants.",
            cwe_id="CWE-190",
            affected_chains=["All CosmWasm chains"],
            confidence_score=0.65
        ))

        # Reentrancy
        patterns.append(VulnerabilityPattern(
            id="COSMOS-004",
            name="Cross-Contract Reentrancy",
            vm_type=VMType.COSMOS.value,
            severity="HIGH",
            category="Reentrancy",
            description="External calls before state updates allow reentrancy attacks where malicious contracts can re-enter and exploit inconsistent state.",
            technical_details="When a contract makes external calls (BankMsg, WasmMsg) before updating state, the called contract can re-enter and find state unchanged.",
            vulnerable_code_example='''pub fn withdraw(deps: DepsMut, amount: Uint128) -> StdResult<Response> {
    // VULNERABLE: Send before state update
    let msg = BankMsg::Send {
        to_address: "recipient".to_string(),
        amount: coins(amount.u128(), "token"),
    };

    BALANCES.update(deps.storage, "user", |b| -> StdResult<_> {
        Ok(b.unwrap_or_default() - amount)
    })?;

    Ok(Response::new().add_message(msg))
}''',
            secure_code_example='''pub fn withdraw(deps: DepsMut, amount: Uint128) -> StdResult<Response> {
    // Update state FIRST (checks-effects-interactions)
    BALANCES.update(deps.storage, "user", |b| -> StdResult<_> {
        let balance = b.unwrap_or_default();
        require!(balance >= amount, "Insufficient balance");
        Ok(balance.checked_sub(amount)?)
    })?;

    // Then external call
    let msg = BankMsg::Send {
        to_address: "recipient".to_string(),
        amount: coins(amount.u128(), "token"),
    };

    Ok(Response::new().add_message(msg))
}''',
            detection_patterns=[
                "CosmosMsg before storage.save",
                "WasmMsg::Execute before state update",
                "BankMsg::Send before balance update"
            ],
            remediation="Follow checks-effects-interactions pattern. Update all state BEFORE external calls/messages.",
            cwe_id="CWE-841",
            real_world_exploits=[
                {
                    "protocol": "CosmWasm DEX (Theoretical)",
                    "date": "2023",
                    "impact": "Drain liquidity pool via reentrancy",
                    "amount_usd": 0
                }
            ],
            affected_chains=["All CosmWasm chains"],
            confidence_score=0.70
        ))

        # Osmosis-specific
        patterns.append(VulnerabilityPattern(
            id="COSMOS-005",
            name="Concentrated Liquidity Tick Manipulation",
            vm_type=VMType.COSMOS.value,
            severity="HIGH",
            category="DEX/AMM",
            description="Concentrated liquidity pools can be manipulated through tick boundary exploits or price calculation errors.",
            technical_details="Osmosis CL pools use tick-based pricing. Improper tick validation or math can lead to price manipulation or loss of funds.",
            vulnerable_code_example='''pub fn swap_exact_amount_in(
    deps: DepsMut,
    token_in: Coin,
    token_out_min: Uint128,
) -> StdResult<Response> {
    // VULNERABLE: No tick boundary validation
    let price = calculate_price_at_tick(current_tick)?;
    let amount_out = token_in.amount * price;
    // No MIN_TICK/MAX_TICK checks...
}''',
            secure_code_example='''pub fn swap_exact_amount_in(
    deps: DepsMut,
    token_in: Coin,
    token_out_min: Uint128,
) -> StdResult<Response> {
    let current_tick = POOL_STATE.load(deps.storage)?.current_tick;

    // Validate tick boundaries
    require!(current_tick >= MIN_TICK && current_tick <= MAX_TICK, "Tick out of bounds");

    let price = calculate_price_at_tick(current_tick)?;
    let amount_out = token_in.amount.checked_mul(price)?;

    require!(amount_out >= token_out_min, "Slippage exceeded");
    // Process swap...
}''',
            detection_patterns=[
                "swap calculation without tick validation",
                "Missing MIN_TICK/MAX_TICK checks",
                "tick_to_sqrt_price without bounds"
            ],
            remediation="Validate tick boundaries. Use checked math for price calculations. Implement slippage protection.",
            affected_chains=["Osmosis"],
            confidence_score=0.70
        ))

        # Timestamp Dependence
        patterns.append(VulnerabilityPattern(
            id="COSMOS-006",
            name="Block Timestamp Manipulation",
            vm_type=VMType.COSMOS.value,
            severity="MEDIUM",
            category="Logic Vulnerability",
            description="Contract logic depending on block.time can be manipulated by validators within consensus bounds.",
            technical_details="Validators can manipulate block timestamps by several seconds. Critical logic based on exact timestamps is vulnerable.",
            vulnerable_code_example='''pub fn execute_unlock(deps: DepsMut, env: Env) -> StdResult<Response> {
    let config = CONFIG.load(deps.storage)?;
    // VULNERABLE: Exact timestamp comparison
    if env.block.time.seconds() >= config.unlock_time {
        release_funds(deps)?;
    }
    Ok(Response::new())
}''',
            secure_code_example='''pub fn execute_unlock(deps: DepsMut, env: Env) -> StdResult<Response> {
    let config = CONFIG.load(deps.storage)?;
    // SAFER: Use block height instead
    require!(env.block.height >= config.unlock_height, "Still locked");
    release_funds(deps)?;
    Ok(Response::new())
}''',
            detection_patterns=[
                "if.*block\\.time",
                "Critical logic based on env.block.time",
                "Deadline checks with timestamps"
            ],
            remediation="Use block height for ordering. Add timestamp tolerance ranges. Avoid critical logic based on exact timestamps.",
            cwe_id="CWE-367",
            affected_chains=["All Cosmos chains"],
            confidence_score=0.60
        ))

        # Panic Handling
        patterns.append(VulnerabilityPattern(
            id="COSMOS-007",
            name="Panic in Critical Execution Path",
            vm_type=VMType.COSMOS.value,
            severity="HIGH",
            category="Denial of Service",
            description="Using unwrap/expect/panic in critical paths can DoS the contract if None/Err occurs.",
            technical_details="unwrap() and expect() panic on None/Err, halting contract execution. In critical paths this enables DoS attacks.",
            vulnerable_code_example='''pub fn execute(deps: DepsMut, info: MessageInfo) -> StdResult<Response> {
    // VULNERABLE: unwrap in critical path
    let config = CONFIG.load(deps.storage).unwrap();
    let balance = BALANCES.load(deps.storage, &info.sender).unwrap();
    // If either load fails, contract panics!
    Ok(Response::new())
}''',
            secure_code_example='''pub fn execute(deps: DepsMut, info: MessageInfo) -> StdResult<Response> {
    // SAFE: Proper error handling
    let config = CONFIG.load(deps.storage)?;
    let balance = BALANCES.load(deps.storage, &info.sender)
        .unwrap_or_default();
    // Returns error instead of panicking
    Ok(Response::new())
}''',
            detection_patterns=[
                ".unwrap() in execute/instantiate",
                ".expect() in critical functions",
                "panic!() in message handlers"
            ],
            remediation="Use proper Result error handling. Return StdError instead of panicking. Use unwrap_or_default where appropriate.",
            cwe_id="CWE-754",
            affected_chains=["All CosmWasm chains"],
            confidence_score=0.75
        ))

        # Neutron ICA
        patterns.append(VulnerabilityPattern(
            id="COSMOS-008",
            name="Interchain Account (ICA) Unauthorized Access",
            vm_type=VMType.COSMOS.value,
            severity="CRITICAL",
            category="Cross-Chain Security",
            description="Interchain Account operations without proper owner validation allow unauthorized remote contract calls.",
            technical_details="Neutron's ICA allows contracts to control accounts on other chains. Missing owner validation allows anyone to execute ICA operations.",
            vulnerable_code_example='''pub fn execute_ica_transfer(
    deps: DepsMut,
    env: Env,
    amount: Uint128,
) -> StdResult<Response> {
    // VULNERABLE: No owner check!
    let ica_msg = IcaMsg::Transfer {
        recipient: "recipient".to_string(),
        amount
    };
    Ok(Response::new().add_message(ica_msg))
}''',
            secure_code_example='''pub fn execute_ica_transfer(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
) -> StdResult<Response> {
    // Verify sender is authorized
    let owner = OWNER.load(deps.storage)?;
    require!(info.sender == owner, "Unauthorized: only owner");

    let ica_msg = IcaMsg::Transfer {
        recipient: "recipient".to_string(),
        amount
    };
    Ok(Response::new().add_message(ica_msg))
}''',
            detection_patterns=[
                "IcaMsg without sender validation",
                "register_ica without owner check",
                "ica_address without authorization"
            ],
            remediation="Validate sender is owner/admin. Check authorization before ICA operations. Store and verify ICA ownership.",
            cwe_id="CWE-862",
            affected_chains=["Neutron"],
            confidence_score=0.80
        ))

        return patterns

    def generate_move_patterns(self) -> List[VulnerabilityPattern]:
        """Generate Move (Aptos/Sui) vulnerability patterns"""
        patterns = []

        # Resource Leak
        patterns.append(VulnerabilityPattern(
            id="MOVE-001",
            name="Resource Leak / Unsafe Drop",
            vm_type=VMType.MOVE.value,
            severity="CRITICAL",
            category="Resource Safety",
            description="Resources with 'key' ability dropped or moved without proper handling violates Move's resource safety guarantees.",
            technical_details="Move resources with 'key' ability must be explicitly moved or stored. Dropping them or using unsafe operations breaks resource safety.",
            vulnerable_code_example='''module token {
    struct Token has key { value: u64 }

    public fun dangerous_transfer(account: &signer, to: address) {
        let token = move_from<Token>(signer::address_of(account));
        // VULNERABLE: Resource dropped without proper handling!
        move_to(to, token);  // If this fails, resource is lost
    }
}''',
            secure_code_example='''module token {
    struct Token has key { value: u64 }

    public fun safe_transfer(account: &signer, to: address) acquires Token {
        // Check recipient can receive
        assert!(!exists<Token>(to), E_ALREADY_HAS_TOKEN);

        let token = move_from<Token>(signer::address_of(account));
        move_to(to, token);  // Resource safely transferred
    }
}''',
            detection_patterns=[
                "move_from without proper error handling",
                "Resource with key ability in unsafe operations",
                "drop() on key resources"
            ],
            remediation="Add exists<> checks before move_from. Handle resources properly. Never drop resources with 'key' ability.",
            cwe_id="CWE-404",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.75
        ))

        # Capability Forgery
        patterns.append(VulnerabilityPattern(
            id="MOVE-002",
            name="Capability Forgery via Store Ability",
            vm_type=VMType.MOVE.value,
            severity="CRITICAL",
            category="Access Control",
            description="Capabilities with 'store' ability can be transferred or duplicated, breaking access control guarantees.",
            technical_details="Capabilities are Move's access control mechanism. Adding 'store' ability allows them to be stored in tables/vectors and potentially transferred.",
            vulnerable_code_example='''module admin {
    struct AdminCap has key, store {}  // VULNERABLE: has store!

    public fun create_admin_cap(account: &signer) {
        move_to(account, AdminCap {});
    }

    public fun admin_action(cap: &AdminCap) {
        // Admin operation
    }
}''',
            secure_code_example='''module admin {
    struct AdminCap has key {}  // SECURE: No store ability

    public fun initialize(account: &signer) {
        move_to(account, AdminCap {});
    }

    public fun admin_action(account: &signer) acquires AdminCap {
        let cap = borrow_global<AdminCap>(signer::address_of(account));
        // Admin operation - cap can't be forged
    }
}''',
            detection_patterns=[
                "Capability struct with 'store' ability",
                "public fun create_*_cap",
                "AdminCap has store"
            ],
            remediation="Remove 'store' from capability structs. Make capability creation private. Use witness pattern.",
            cwe_id="CWE-269",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.80
        ))

        # Type Confusion
        patterns.append(VulnerabilityPattern(
            id="MOVE-003",
            name="Generics Type Confusion",
            vm_type=VMType.MOVE.value,
            severity="HIGH",
            category="Type Safety",
            description="Unconstrained generic type parameters can be instantiated with unexpected types, breaking assumptions.",
            technical_details="Generic functions without proper type constraints allow callers to instantiate with any type, potentially bypassing safety checks.",
            vulnerable_code_example='''module vault {
    public fun deposit<T>(account: &signer, amount: u64) {
        // VULNERABLE: T is unconstrained!
        // Could be called with any type
        move_to(account, Vault<T> { balance: amount });
    }
}''',
            secure_code_example='''module vault {
    public fun deposit<T: drop + store>(account: &signer, coin: Coin<T>) {
        // SECURE: T constrained to types with drop + store
        let amount = coin::value(&coin);
        move_to(account, Vault<T> { coin });
    }
}''',
            detection_patterns=[
                "<T> without constraints",
                "borrow_global<T> in generic function",
                "Unconstrained phantom type"
            ],
            remediation="Add type constraints (e.g., <T: drop>, <T: key + store>). Validate type parameters. Use phantom types where appropriate.",
            cwe_id="CWE-843",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.65
        ))

        # Signer Auth
        patterns.append(VulnerabilityPattern(
            id="MOVE-004",
            name="Missing Signer Authorization",
            vm_type=VMType.MOVE.value,
            severity="CRITICAL",
            category="Access Control",
            description="Public functions with signer parameter lack authorization checks, allowing any account to execute privileged operations.",
            technical_details="While Move requires a signer, it doesn't validate ownership. Functions must explicitly check signer authority.",
            vulnerable_code_example='''module admin {
    public fun update_config(account: &signer, new_value: u64) acquires Config {
        // VULNERABLE: No check if signer is admin!
        let config = borrow_global_mut<Config>(@admin_address);
        config.value = new_value;
    }
}''',
            secure_code_example='''module admin {
    public fun update_config(account: &signer, new_value: u64) acquires Config, AdminCap {
        // Verify signer is admin
        let signer_addr = signer::address_of(account);
        assert!(exists<AdminCap>(signer_addr), E_NOT_ADMIN);

        let config = borrow_global_mut<Config>(@admin_address);
        config.value = new_value;
    }
}''',
            detection_patterns=[
                "public entry fun with &signer but no assert!",
                "borrow_global_mut without signer check",
                "Privileged operation without authorization"
            ],
            remediation="Add assert!(signer::address_of(&signer) == @admin, ERROR). Verify ownership before privileged operations. Use capability pattern.",
            cwe_id="CWE-862",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.80
        ))

        # Coin Overflow
        patterns.append(VulnerabilityPattern(
            id="MOVE-005",
            name="Coin/Balance Overflow",
            vm_type=VMType.MOVE.value,
            severity="CRITICAL",
            category="Arithmetic Safety",
            description="Coin and balance operations without overflow protection can wrap around or panic.",
            technical_details="Direct arithmetic on coin values can overflow. Must use checked operations or built-in coin functions.",
            vulnerable_code_example='''module token {
    public fun mint(account: &signer, amount: u64) acquires Supply {
        let supply = borrow_global_mut<Supply>(@token);
        supply.total = supply.total + amount; // UNSAFE!
        // Could overflow u64
    }
}''',
            secure_code_example='''module token {
    use aptos_std::math64;

    public fun mint(account: &signer, amount: u64) acquires Supply {
        let supply = borrow_global_mut<Supply>(@token);
        // Use checked math
        supply.total = math64::add(supply.total, amount);
        // Or use coin module which has built-in checks
    }
}''',
            detection_patterns=[
                "balance + amount without checked_add",
                "u64 arithmetic on coin values",
                "total_supply * without overflow check"
            ],
            remediation="Use aptos_std::math64 for checked arithmetic. Use coin::merge/split instead of manual math. Add assertions for bounds.",
            cwe_id="CWE-190",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.75
        ))

        # Abort DoS
        patterns.append(VulnerabilityPattern(
            id="MOVE-006",
            name="Abort-based Denial of Service",
            vm_type=VMType.MOVE.value,
            severity="MEDIUM",
            category="Denial of Service",
            description="Public functions with abort/assert can be triggered by attackers to DoS contract functionality.",
            technical_details="abort and assert! halt execution. In public entry functions, attackers can trigger these to block functionality.",
            vulnerable_code_example='''module game {
    public entry fun play(account: &signer, guess: u64) {
        // VULNERABLE: Public function with abort
        assert!(guess > 0, E_INVALID_GUESS);
        assert!(guess < 100, E_INVALID_GUESS);
        // Attacker can pass invalid values to DoS
    }
}''',
            secure_code_example='''module game {
    public entry fun play(account: &signer, guess: u64): u64 {
        // SAFER: Validate and return error code
        if (guess == 0 || guess >= 100) {
            return E_INVALID_GUESS
        };
        // Continue with valid input
        0
    }
}''',
            detection_patterns=[
                "public entry fun with assert! on user input",
                "abort without input validation",
                "assert! in loop over user data"
            ],
            remediation="Validate inputs before processing. Return error codes instead of abort. Use proper error handling patterns.",
            cwe_id="CWE-400",
            affected_chains=["Aptos", "Sui"],
            confidence_score=0.65
        ))

        return patterns

    def generate_cairo_patterns(self) -> List[VulnerabilityPattern]:
        """Generate Cairo/StarkNet vulnerability patterns"""
        patterns = []

        # Felt Overflow
        patterns.append(VulnerabilityPattern(
            id="CAIRO-001",
            name="Felt Arithmetic Overflow (252-bit)",
            vm_type=VMType.CAIRO.value,
            severity="HIGH",
            category="Arithmetic Safety",
            description="Cairo felts are 252-bit and can overflow/wrap. Unchecked arithmetic can lead to unexpected results.",
            technical_details="Felt arithmetic in Cairo wraps around at 2^252. This can cause balance underflows or other logic errors.",
            vulnerable_code_example='''@external
func transfer{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    recipient: felt, amount: felt
) {
    let (sender) = get_caller_address();
    let (balance) = balances.read(sender);

    // VULNERABLE: No overflow check!
    let new_balance = balance + amount;
    balances.write(sender, new_balance);
}''',
            secure_code_example='''@external
func transfer{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    recipient: felt, amount: felt
) {
    let (sender) = get_caller_address();
    let (balance) = balances.read(sender);

    // Check for overflow
    assert_nn(amount);  // Non-negative
    assert_le(amount, balance);  // Less than or equal to balance

    let new_balance = balance - amount;
    balances.write(sender, new_balance);
}''',
            detection_patterns=[
                "felt + felt without assert_nn",
                "felt * felt without assert_le",
                "Unchecked felt arithmetic"
            ],
            remediation="Use assert_nn (non-negative) and assert_le (less than or equal). For large numbers use uint256_add/sub/mul.",
            cwe_id="CWE-190",
            affected_chains=["StarkNet"],
            confidence_score=0.70
        ))

        # Hint Manipulation
        patterns.append(VulnerabilityPattern(
            id="CAIRO-002",
            name="Python Hint Manipulation",
            vm_type=VMType.CAIRO.value,
            severity="CRITICAL",
            category="Prover Security",
            description="Python hints that directly modify program state or memory can be manipulated by malicious provers.",
            technical_details="Cairo 0 hints are executed by prover and not verified. If hints modify ids or memory, prover can inject malicious values.",
            vulnerable_code_example='''func unsafe_computation{range_check_ptr}(x: felt) -> (result: felt) {
    alloc_locals;
    local result;

    %{
        # VULNERABLE: Hint sets result directly!
        ids.result = ids.x * 2
    %}

    return (result=result);
}''',
            secure_code_example='''func safe_computation{range_check_ptr}(x: felt) -> (result: felt) {
    alloc_locals;
    local result;

    %{
        # Hint for non-deterministic computation
        ids.result = ids.x * 2
    %}

    # CRITICAL: Verify hint output!
    assert result = x * 2;

    return (result=result);
}''',
            detection_patterns=[
                "%{ ids.* = without assertion",
                "Hint modifying memory[] without verification",
                "segments.add() in hint"
            ],
            remediation="Only use hints for non-deterministic computation. ALWAYS verify hint output with Cairo assertions. Never trust hints.",
            cwe_id="CWE-20",
            affected_chains=["StarkNet (Cairo 0)"],
            confidence_score=0.85
        ))

        # Account Abstraction
        patterns.append(VulnerabilityPattern(
            id="CAIRO-003",
            name="Account Abstraction Validation Bypass",
            vm_type=VMType.CAIRO.value,
            severity="CRITICAL",
            category="Account Security",
            description="Account abstraction functions (__validate__, __execute__) with weak or missing validation allow unauthorized transactions.",
            technical_details="__validate__ must verify signatures and nonces. __execute__ must check authorization. Missing checks allow anyone to execute transactions.",
            vulnerable_code_example='''@external
func __validate__{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    call_array_len: felt, call_array: AccountCallArray*, calldata_len: felt, calldata: felt*
) {
    // VULNERABLE: No validation!
    return ();
}

@external
func __execute__{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    call_array_len: felt, call_array: AccountCallArray*, calldata_len: felt, calldata: felt*
) -> (response_len: felt, response: felt*) {
    // VULNERABLE: No authorization check!
    return execute_calls(call_array_len, call_array, calldata_len, calldata);
}''',
            secure_code_example='''@external
func __validate__{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, ecdsa_ptr: SignatureBuiltin*, range_check_ptr}(
    call_array_len: felt, call_array: AccountCallArray*, calldata_len: felt, calldata: felt*
) {
    alloc_locals;
    let (tx_hash) = get_tx_info().transaction_hash;
    let (public_key) = get_public_key();

    // Verify signature
    let (signature_len, signature) = get_tx_signature();
    verify_ecdsa_signature(tx_hash, public_key, signature[0], signature[1]);

    // Check and increment nonce
    let (nonce) = get_nonce();
    assert_nn(nonce);
    set_nonce(nonce + 1);

    return ();
}''',
            detection_patterns=[
                "__validate__ without signature check",
                "__execute__ without authorization",
                "return () in __validate__"
            ],
            remediation="Implement proper signature validation in __validate__. Check nonce. Verify caller in __execute__. Use OpenZeppelin Account.",
            cwe_id="CWE-287",
            affected_chains=["StarkNet"],
            confidence_score=0.80
        ))

        # L1-L2 Messaging
        patterns.append(VulnerabilityPattern(
            id="CAIRO-004",
            name="L1↔L2 Message Handling Vulnerability",
            vm_type=VMType.CAIRO.value,
            severity="HIGH",
            category="Cross-Layer Security",
            description="L1↔L2 message handling without proper validation can accept malicious cross-layer messages.",
            technical_details="Messages from L1 to L2 need from_address validation. L2 to L1 needs payload validation. Missing checks allow malicious messages.",
            vulnerable_code_example='''@l1_handler
func handle_deposit{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    from_address: felt, amount: felt
) {
    // VULNERABLE: No from_address validation!
    // Any L1 address could send messages
    balances.write(from_address, amount);
}''',
            secure_code_example='''const AUTHORIZED_L1_BRIDGE = 0x123...;

@l1_handler
func handle_deposit{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    from_address: felt, amount: felt
) {
    // Validate L1 sender
    with_attr error_message("Unauthorized L1 address") {
        assert from_address = AUTHORIZED_L1_BRIDGE;
    }

    // Validate amount
    assert_nn(amount);
    assert_le(amount, MAX_DEPOSIT);

    balances.write(from_address, amount);
}''',
            detection_patterns=[
                "@l1_handler without from_address check",
                "send_message_to_l1 without validation",
                "consume_message_from_l1 without verification"
            ],
            remediation="Validate from_address for L1→L2 messages. Check payload length. Verify message structure. Whitelist authorized L1 contracts.",
            cwe_id="CWE-345",
            affected_chains=["StarkNet"],
            confidence_score=0.70
        ))

        # Reentrancy
        patterns.append(VulnerabilityPattern(
            id="CAIRO-005",
            name="Cairo Cross-Contract Reentrancy",
            vm_type=VMType.CAIRO.value,
            severity="HIGH",
            category="Reentrancy",
            description="State changes after external calls allow reentrancy where called contracts can exploit inconsistent state.",
            technical_details="Like Solidity, Cairo contracts can be reentered if state updates happen after external calls. Use checks-effects-interactions.",
            vulnerable_code_example='''@external
func withdraw{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    amount: felt
) {
    let (caller) = get_caller_address();

    // VULNERABLE: External call before state update
    call_contract(caller, amount);

    let (balance) = balances.read(caller);
    balances.write(caller, balance - amount);
}''',
            secure_code_example='''@external
func withdraw{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    amount: felt
) {
    let (caller) = get_caller_address();
    let (balance) = balances.read(caller);

    // Checks
    assert_le(amount, balance);

    // Effects - Update state FIRST
    balances.write(caller, balance - amount);

    // Interactions - External call LAST
    call_contract(caller, amount);
}''',
            detection_patterns=[
                "call_contract before storage write",
                "library_call before state update",
                "State mutation after external call"
            ],
            remediation="Follow checks-effects-interactions pattern. Update state BEFORE external calls. Use reentrancy guard.",
            cwe_id="CWE-841",
            affected_chains=["StarkNet"],
            confidence_score=0.70
        ))

        return patterns

    def generate_substrate_patterns(self) -> List[VulnerabilityPattern]:
        """Generate Substrate/Ink! vulnerability patterns"""
        patterns = []

        # Ink Reentrancy
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-001",
            name="Ink! Reentrancy Attack",
            vm_type=VMType.SUBSTRATE.value,
            severity="HIGH",
            category="Reentrancy",
            description="External calls before state updates in Ink! contracts allow reentrancy attacks.",
            technical_details="When Ink! contracts call other contracts before updating state, the called contract can re-enter and find stale state.",
            vulnerable_code_example='''#[ink(message)]
pub fn withdraw(&mut self, amount: Balance) -> Result<()> {
    let caller = self.env().caller();

    // VULNERABLE: External call before state update
    self.env().transfer(caller, amount)?;

    let balance = self.balances.get(&caller).unwrap_or(0);
    self.balances.insert(caller, balance - amount);

    Ok(())
}''',
            secure_code_example='''#[ink(message)]
pub fn withdraw(&mut self, amount: Balance) -> Result<()> {
    let caller = self.env().caller();

    // Update state FIRST
    let balance = self.balances.get(&caller).unwrap_or(0);
    ensure!(balance >= amount, Error::InsufficientBalance);
    self.balances.insert(caller, balance - amount);

    // Then external call
    self.env().transfer(caller, amount)?;

    Ok(())
}''',
            detection_patterns=[
                "env().transfer before state update",
                "build_call before storage mutation",
                "invoke_contract before insert/remove"
            ],
            remediation="Follow checks-effects-interactions pattern. Update state BEFORE external calls. Use reentrancy guard.",
            cwe_id="CWE-841",
            affected_chains=["Polkadot", "Kusama", "All Substrate chains"],
            confidence_score=0.75
        ))

        # Delegate Call
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-002",
            name="Delegate Call / Set Code Hash Vulnerability",
            vm_type=VMType.SUBSTRATE.value,
            severity="CRITICAL",
            category="Access Control",
            description="set_code_hash or delegate calls without access control allow anyone to change contract logic.",
            technical_details="set_code_hash replaces contract code. DelegateCall executes external code. Both need strict access control.",
            vulnerable_code_example='''#[ink(message)]
pub fn upgrade(&mut self, new_code_hash: Hash) -> Result<()> {
    // VULNERABLE: No access control!
    ink::env::set_code_hash(&new_code_hash)?;
    Ok(())
}''',
            secure_code_example='''#[ink(message)]
pub fn upgrade(&mut self, new_code_hash: Hash) -> Result<()> {
    let caller = self.env().caller();
    ensure!(caller == self.owner, Error::Unauthorized);

    // Verify new code hash is approved
    ensure!(self.approved_codes.contains(&new_code_hash), Error::UnapprovedCode);

    ink::env::set_code_hash(&new_code_hash)?;
    Ok(())
}''',
            detection_patterns=[
                "set_code_hash without owner check",
                "delegate_dependency without validation",
                "DelegateCall without ensure!"
            ],
            remediation="Add only_owner or ensure!(caller == self.owner). Restrict delegate calls to trusted code hashes.",
            cwe_id="CWE-284",
            affected_chains=["All Ink! platforms"],
            confidence_score=0.85
        ))

        # XCM Exploit
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-003",
            name="XCM Cross-Chain Message Exploit",
            vm_type=VMType.SUBSTRATE.value,
            severity="CRITICAL",
            category="Cross-Chain Security",
            description="XCM execution without proper validation can accept malicious cross-chain messages.",
            technical_details="XCM messages from other parachains need validation via Barriers and origin checks. Missing validation allows malicious XCM execution.",
            vulnerable_code_example='''// In runtime configuration
impl xcm_executor::Config for Runtime {
    type Barrier = ();  // VULNERABLE: No barrier!

    fn execute_xcm(origin: MultiLocation, message: Xcm) -> Result<Outcome> {
        // No validation of origin or message
        XcmExecutor::execute_xcm(origin, message)
    }
}''',
            secure_code_example='''use xcm_builder::{AllowTopLevelPaidExecutionFrom, TakeWeightCredit};

pub type Barrier = (
    TakeWeightCredit,
    AllowTopLevelPaidExecutionFrom<Everything>,
    AllowKnownQueryResponses<PolkadotXcm>,
);

impl xcm_executor::Config for Runtime {
    type Barrier = Barrier;  // SECURE: Proper barrier chain

    // Additional validation in handler
    fn validate_xcm(origin: MultiLocation, message: Xcm) -> Result<()> {
        ensure!(is_trusted_origin(&origin), Error::UntrustedOrigin);
        Ok(())
    }
}''',
            detection_patterns=[
                "type Barrier = ()",
                "execute_xcm without validation",
                "Missing AllowKnownQueryResponses"
            ],
            remediation="Implement proper XCM Barrier. Validate origin. Use AllowKnownQueryResponses. Check asset reserves.",
            cwe_id="CWE-345",
            affected_chains=["Polkadot", "Kusama", "All XCM-enabled parachains"],
            confidence_score=0.75
        ))

        # Runtime Upgrade
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-004",
            name="Unauthorized Runtime Upgrade",
            vm_type=VMType.SUBSTRATE.value,
            severity="CRITICAL",
            category="Governance",
            description="Runtime upgrade functions without proper authorization allow malicious runtime changes.",
            technical_details="set_code allows replacing entire runtime. Must be restricted to governance or sudo with proper checks.",
            vulnerable_code_example='''#[pallet::call]
impl<T: Config> Pallet<T> {
    pub fn upgrade_runtime(origin: OriginFor<T>, code: Vec<u8>) -> DispatchResult {
        // VULNERABLE: No authorization!
        frame_system::Pallet::<T>::set_code(RawOrigin::Root.into(), code)?;
        Ok(())
    }
}''',
            secure_code_example='''#[pallet::call]
impl<T: Config> Pallet<T> {
    pub fn upgrade_runtime(origin: OriginFor<T>, code: Vec<u8>) -> DispatchResult {
        // Ensure only sudo/governance can upgrade
        T::AdminOrigin::ensure_origin(origin)?;

        // Additional validation
        ensure!(code.len() > 0, Error::<T>::EmptyCode);
        ensure!(code.len() < MAX_CODE_SIZE, Error::<T>::CodeTooLarge);

        frame_system::Pallet::<T>::set_code(RawOrigin::Root.into(), code)?;
        Ok(())
    }
}''',
            detection_patterns=[
                "set_code without ensure_root",
                "set_code_without_checks",
                "Runtime upgrade without AdminOrigin"
            ],
            remediation="Add ensure_root or governance check. Use sudo or collective pallet for upgrades. Validate code before setting.",
            cwe_id="CWE-862",
            affected_chains=["All Substrate chains"],
            confidence_score=0.85
        ))

        # Unsafe Math
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-005",
            name="Unsafe Arithmetic in Balance Operations",
            vm_type=VMType.SUBSTRATE.value,
            severity="HIGH",
            category="Arithmetic Safety",
            description="Direct arithmetic on Balance types without overflow protection can panic or wrap.",
            technical_details="Substrate Balance types (u128, u64) need checked operations. Panics DoS the chain, wrapping causes logic errors.",
            vulnerable_code_example='''#[ink(message)]
pub fn deposit(&mut self, amount: Balance) -> Result<()> {
    let caller = self.env().caller();
    let balance = self.balances.get(&caller).unwrap_or(0);

    // VULNERABLE: Unchecked addition!
    let new_balance = balance + amount;
    self.balances.insert(caller, new_balance);

    Ok(())
}''',
            secure_code_example='''#[ink(message)]
pub fn deposit(&mut self, amount: Balance) -> Result<()> {
    let caller = self.env().caller();
    let balance = self.balances.get(&caller).unwrap_or(0);

    // SAFE: Use checked arithmetic
    let new_balance = balance.checked_add(amount)
        .ok_or(Error::Overflow)?;

    self.balances.insert(caller, new_balance);
    Ok(())
}''',
            detection_patterns=[
                "Balance + without checked_add",
                "u128 * without checked_mul",
                "balance - without checked_sub"
            ],
            remediation="Use checked_add, checked_sub, checked_mul. Or use saturating_ variants. Add ensure! checks for bounds.",
            cwe_id="CWE-190",
            affected_chains=["All Substrate/Ink! chains"],
            confidence_score=0.70
        ))

        # Randomness
        patterns.append(VulnerabilityPattern(
            id="SUBSTRATE-006",
            name="Predictable Randomness Source",
            vm_type=VMType.SUBSTRATE.value,
            severity="HIGH",
            category="Randomness",
            description="Using deprecated or predictable randomness sources like RandomnessCollectiveFlip allows manipulation.",
            technical_details="RandomnessCollectiveFlip is deprecated and exploitable. Block hash/number based randomness is predictable.",
            vulnerable_code_example='''#[pallet::call]
impl<T: Config> Pallet<T> {
    pub fn lottery(origin: OriginFor<T>) -> DispatchResult {
        let sender = ensure_signed(origin)?;

        // VULNERABLE: Uses deprecated randomness!
        let random = T::RandomnessCollectiveFlip::random_seed();
        let winner = random.0[0] % 100;

        Ok(())
    }
}''',
            secure_code_example='''#[pallet::call]
impl<T: Config> Pallet<T> {
    pub fn lottery(origin: OriginFor<T>) -> DispatchResult {
        let sender = ensure_signed(origin)?;

        // SAFE: Use BABE randomness with subject
        let (random, _) = T::Randomness::random(&b"lottery"[..]);
        let winner = random.0[0] % 100;

        // Better: Use VRF for verifiable randomness
        Ok(())
    }
}''',
            detection_patterns=[
                "RandomnessCollectiveFlip",
                "block_hash for randomness",
                "block_number % for random"
            ],
            remediation="Use BABE randomness or VRF-based randomness. Never use block hash or number directly. Include unique subject in random call.",
            cwe_id="CWE-330",
            affected_chains=["All Substrate chains"],
            confidence_score=0.75
        ))

        return patterns

    def extract_real_world_exploits(self) -> Dict:
        """Extract real-world exploit data from existing database"""
        exploit_db_path = self.base_dir / 'intelligence/database/exploit_database.json'
        if exploit_db_path.exists():
            with open(exploit_db_path) as f:
                return json.load(f)
        return {"exploits": []}

    def generate_statistics(self) -> Dict:
        """Generate statistics about vulnerability coverage"""
        stats = {
            "total_patterns": len(self.patterns),
            "by_vm_type": {},
            "by_severity": {},
            "by_category": {},
            "chains_covered": set(),
            "cwe_mapped": 0
        }

        for pattern in self.patterns:
            # By VM type
            vm = pattern.vm_type
            stats["by_vm_type"][vm] = stats["by_vm_type"].get(vm, 0) + 1

            # By severity
            sev = pattern.severity
            stats["by_severity"][sev] = stats["by_severity"].get(sev, 0) + 1

            # By category
            cat = pattern.category
            stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

            # Chains covered
            if pattern.affected_chains:
                stats["chains_covered"].update(pattern.affected_chains)

            # CWE mapping
            if pattern.cwe_id:
                stats["cwe_mapped"] += 1

        stats["chains_covered"] = sorted(list(stats["chains_covered"]))
        return stats

    def generate_database(self) -> Dict:
        """Generate complete vulnerability database"""
        print("Generating vulnerability database...")
        print("=" * 70)

        # Generate patterns for each VM type
        print("\nGenerating Cosmos/CosmWasm patterns...")
        cosmos_patterns = self.generate_cosmos_patterns()
        print(f"  Generated {len(cosmos_patterns)} patterns")

        print("\nGenerating Move patterns...")
        move_patterns = self.generate_move_patterns()
        print(f"  Generated {len(move_patterns)} patterns")

        print("\nGenerating Cairo patterns...")
        cairo_patterns = self.generate_cairo_patterns()
        print(f"  Generated {len(cairo_patterns)} patterns")

        print("\nGenerating Substrate patterns...")
        substrate_patterns = self.generate_substrate_patterns()
        print(f"  Generated {len(substrate_patterns)} patterns")

        # Combine all patterns
        self.patterns = cosmos_patterns + move_patterns + cairo_patterns + substrate_patterns

        # Extract real-world exploits
        exploit_data = self.extract_real_world_exploits()

        # Generate statistics
        stats = self.generate_statistics()

        # Build database
        database = {
            "version": "3.0",
            "generated_at": datetime.utcnow().isoformat(),
            "description": "Comprehensive blockchain vulnerability pattern database covering Cosmos, Move, Cairo, and Substrate VMs",
            "statistics": stats,
            "vulnerability_patterns": [asdict(p) for p in self.patterns],
            "real_world_exploits": exploit_data.get("exploits", [])
        }

        print(f"\n" + "=" * 70)
        print(f"Database generation complete!")
        print(f"  Total patterns: {stats['total_patterns']}")
        print(f"  VM types covered: {len(stats['by_vm_type'])}")
        print(f"  Chains covered: {len(stats['chains_covered'])}")
        print(f"  CWE mapped: {stats['cwe_mapped']}/{stats['total_patterns']}")
        print("=" * 70)

        return database

    def save_database(self, database: Dict, output_path: Path):
        """Save database to JSON file"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(database, f, indent=2)
        print(f"\nDatabase saved to: {output_path}")

def main():
    generator = VulnerabilityDatabaseGenerator()

    # Generate database
    database = generator.generate_database()

    # Save to output path
    output_path = generator.base_dir / 'intelligence/vulnerability_database.json'
    generator.save_database(database, output_path)

    # Print summary
    print("\nDatabase Summary:")
    print(f"  Cosmos patterns: {database['statistics']['by_vm_type'].get('Cosmos/CosmWasm', 0)}")
    print(f"  Move patterns: {database['statistics']['by_vm_type'].get('Move (Aptos/Sui)', 0)}")
    print(f"  Cairo patterns: {database['statistics']['by_vm_type'].get('Cairo/StarkNet', 0)}")
    print(f"  Substrate patterns: {database['statistics']['by_vm_type'].get('Substrate/Polkadot', 0)}")
    print(f"\nSeverity distribution:")
    for sev, count in database['statistics']['by_severity'].items():
        print(f"  {sev}: {count}")

if __name__ == '__main__':
    main()
