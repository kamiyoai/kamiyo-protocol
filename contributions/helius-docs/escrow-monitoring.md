# Escrow Transaction Monitoring

Using Helius webhooks and enhanced transactions to monitor payment escrows.

## Use Case

Track escrow lifecycle events:
- Creation (funds deposited)
- Release (payment to recipient)
- Refund (returned to sender)
- Disputes and settlements

## Webhook Setup

### Create Webhook

```typescript
import Helius from 'helius-sdk';

const helius = new Helius('your-api-key');

const webhook = await helius.createWebhook({
  accountAddresses: [ESCROW_PROGRAM_ID],
  transactionTypes: ['ANY'],
  webhookType: 'enhanced',
  webhookURL: 'https://your-server.com/escrow-events'
});
```

### Add Specific Escrows

```typescript
// Monitor specific escrow accounts
await helius.appendAddressesToWebhook(webhook.webhookID, [
  escrowPDA1.toBase58(),
  escrowPDA2.toBase58()
]);
```

## Parsing Escrow Events

### Webhook Payload

```typescript
interface EscrowEvent {
  type: 'ESCROW_CREATE' | 'ESCROW_RELEASE' | 'ESCROW_REFUND' | 'ESCROW_DISPUTE';
  escrow: string;
  amount: number;
  sender: string;
  recipient: string;
  timestamp: number;
}

function parseEscrowTransaction(tx: EnhancedTransaction): EscrowEvent | null {
  const instructions = tx.instructions;

  for (const ix of instructions) {
    if (ix.programId !== ESCROW_PROGRAM_ID) continue;

    // Discriminator determines instruction type
    const discriminator = ix.data.slice(0, 8);

    switch (discriminator) {
      case CREATE_DISCRIMINATOR:
        return {
          type: 'ESCROW_CREATE',
          escrow: ix.accounts[0],
          amount: parseAmount(ix.data),
          sender: ix.accounts[1],
          recipient: ix.accounts[2],
          timestamp: tx.timestamp
        };

      case RELEASE_DISCRIMINATOR:
        return {
          type: 'ESCROW_RELEASE',
          escrow: ix.accounts[0],
          amount: getAccountBalance(tx, ix.accounts[0]),
          sender: ix.accounts[1],
          recipient: ix.accounts[2],
          timestamp: tx.timestamp
        };

      case REFUND_DISCRIMINATOR:
        return {
          type: 'ESCROW_REFUND',
          escrow: ix.accounts[0],
          amount: getAccountBalance(tx, ix.accounts[0]),
          sender: ix.accounts[1],
          recipient: ix.accounts[1], // refund goes back to sender
          timestamp: tx.timestamp
        };
    }
  }

  return null;
}
```

### Webhook Handler

```typescript
import express from 'express';

const app = express();
app.use(express.json());

app.post('/escrow-events', async (req, res) => {
  const transactions = req.body;

  for (const tx of transactions) {
    const event = parseEscrowTransaction(tx);
    if (!event) continue;

    switch (event.type) {
      case 'ESCROW_CREATE':
        await db.escrows.create({
          address: event.escrow,
          amount: event.amount,
          sender: event.sender,
          recipient: event.recipient,
          status: 'active',
          createdAt: event.timestamp
        });
        break;

      case 'ESCROW_RELEASE':
        await db.escrows.update(event.escrow, {
          status: 'released',
          releasedAt: event.timestamp
        });
        await notifyRecipient(event.recipient, event.amount);
        break;

      case 'ESCROW_REFUND':
        await db.escrows.update(event.escrow, {
          status: 'refunded',
          refundedAt: event.timestamp
        });
        await notifySender(event.sender, event.amount);
        break;
    }
  }

  res.sendStatus(200);
});
```

## Historical Data

Fetch past escrow transactions:

```typescript
async function getEscrowHistory(escrowAddress: string): Promise<EscrowEvent[]> {
  const signatures = await helius.rpc.getSignaturesForAddress(escrowAddress, {
    limit: 100
  });

  const transactions = await helius.parseTransactions({
    transactions: signatures.map(s => s.signature)
  });

  return transactions
    .map(parseEscrowTransaction)
    .filter((e): e is EscrowEvent => e !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}
```

## Priority Fees for Escrow Ops

Time-sensitive escrow operations need appropriate fees:

```typescript
async function releaseEscrow(escrow: PublicKey, recipient: Keypair) {
  // Releases are time-sensitive - use high priority
  const fee = await helius.rpc.getPriorityFeeEstimate({
    accountKeys: [escrow.toBase58(), ESCROW_PROGRAM_ID],
    options: { priorityLevel: 'high' }
  });

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: fee.priorityFeeEstimate
    })
  );
  tx.add(createReleaseInstruction(escrow, recipient.publicKey));

  return helius.rpc.sendSmartTransaction(tx, [recipient]);
}

async function createEscrow(sender: Keypair, params: EscrowParams) {
  // Creation is less urgent - medium priority is fine
  const fee = await helius.rpc.getPriorityFeeEstimate({
    accountKeys: [ESCROW_PROGRAM_ID],
    options: { priorityLevel: 'medium' }
  });

  // ... build and send transaction
}
```

## Dashboard Query

Get escrow stats:

```typescript
async function getEscrowStats(programId: string) {
  const webhook = await helius.getWebhookByID(webhookId);

  // Query your database populated by webhook events
  const stats = await db.escrows.aggregate([
    { $match: { program: programId } },
    { $group: {
      _id: '$status',
      count: { $sum: 1 },
      totalAmount: { $sum: '$amount' }
    }}
  ]);

  return {
    active: stats.find(s => s._id === 'active'),
    released: stats.find(s => s._id === 'released'),
    refunded: stats.find(s => s._id === 'refunded'),
    disputed: stats.find(s => s._id === 'disputed')
  };
}
```

## Links

- [Helius Webhooks](https://docs.helius.dev/webhooks/webhooks-summary)
- [Enhanced Transactions](https://docs.helius.dev/solana-apis/enhanced-transactions-api)
- [Priority Fee API](https://docs.helius.dev/solana-rpc-nodes/alpha-priority-fee-api)
