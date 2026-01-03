# Mitama Mainnet Deployment Runbook

## Deployment Status

**Mainnet: Live**

| Component | Address |
|-----------|---------|
| Program | `8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM` |
| Protocol Config | `E6VhYjktLpT91VJy7bt5VL7DhTurZZKZUEFEgxLdZHna` |
| Oracle Registry | `2sUcFA5kaxq5akJFw7UzAUizfvZsr72FVpeKWmYc5yuf` |

---

## Pre-Deployment Checklist

### 1. Code Verification
- [ ] All tests pass: `anchor test`
- [ ] Build succeeds: `anchor build`
- [ ] IDL generated: `target/idl/mitama.json`
- [ ] No critical warnings in build output

### 2. Multi-Sig Setup
Mitama uses 2-of-3 multi-sig for protocol management. Prepare three distinct keypairs:

```bash
# Generate keypairs (store securely!)
solana-keygen new -o authority-1.json
solana-keygen new -o authority-2.json
solana-keygen new -o authority-3.json

# Get public keys
solana-keygen pubkey authority-1.json  # PRIMARY
solana-keygen pubkey authority-2.json  # SECONDARY
solana-keygen pubkey authority-3.json  # TERTIARY
```

**Security Requirements:**
- Store each keypair on separate hardware wallets or secure locations
- Different team members should control different keys
- Never store all three keys in the same location
- Document key holders and recovery procedures

### 3. RPC Configuration
```bash
# Set mainnet RPC
solana config set --url https://api.mainnet-beta.solana.com

# Verify configuration
solana config get
```

### 4. Funding
```bash
# Fund deployer wallet (need ~5 SOL for deployment + rent)
solana balance

# Fund multi-sig authority wallets (need ~0.01 SOL each for tx fees)
solana transfer <AUTHORITY_1_PUBKEY> 0.1
solana transfer <AUTHORITY_2_PUBKEY> 0.1
solana transfer <AUTHORITY_3_PUBKEY> 0.1
```

---

## Deployment Steps

### Step 1: Deploy Program
```bash
# Ensure correct keypair
export ANCHOR_WALLET=./mitama-keypair.json

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Verify deployment
solana program show 8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
```

Expected output:
```
Program Id: 8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: <PDA>
Authority: <DEPLOYER_PUBKEY>
Last Deployed Slot: <SLOT>
Data Length: <SIZE>
```

### Step 2: Initialize Protocol Config
```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Mitama } from '../target/types/mitama';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const primaryAuthority = Keypair.fromSecretKey(/* authority-1.json */);
const secondarySigner = new PublicKey('SECONDARY_PUBKEY');
const tertiarySigner = new PublicKey('TERTIARY_PUBKEY');

const provider = new AnchorProvider(connection, primaryAuthority, {});
const program = new Program<Mitama>(IDL, PROGRAM_ID, provider);

// Initialize protocol with 2-of-3 multi-sig
await program.methods
  .initializeProtocol(secondarySigner, tertiarySigner)
  .accounts({
    protocolConfig: protocolConfigPDA,
    authority: primaryAuthority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([primaryAuthority])
  .rpc();
```

### Step 3: Initialize Oracle Registry
```typescript
await program.methods
  .initializeOracleRegistry(
    2,  // min_consensus (2 oracles required)
    15  // max_score_deviation
  )
  .accounts({
    oracleRegistry: oracleRegistryPDA,
    admin: primaryAuthority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([primaryAuthority])
  .rpc();
```

### Step 4: Add Oracles
```typescript
// Add each oracle to the registry
const oracles = [
  { pubkey: ORACLE_1_PUBKEY, weight: 100 },
  { pubkey: ORACLE_2_PUBKEY, weight: 100 },
  { pubkey: ORACLE_3_PUBKEY, weight: 100 },
];

for (const oracle of oracles) {
  await program.methods
    .addOracle(
      oracle.pubkey,
      { ed25519: {} },  // OracleType
      oracle.weight
    )
    .accounts({
      oracleRegistry: oracleRegistryPDA,
      admin: primaryAuthority.publicKey,
    })
    .signers([primaryAuthority])
    .rpc();
}
```

