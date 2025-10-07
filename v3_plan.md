Execute Kamiyo v2.0 Multi-VM Security Platform transformation, use git trees and multi-agent setup:

## STRATEGIC CONTEXT
The framework pivot revealed Ethereum security is oversaturated (Slither, Mythril, etc.). 
Blue Ocean opportunity: Cosmos ($5B TVL), Move/Aptos/Sui ($1.5B TVL), Cairo/StarkNet ($1.5B TVL), Substrate ($7B TVL) have ZERO specialized security tools.

## PHASE 1: COSMOS DOMINATION (Weeks 1-4)
Priority: Expand existing CosmWasm scanner to full ecosystem

1. **Add Chain Support** in `tools/cosmos_scanner.py`:
   - Osmosis ($1.2B TVL) - Add concentrated liquidity patterns
   - Neutron ($300M TVL) - Add interchain account vulnerabilities  
   - Injective ($500M TVL) - Add derivatives/DeFi patterns
   - Sei, Archway, Juno, Terra Classic
   
2. **IBC-Specific Detectors** in `discovery/specialized/cosmwasm_detector.py`:
   - Cross-chain message replay attacks
   - Packet timeout manipulation
   - Relayer vulnerabilities
   
3. **Real Protocol Testing**:
   - Test on Osmosis DEX contracts
   - Validate against known CosmWasm exploits
   - Generate vulnerability database

## PHASE 2: MOVE LANGUAGE SUPPORT (Weeks 5-8)
Create `tools/move_scanner.py` and `discovery/specialized/move_detector.py`:

1. **Core Move Vulnerabilities**:
   - Resource safety violations (Move's unique feature)
   - Global storage manipulation (`borrow_global_mut`)
   - Module visibility bypass (`public(friend)`)
   - Generics type confusion
   - Capability forgery attacks

2. **Integration**:
   - Aptos chain support ($1B TVL)
   - Sui chain support ($500M TVL)
   - Move Prover integration for validation

## PHASE 3: CAIRO/STARKNET SUPPORT (Weeks 9-12)
Create `tools/cairo_scanner.py` and `discovery/specialized/cairo_detector.py`:

1. **Cairo-Specific Patterns**:
   - Felt arithmetic overflows (252-bit fields)
   - Python hint manipulation
   - Syscall vulnerabilities
   - Storage layout bugs
   - Account abstraction exploits

2. **StarkNet Integration**:
   - Connect to StarkNet nodes
   - Parse Cairo 1.0 contracts
   - Test on dYdX, other major protocols

## PHASE 4: SUBSTRATE/INK! SUPPORT (Weeks 13-16)
Create `tools/substrate_scanner.py`:

1. **Substrate Patterns**:
   - Pallet vulnerabilities
   - Ink! smart contract bugs
   - XCM cross-chain messaging
   - Runtime upgrade risks

2. **Target Parachains**:
   - Acala, Astar, Polkadex

## IMPLEMENTATION CHANGES

### Kill (Remove/Deprecate):
```python
# In discovery/__init__.py, disable:
# - ethereum_specific_detectors
# - l2_bridge_scanners  
# - generic_evm_support