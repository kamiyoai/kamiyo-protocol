#!/usr/bin/env npx tsx
/**
 * HiveDemo Player
 *
 * Plays audio and runs terminal demo simultaneously.
 * Requires: ffplay (from ffmpeg) or afplay (macOS)
 *
 * Usage:
 *   npx tsx video/hivedemo/play.ts          # Play all scenes
 *   npx tsx video/hivedemo/play.ts --scene=3 # Play specific scene
 */

import { spawn, exec } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, 'audio');

// Audio durations in ms
const sceneDurations = [
  { scene: 1, audio: 'scene1.mp3', duration: 20700 },
  { scene: 2, audio: 'scene2.mp3', duration: 23700 },
  { scene: 3, audio: 'scene3.mp3', duration: 14600 },
  { scene: 4, audio: 'scene4.mp3', duration: 14100 },
  { scene: 5, audio: 'scene5.mp3', duration: 24200 },
  { scene: 6, audio: 'scene6.mp3', duration: 20800 },
  { scene: 7, audio: 'scene7.mp3', duration: 13400 },
  { scene: 8, audio: 'scene8.mp3', duration: 20400 },
];

// Play audio file (cross-platform)
function playAudio(audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Try afplay (macOS) first, then ffplay
    const player = process.platform === 'darwin' ? 'afplay' : 'ffplay';
    const args = process.platform === 'darwin'
      ? [audioPath]
      : ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioPath];

    const proc = spawn(player, args, { stdio: 'ignore' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Audio player exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Run terminal scene
async function runTerminalScene(sceneNum: number): Promise<void> {
  const terminalScript = join(__dirname, 'terminal.ts');

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', terminalScript, `--scene=${sceneNum}`], {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Terminal script exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

// Play single scene (audio + terminal in parallel)
async function playScene(sceneNum: number) {
  const sceneConfig = sceneDurations.find(s => s.scene === sceneNum);
  if (!sceneConfig) {
    throw new Error(`Invalid scene: ${sceneNum}`);
  }

  const audioPath = join(AUDIO_DIR, sceneConfig.audio);
  if (!existsSync(audioPath)) {
    console.error(`Audio file not found: ${audioPath}`);
    console.error('Run generate-audio.ts first');
    process.exit(1);
  }

  console.log(`\n[Scene ${sceneNum}] Playing...`);

  // Run both in parallel
  await Promise.all([
    playAudio(audioPath).catch(err => {
      console.error('Audio error:', err.message);
    }),
    runTerminalScene(sceneNum),
  ]);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const sceneArg = args.find(a => a.startsWith('--scene='));

  if (sceneArg) {
    // Play single scene
    const sceneNum = parseInt(sceneArg.split('=')[1]);
    if (sceneNum < 1 || sceneNum > 8) {
      console.error('Scene must be 1-8');
      process.exit(1);
    }
    await playScene(sceneNum);
  } else {
    // Play all scenes
    console.log('HiveDemo - Full Playback');
    console.log('========================\n');
    console.log('Starting in 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));

    for (let i = 1; i <= 8; i++) {
      await playScene(i);
      // Brief pause between scenes
      await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n[Demo Complete]');
  }
}

main().catch(console.error);
