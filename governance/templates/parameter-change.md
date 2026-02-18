# Parameter Change Proposal Template

## Title
[Short descriptive title - max 80 chars]

Example: "Reduce escrow creation fee from 0.1% to 0.05%"

## Description

### Summary
[1-2 sentences describing the change]

### Motivation
[Why this change is needed]

### Specification
- **Parameter**: [parameter name]
- **Current value**: [current value]
- **Proposed value**: [new value]

### Impact
[Expected effects on users, protocol, treasury]

### Risks
[Potential downsides or risks]

## Executable Instructions

```json
{
  "programId": "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr",
  "instruction": "updateProtocolConfig",
  "accounts": [
    { "name": "config", "pubkey": "E6VhYjktLpT91VJy7bt5VL7DhTurZZKZUEFEgxLdZHna" },
    { "name": "authority", "pubkey": "[DAO_AUTHORITY]" }
  ],
  "args": {
    "parameterName": "[PARAMETER]",
    "newValue": "[VALUE]"
  }
}
```

## Voting

- Approval threshold: 60%
- Voting period: 3 days
- Cool-off: 12 hours
