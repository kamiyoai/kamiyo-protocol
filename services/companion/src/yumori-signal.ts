// Yumori ZK signal integration for market calls

import { logger } from './logger';

// Signal types matching the ZK circuit
const SIGNAL_TYPES = {
  MARKET_SENTIMENT: 0,
  TECHNICAL_ANALYSIS: 1,
  ON_CHAIN_ACTIVITY: 2,
  NEWS_EVENT: 3,
} as const;

// Direction values
const DIRECTIONS = {
  SHORT: 0,
  LONG: 1,
  NEUTRAL: 2,
} as const;

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
  let direction = DIRECTIONS.NEUTRAL;
  const bullishTerms = ['bullish', 'long', 'buy', 'moon', 'pump', 'breakout', 'ripping', 'sending'];
  const bearishTerms = ['bearish', 'short', 'sell', 'dump', 'crash', 'correction', 'bleeding', 'dead'];

  const bullCount = bullishTerms.filter(t => text.includes(t)).length;
  const bearCount = bearishTerms.filter(t => text.includes(t)).length;

  if (bullCount > bearCount) direction = DIRECTIONS.LONG;
  else if (bearCount > bullCount) direction = DIRECTIONS.SHORT;

  // Detect signal type
  let type = SIGNAL_TYPES.MARKET_SENTIMENT;
  if (text.includes('whale') || text.includes('wallet') || text.includes('on-chain')) {
    type = SIGNAL_TYPES.ON_CHAIN_ACTIVITY;
  } else if (text.includes('chart') || text.includes('support') || text.includes('resistance') || text.includes('breakout')) {
    type = SIGNAL_TYPES.TECHNICAL_ANALYSIS;
  } else if (text.includes('news') || text.includes('announcement') || text.includes('partnership')) {
    type = SIGNAL_TYPES.NEWS_EVENT;
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
  if (direction === DIRECTIONS.NEUTRAL && type === SIGNAL_TYPES.MARKET_SENTIMENT) {
    return null;
  }

  return { type, direction, confidence, magnitude };
}

// Generate ZK proof for market signal
export async function generateSignalProof(signal: MarketSignal): Promise<SignalProof | null> {
  try {
    // Dynamic import to avoid circular deps
    const { provePrivateSignal } = await import('@kamiyo/yumori-prover');
    const { randomBytes } = await import('crypto');

    const secret = BigInt('0x' + randomBytes(32).toString('hex'));
    const agentNullifier = BigInt('0x' + randomBytes(32).toString('hex'));

    const { proof, signalCommitment } = await provePrivateSignal({
      signalType: signal.type,
      direction: signal.direction,
      confidence: signal.confidence,
      magnitude: signal.magnitude,
      stakeAmount: BigInt(100000000), // 0.1 SOL equivalent
      secret,
      agentNullifier,
      minStake: BigInt(0),
      minConfidence: 0,
    });

    return {
      commitment: signalCommitment.toString(16),
      nullifier: agentNullifier.toString(16).slice(0, 32),
      proof: {
        a: proof.a.slice(0, 8).join(','),
        b: proof.b.slice(0, 8).join(','),
        c: proof.c.slice(0, 8).join(','),
      },
    };
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
    await import('@kamiyo/yumori-prover');
    proverAvailable = true;
    logger.info('Yumori prover available');
  } catch {
    proverAvailable = false;
    logger.warn('Yumori prover not available - ZK signals disabled');
  }

  return proverAvailable;
}

// Generate signal with proof for a market call
export async function createMarketCallSignal(
  content: string,
  context?: string
): Promise<{ signal: MarketSignal; proof: SignalProof } | null> {
  if (!(await isProverAvailable())) return null;

  const signal = extractMarketSignal(content, context);
  if (!signal) return null;

  logger.info('Generating ZK proof for market signal', {
    type: signal.type,
    direction: signal.direction,
    confidence: signal.confidence,
  });

  const proof = await generateSignalProof(signal);
  if (!proof) return null;

  return { signal, proof };
}

// Format signal for logging/display
export function formatSignal(signal: MarketSignal): string {
  const types = ['SENTIMENT', 'TA', 'ON-CHAIN', 'NEWS'];
  const dirs = ['SHORT', 'LONG', 'NEUTRAL'];
  return `${types[signal.type]} ${dirs[signal.direction]} conf=${signal.confidence}% mag=${signal.magnitude}%`;
}
