// Hive ZK signal integration for market calls

import { logger } from './logger';
import { storeHiveSignal, isProofRateLimited, incrementProofCount } from './db';


// Signal types matching the ZK circuit
const SIGNAL_TYPE_MARKET_SENTIMENT = 0;
const SIGNAL_TYPE_TECHNICAL_ANALYSIS = 1;
const SIGNAL_TYPE_ON_CHAIN_ACTIVITY = 2;
const SIGNAL_TYPE_NEWS_EVENT = 3;

// Direction values
const DIR_SHORT = 0;
const DIR_LONG = 1;
const DIR_NEUTRAL = 2;

interface MarketSignal {
  type: number;
  direction: number;
  confidence: number;
  magnitude: number;
}

interface SignalProof {
  commitment: string;
  nullifier: string;
  proof: {
    a: string;
    b: string;
    c: string;
  };
}

// Parse market sentiment from post content
export function extractMarketSignal(content: string, context?: string): MarketSignal | null {
  const text = content.toLowerCase();

  // Detect direction
  let direction = DIR_NEUTRAL;
  const bullishTerms = ['bullish', 'long', 'buy', 'moon', 'pump', 'breakout', 'ripping', 'sending'];
  const bearishTerms = ['bearish', 'short', 'sell', 'dump', 'crash', 'correction', 'bleeding', 'dead'];

  const bullCount = bullishTerms.filter(t => text.includes(t)).length;
  const bearCount = bearishTerms.filter(t => text.includes(t)).length;

  if (bullCount > bearCount) direction = DIR_LONG;
  else if (bearCount > bullCount) direction = DIR_SHORT;

  // Detect signal type
  let type = SIGNAL_TYPE_MARKET_SENTIMENT;
  if (text.includes('whale') || text.includes('wallet') || text.includes('on-chain')) {
    type = SIGNAL_TYPE_ON_CHAIN_ACTIVITY;
  } else if (text.includes('chart') || text.includes('support') || text.includes('resistance') || text.includes('breakout')) {
    type = SIGNAL_TYPE_TECHNICAL_ANALYSIS;
  } else if (text.includes('news') || text.includes('announcement') || text.includes('partnership')) {
    type = SIGNAL_TYPE_NEWS_EVENT;
  }

  // Calculate confidence based on language strength
  const strongTerms = ['definitely', 'clearly', 'obvious', 'certain', 'confident', 'strongly'];
  const weakTerms = ['maybe', 'might', 'possibly', 'uncertain', 'could'];
  const strongCount = strongTerms.filter(t => text.includes(t)).length;
  const weakCount = weakTerms.filter(t => text.includes(t)).length;

  let confidence = 50;
  confidence += strongCount * 15;
  confidence -= weakCount * 10;
  confidence = Math.max(10, Math.min(95, confidence));

  // Calculate magnitude based on terms like "huge", "massive", "slight"
  const highMagnitude = ['huge', 'massive', 'major', 'significant', 'big'];
  const lowMagnitude = ['slight', 'minor', 'small', 'little'];
  const highCount = highMagnitude.filter(t => text.includes(t)).length;
  const lowCount = lowMagnitude.filter(t => text.includes(t)).length;

  let magnitude = 50;
  magnitude += highCount * 20;
  magnitude -= lowCount * 15;
  magnitude = Math.max(10, Math.min(90, magnitude));

  // Only return signal if there's directional bias or market content
  if (direction === DIR_NEUTRAL && type === SIGNAL_TYPE_MARKET_SENTIMENT) {
    return null;
  }

  return { type, direction, confidence, magnitude };
}

// Generate ZK proof for market signal
export async function generateSignalProof(signal: MarketSignal, tweetId?: string): Promise<SignalProof | null> {
  // Check rate limit before expensive proof generation
  if (isProofRateLimited()) {
    logger.warn('ZK proof generation rate limited');
    return null;
  }

  try {
    // Dynamic import - prover is optional, may not be installed
    // Use variable to bypass TypeScript module resolution
    const proverModule = '@kamiyo/hive-prover';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prover: any = await import(/* webpackIgnore: true */ proverModule);
    const { provePrivateSignal } = prover;
    const { randomBytes } = await import('crypto');

    const secret = BigInt('0x' + randomBytes(32).toString('hex'));
    const agentNullifier = BigInt('0x' + randomBytes(32).toString('hex'));
    const stakeAmount = BigInt(100000000); // 0.1 SOL equivalent

    const { proof, signalCommitment } = await provePrivateSignal({
      signalType: signal.type,
      direction: signal.direction,
      confidence: signal.confidence,
      magnitude: signal.magnitude,
      stakeAmount,
      secret,
      agentNullifier,
      minStake: BigInt(0),
      minConfidence: 0,
    });

    // Increment rate limit counter
    incrementProofCount();

    const result: SignalProof = {
      commitment: signalCommitment.toString(16),
      nullifier: agentNullifier.toString(16).slice(0, 32),
      proof: {
        a: proof.a.join(','),
        b: proof.b.join(','),
        c: proof.c.join(','),
      },
    };

    // Store in database
    storeHiveSignal(
      tweetId || null,
      result.commitment,
      result.nullifier,
      result.proof.a,
      result.proof.b,
      result.proof.c,
      signal.type,
      signal.direction,
      signal.confidence,
      signal.magnitude,
      stakeAmount.toString()
    );

    logger.info('ZK proof generated and stored', { commitment: result.commitment.slice(0, 16) + '...' });

    return result;
  } catch (err) {
    logger.error('ZK proof generation failed', { error: String(err) });
    return null;
  }
}

// Check if prover is available
let proverAvailable: boolean | null = null;

export async function isProverAvailable(): Promise<boolean> {
  if (proverAvailable !== null) return proverAvailable;

  try {
    const proverModule = '@kamiyo/hive-prover';
    await import(/* webpackIgnore: true */ proverModule);
    proverAvailable = true;
    logger.info('Hive prover available');
  } catch {
    proverAvailable = false;
    logger.warn('Hive prover not available - ZK signals disabled');
  }

  return proverAvailable;
}

// Generate signal with proof for a market call
export async function createMarketCallSignal(
  content: string,
  context?: string,
  tweetId?: string
): Promise<{ signal: MarketSignal; proof: SignalProof } | null> {
  if (!(await isProverAvailable())) return null;

  const signal = extractMarketSignal(content, context);
  if (!signal) return null;

  logger.info('Generating ZK proof for market signal', {
    type: signal.type,
    direction: signal.direction,
    confidence: signal.confidence,
    tweetId,
  });

  const proof = await generateSignalProof(signal, tweetId);
  if (!proof) return null;

  return { signal, proof };
}

// Format signal for logging/display
export function formatSignal(signal: MarketSignal): string {
  const types = ['SENTIMENT', 'TA', 'ON-CHAIN', 'NEWS'];
  const dirs = ['SHORT', 'LONG', 'NEUTRAL'];
  return `${types[signal.type]} ${dirs[signal.direction]} conf=${signal.confidence}% mag=${signal.magnitude}%`;
}
