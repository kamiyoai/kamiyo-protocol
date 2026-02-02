# HiveDemo - MagicBlock TEE Voting Demo

Submission video for Solana Privacy Hackathon demonstrating MagicBlock TEE-based voting for SwarmTeams.

**Status**: Audio generated, terminal synced, ready to record.

## Overview

This demo shows how MagicBlock's Trusted Execution Environment (TEE) enables private voting and sealed-bid auctions for AI agent coordination. The key innovation: **hardware-enforced privacy at sub-50ms speed**, compared to ~500ms for ZK proofs.

## Key Message

"When agents can see each other's votes, they collude. TEE makes coordination invisible."

## Files

```
video/hivedemo/
├── README.md           # This file
├── script.md           # Full narration script with timing
├── scenes.json         # Scene configuration with terminal actions
├── terminal.ts         # Interactive terminal demo script
├── generate-audio.ts   # TTS audio generation script
└── audio/
    ├── narration.txt   # Raw narration text
    └── scene*.mp3      # Generated audio files
```

## Quick Start

### Audio is ready
Audio has been generated and is in `audio/`. Full narration is `audio/full-narration.mp3` (2:32).

### Run Terminal Demo

```bash
cd ~/project/Documents/Dennis/kamiyo-protocol

# Run full demo (all scenes)
npx tsx video/hivedemo/terminal.ts

# Run specific scene
npx tsx video/hivedemo/terminal.ts --scene=5

# Play with audio (macOS - uses afplay)
npx tsx video/hivedemo/play.ts
```

### Record Video

**Option 1: Full recording**
1. Open terminal fullscreen
2. Start OBS/screen recorder
3. Play `audio/full-narration.mp3`
4. Run `npx tsx video/hivedemo/terminal.ts` at the same time

**Option 2: Scene by scene**
1. Run `npx tsx video/hivedemo/play.ts --scene=1` (plays audio + terminal together)
2. Repeat for scenes 2-8
3. Stitch together in video editor

## Scene Breakdown

| Scene | Time | Duration | Content |
|-------|------|----------|---------|
| 1 | 0:00-0:20 | 20s | The Problem - visible votes |
| 2 | 0:20-0:40 | 20s | Solution - MagicBlock TEE |
| 3 | 0:40-1:00 | 20s | Create SwarmTeam |
| 4 | 1:00-1:20 | 20s | Propose task |
| 5 | 1:20-1:50 | 30s | TEE voting phase |
| 6 | 1:50-2:15 | 25s | Results revealed |
| 7 | 2:15-2:40 | 25s | Settlement |
| 8 | 2:40-3:00 | 20s | Closing comparison |

**Total: 3 minutes**

## MagicBlock TEE Integration

The demo showcases:

1. **Encrypted vote submission** - Votes encrypted before entering TEE
2. **Hardware isolation** - Intel TDX enclave processes in isolation
3. **Attestation** - Cryptographic proof of legitimate computation
4. **Selective disclosure** - Only aggregates revealed, not individual votes

### Why TEE vs ZK?

| Approach | Speed | Privacy | Complexity |
|----------|-------|---------|------------|
| Commit-Reveal | Fast | Temporary | Low |
| ZK Proofs | ~500ms/vote | Strong | High |
| **MagicBlock TEE** | **<50ms total** | **Hardware-enforced** | **Moderate** |

## Technical Details

### MagicBlock TEE Features Used

- **Private Ephemeral Rollups** - State delegated to TEE for processing
- **Intel TDX** - Hardware security architecture
- **Attestation** - Quote verification proves enclave integrity
- **Sealed-bid auctions** - Same pattern used for voting

### Integration Points

```typescript
// Submit encrypted vote to TEE
await magicblock.tee.submit({
  encryptedVote: encrypt(vote, enclavePublicKey),
  encryptedBid: encrypt(bid, enclavePublicKey),
});

// TEE processes internally, returns only aggregates
const result = await magicblock.tee.getResult(proposalId);
// { yesVotes: 4, noVotes: 1, winner: 'diana', winningBid: 15 }
```

## Customization

### Adjusting Timing

Edit `scenes.json` to modify:
- Scene durations
- Terminal action timing
- Text display speed

### Changing Narration

1. Edit `script.md` for the full script
2. Update `generate-audio.ts` scene texts
3. Regenerate audio files

### Terminal Appearance

Modify `terminal.ts` to change:
- Colors
- ASCII art
- Animation speed
- Text content

## Production Tips

1. **Terminal setup**:
   - Use a dark theme (Dracula, One Dark)
   - Font size 18-20px for readability
   - Disable cursor blink
   - Full screen recording

2. **Audio sync**:
   - Add 0.5s buffer at scene transitions
   - Adjust terminal delays to match narration
   - Test each scene individually before full run

3. **Post-production**:
   - Add subtle background music (low volume)
   - Include captions for accessibility
   - Add KAMIYO + MagicBlock logos in intro/outro
