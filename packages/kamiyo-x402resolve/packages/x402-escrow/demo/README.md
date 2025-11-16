# x402Resolve Escrow Demo

Interactive demonstration of full escrow lifecycle with dispute resolution.

## Setup

```bash
cd packages/x402-escrow
npm install

# Verify program deployed
solana program show AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR --url devnet
```

## Run

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
ts-node demo/demo-interaction.ts
```

## Demo Scenarios

### Scenario 1: Happy Path
1. Agent initializes escrow (0.1 SOL)
2. Agent releases funds immediately (satisfied with API response)
3. API receives full payment

**Expected Output:**
```
 Escrow initialized
 Funds released to API
```

### Scenario 2: Dispute Resolution
1. Agent initializes escrow (0.1 SOL)
2. Agent marks as disputed (unhappy with response quality)
3. Verifier resolves with 50% refund
4. Agent receives 0.05 SOL refund, API receives 0.05 SOL

**Expected Output:**
```
 Escrow initialized
 Dispute marked
 Dispute resolved
   Quality Score: 50
   Refund: 50%
```

### Scenario 3: Time Lock Expiration
1. Agent initializes escrow with 60-second time lock
2. After 60 seconds, anyone can release funds to API
3. Demonstrates auto-release mechanism

## Features Demonstrated

- Input validation (amounts, time locks, IDs)
- PDA escrow accounts
- Proportional refunds (0-100%)
- Dispute window enforcement
- Event emissions
- Time-lock mechanism

## Validation

Fails if:
- Amount < 0.001 SOL or > 1000 SOL
- Time lock < 1 hour or > 30 days
- Transaction ID empty or > 64 chars
- Dispute after time lock expires

## Event Monitoring

View emitted events on Solana Explorer:
```
https://explorer.solana.com/address/AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR?cluster=devnet
```

Events emitted:
- `EscrowInitialized` - When escrow created
- `DisputeMarked` - When agent raises dispute
- `DisputeResolved` - When verifier resolves
- `FundsReleased` - When funds released

## Customization

Edit constants in `demo-interaction.ts`:
```typescript
const DEMO_AMOUNT = 0.1 * LAMPORTS_PER_SOL;
const TIME_LOCK = 3600; // seconds
const TRANSACTION_ID = `demo_tx_${Date.now()}`;
```

## Troubleshooting

### Insufficient Funds
```bash
# Get devnet SOL
solana airdrop 2 <YOUR_WALLET> --url devnet
```

### Program Not Found
```bash
# Verify program is deployed
solana program show AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR --url devnet
```

### Transaction Failed
Check error message for validation failures:
- InvalidAmount
- InvalidTimeLock
- InvalidTransactionId
- DisputeWindowExpired
- TimeLockNotExpired

## Advanced Usage

### Manual Transaction Signing

```typescript
import { Transaction } from '@solana/web3.js';

const ix = await program.methods
  .initializeEscrow(amount, timeLock, txId)
  .accounts({...})
  .instruction();

const tx = new Transaction().add(ix);
const signature = await provider.sendAndConfirm(tx);
```

### Listening to Events

```typescript
// Subscribe to program events
const listener = program.addEventListener('EscrowInitialized', (event) => {
  console.log('Escrow initialized:', event);
});

// Cleanup
program.removeEventListener(listener);
```

### Multi-Transaction Demo

See `demo-advanced.ts` for examples of:
- Batch escrow creation
- Multiple dispute resolutions
- Parallel processing

## Integration Examples

### Frontend Integration
```typescript
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';

function useEscrow() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const program = new Program(IDL, PROGRAM_ID, { connection, wallet });

  return { program };
}
```

### CLI Integration
```bash
# Call via Anchor CLI
anchor run initialize-escrow --provider.cluster devnet
```

## Next Steps

- Review `VALIDATION_IMPROVEMENTS.md` for validation details
- Check `SESSION_REPORT.md` for implementation notes
- See `DEPLOYMENT.md` for deployment guide
- Read `SECURITY.md` for security considerations

## Support

For issues or questions:
- Check program logs: `solana logs AFmBBw7kbrnwhhzYadAMCMh4BBBZcZdS3P7Z6vpsqsSR --url devnet`
- View transactions on Explorer
- Review error codes in `lib.rs`