### Step 5: Verify Deployment
```typescript
// Fetch and verify protocol config
const config = await program.account.protocolConfig.fetch(protocolConfigPDA);
console.log('Protocol Config:', {
  authority: config.authority.toBase58(),
  secondarySigner: config.secondarySigner.toBase58(),
  tertiarySigner: config.tertiarySigner.toBase58(),
  paused: config.paused,
  version: config.version,
});

// Fetch and verify oracle registry
const registry = await program.account.oracleRegistry.fetch(oracleRegistryPDA);
console.log('Oracle Registry:', {
  admin: registry.admin.toBase58(),
  oracleCount: registry.oracles.length,
  minConsensus: registry.minConsensus,
});
```

---

## Post-Deployment Verification

### 1. Account Verification
```bash
# Verify protocol config PDA
solana account <PROTOCOL_CONFIG_PDA> --output json

# Verify oracle registry PDA
solana account <ORACLE_REGISTRY_PDA> --output json
```

### 2. Functional Testing (Devnet First!)
Before mainnet, test the full flow on devnet:

1. Create agent identity
2. Initialize escrow
3. Mark dispute
4. Submit oracle scores
5. Finalize multi-oracle dispute
6. Verify fund distribution

### 3. Emergency Procedures Test
Test pause/unpause with 2-of-3 multi-sig:

```typescript
// Requires two signers
await program.methods
  .pauseProtocol()
  .accounts({
    protocolConfig: protocolConfigPDA,
    signerOne: authority1.publicKey,
    signerTwo: authority2.publicKey,
  })
  .signers([authority1, authority2])
  .rpc();
```

---

## PDA Derivation Reference

```typescript
// Protocol Config PDA
const [protocolConfigPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('protocol_config')],
  PROGRAM_ID
);

// Oracle Registry PDA
const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('oracle_registry')],
  PROGRAM_ID
);

// Agent PDA
const [agentPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('agent'), ownerPubkey.toBuffer()],
  PROGRAM_ID
);

// Escrow PDA
const [escrowPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('escrow'), agentPubkey.toBuffer(), Buffer.from(transactionId)],
  PROGRAM_ID
);

// Reputation PDA
const [reputationPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('reputation'), entityPubkey.toBuffer()],
  PROGRAM_ID
);
```

---

## Emergency Procedures

### Pause Protocol (Emergency)
Requires 2-of-3 multi-sig signers to be online:

```typescript
// Coordinate with two key holders
await program.methods
  .pauseProtocol()
  .accounts({
    protocolConfig: protocolConfigPDA,
    signerOne: signer1.publicKey,
    signerTwo: signer2.publicKey,
  })
  .signers([signer1, signer2])
  .rpc();
```

### Unpause Protocol
```typescript
await program.methods
  .unpauseProtocol()
  .accounts({
    protocolConfig: protocolConfigPDA,
    signerOne: signer1.publicKey,
    signerTwo: signer2.publicKey,
  })
  .signers([signer1, signer2])
  .rpc();
```

### Replace Compromised Signer
If one multi-sig key is compromised, the other two can replace it:

```typescript
await program.methods
  .transferProtocolAuthority(
    compromisedSignerPubkey,  // signer to replace
    newSignerPubkey           // new signer
  )
  .accounts({
    protocolConfig: protocolConfigPDA,
    signerOne: signer1.publicKey,
    signerTwo: signer2.publicKey,
  })
  .signers([signer1, signer2])
  .rpc();
```

---

## Rollback Procedure

If critical issues are discovered post-deployment:

1. **Pause protocol immediately** (prevents new escrows)
2. **Assess impact** on existing escrows
3. **Communicate** with users via official channels
4. **If upgrade needed:**
   ```bash
   # Deploy new version
   anchor upgrade target/deploy/mitama.so \
     --program-id 8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM \
     --provider.cluster mainnet
   ```
5. **Verify upgrade** and unpause protocol

---

## Monitoring Checklist

Post-deployment, monitor:

- [ ] Escrow creation events
- [ ] Dispute events
- [ ] Multi-oracle resolution events
- [ ] Protocol pause/unpause events
- [ ] Program error rates
- [ ] Transaction success rates

Set up alerts for:
- Any `ProtocolPaused` event
- High dispute rates (>10% of escrows)
- Oracle consensus failures
- Unusual transaction volumes

---

## Contact & Escalation

| Role | Contact | Responsibility |
|------|---------|----------------|
| Primary Authority | [REDACTED] | Day-to-day operations |
| Secondary Authority | [REDACTED] | Backup signer |
| Tertiary Authority | [REDACTED] | Emergency backup |
| On-call Engineer | [REDACTED] | Technical issues |

**Escalation Path:**
1. Technical issues → On-call Engineer
2. Security issues → All authorities + pause protocol
3. Fund issues → All authorities + legal team
