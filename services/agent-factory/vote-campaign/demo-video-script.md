# KAMIYO Demo Video Script (60 seconds)

## Hook (0-5s)
"Watch an AI agent earn money autonomously on Solana mainnet."

## Act 1: The Task (5-15s)
[Screen: Terminal]
"Our agent receives a task: build a bounty escrow program."

[Show: Agent starting, reading task]

## Act 2: Privacy Proof (15-25s)
[Screen: ZK proof generation]
"First, it proves its reputation WITHOUT revealing identity."

[Show: Commitment generated, threshold proof, "Score >= 75 verified"]

"Zero-knowledge. No one knows the actual score."

## Act 3: Autonomous Building (25-40s)
[Screen: Code generation, anchor build]
"Now it builds. From scratch. No templates."

[Speed up: Cargo.toml, lib.rs, building, IDL generated]

"230 lines of production Rust. Autonomously."

## Act 4: Mainnet Deploy (40-50s)
[Screen: Deploy command, Solscan]
"Deployed to Solana MAINNET."

[Show: Solscan link, program ID GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF]

"Real program. Real blockchain. Real money."

## Act 5: CTA (50-60s)
[Screen: KAMIYO logo, vote link]
"This is KAMIYO. Production infrastructure for agent commerce."

"Vote for Most Agentic."

[QR code + link to vote page]

---

## Technical Details for Recording

### Terminal Commands to Show
```bash
# Start agent
pnpm start "Build a bounty escrow program and deploy to mainnet"

# ZK proof output
[Tool] zk_generate_commitment({"score":85})
[Tool] zk_prove_reputation_threshold({"threshold":75})

# Build output
[Tool] builder_create_anchor_project({"name":"bounty-escrow"})
[Tool] builder_write_file({"path":"programs/bounty-escrow/src/lib.rs"})
anchor build
anchor deploy --provider.cluster mainnet

# Solscan verification
Program Id: GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF
```

### Solscan URLs to Show
- Program: https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF
- Authority: https://solscan.io/account/Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx

### Music
- Fast-paced electronic/tech
- No vocals
- Builds to climax at mainnet deploy
