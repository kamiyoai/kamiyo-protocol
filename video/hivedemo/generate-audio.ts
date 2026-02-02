#!/usr/bin/env npx tsx
/**
 * Audio Generation Script for HiveDemo TEE
 *
 * Generates narration audio files using OpenAI TTS.
 *
 * Usage:
 *   OPENAI_API_KEY=xxx npx tsx video/hivedemo/generate-audio.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, 'audio');

// Scene narration texts (10 scenes, ~3 min total)
const scenes = [
  {
    id: 'scene1',
    duration: 12,
    text: `Introducing KAMIYO Hive. Trust infrastructure for AI agent teams. Agents can discover each other, form teams, share budgets, and coordinate on complex work. All with on-chain escrow, quality verification, and reputation tracking.`,
  },
  {
    id: 'scene2',
    duration: 16,
    text: `But here's the challenge. When a team of agents needs to vote on task assignments or bid for work, visible votes create problems. Agents collude. They game bids. They copy each other. You need privacy for fair coordination, but zero-knowledge proofs take hundreds of milliseconds per vote. For real-time teams, that's too slow.`,
  },
  {
    id: 'scene3',
    duration: 20,
    text: `MagicBlock's Trusted Execution Environment solves this. TEEs are hardware vaults inside the CPU. Votes go in encrypted. Processing happens in complete isolation. Not even the operating system can see inside. Intel TDX attestation proves the computation is legitimate. And execution takes under fifty milliseconds. That's ten to a hundred times faster than ZK alternatives.`,
  },
  {
    id: 'scene4',
    duration: 17,
    text: `Let's see it in action. We create a Hive team with five agents. Each has a role and individual spending limits. The shared treasury can be funded with KAMIYO tokens, or privately through Blindfold, a crypto card that supports Saul, USDC, and USDT while severing the on-chain link between your wallet and the team's pool.`,
  },
  {
    id: 'scene5',
    duration: 15,
    text: `A task is proposed to the team. Research Solana DeFi trends. Budget: twenty dollars. Now the team needs to decide: should we do it? And who should take it? This is where private coordination matters. Votes and bids are delegated to the MagicBlock TEE enclave.`,
  },
  {
    id: 'scene6',
    duration: 22,
    text: `Each agent submits an encrypted vote and sealed bid to the TEE. Twelve milliseconds. Eleven. Fourteen. All votes land in under fifty milliseconds total. Inside the enclave, votes are decrypted and tallied in complete isolation. The Intel TDX attestation proves this is a genuine, uncompromised enclave. No one can see individual votes. Not validators. Not other agents. Not even the host machine.`,
  },
  {
    id: 'scene7',
    duration: 18,
    text: `Results emerge from the TEE. Four yes votes, one no. Yuki submitted the best bid at fifteen dollars. But here's the key: we see the aggregate, not individual votes. Kuro bid eight dollars, but only they know that. Jin voted no, but that stays private. The TEE reveals only what's needed: the decision and the winner.`,
  },
  {
    id: 'scene8',
    duration: 14,
    text: `Yuki takes the task and delivers. The quality oracle scores the work at eighty-seven percent, above threshold. Payment releases automatically from escrow. Unused budget returns to the team pool. Reputation updates on-chain. Fair coordination, real payments, completely private voting.`,
  },
  {
    id: 'scene9',
    duration: 24,
    text: `From the Hive dashboard, you can create teams, manage members, and track shared budgets. Each team has a treasury with individual draw limits. Fund with KAMIYO tokens directly, or use Blindfold for private funding with Saul, USDC, or USDT. Tasks can be submitted to any member. All transactions are logged on-chain, while votes and bids remain private through the TEE.`,
  },
  {
    id: 'scene10',
    duration: 22,
    text: `KAMIYO Hive brings it all together. Agent discovery by capability and reputation. Escrow-protected payments released on quality verification. And with MagicBlock TEE, private team coordination at sub-fifty millisecond speed. When agents can see each other's votes, they collude. TEE makes coordination invisible and fair. KAMIYO Hive. Trust infrastructure for the agent economy.`,
  },
];

// OpenAI TTS
async function generateWithOpenAI(text: string, outputPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: 'nova', // Female, neutral voice
      input: text,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const buffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(buffer));
}

// Main
async function main() {
  console.log('Generating audio using OpenAI (nova voice)...\n');

  // Ensure audio directory exists
  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }

  for (const scene of scenes) {
    const outputPath = join(AUDIO_DIR, `${scene.id}.mp3`);
    console.log(`[${scene.id}] Generating... (target: ${scene.duration}s)`);

    try {
      await generateWithOpenAI(scene.text, outputPath);
      console.log(`[${scene.id}] ✓ Saved to ${outputPath}`);
    } catch (error) {
      console.error(`[${scene.id}] ✗ Error: ${error}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\nDone! Audio files saved to video/hivedemo/audio/');
  console.log('\nNext: Run concat script to combine into full-narration.mp3');
}

main().catch(console.error);
