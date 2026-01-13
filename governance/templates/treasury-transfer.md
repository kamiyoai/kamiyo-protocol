# Treasury Transfer Proposal Template

## Title
[Short descriptive title - max 80 chars]

Example: "Fund Q1 2026 security audit - 50 SOL"

## Description

### Summary
[1-2 sentences describing the transfer]

### Recipient
- **Wallet**: [recipient pubkey]
- **Entity**: [name/organization]
- **Verification**: [link to verify identity if applicable]

### Amount
- **SOL**: [amount] SOL
- **USD equivalent**: ~$[amount] (at time of proposal)

### Purpose
[Detailed explanation of what funds will be used for]

### Deliverables
[Expected outcomes, milestones, or deliverables]

### Timeline
[When funds are needed, expected completion]

## Executable Instructions

```json
{
  "programId": "11111111111111111111111111111111",
  "instruction": "transfer",
  "accounts": [
    { "name": "from", "pubkey": "[TREASURY_PDA]" },
    { "name": "to", "pubkey": "[RECIPIENT]" }
  ],
  "args": {
    "lamports": "[AMOUNT_IN_LAMPORTS]"
  }
}
```

## Voting

- Approval threshold: 60%
- Voting period: 3 days
- Cool-off: 12 hours
