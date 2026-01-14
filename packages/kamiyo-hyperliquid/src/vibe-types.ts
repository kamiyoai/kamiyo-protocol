/**
 * Type definitions for vibe trading.
 */

export type Direction = 'long' | 'short';
export type TriggerOperator = '>' | '<' | '>=' | '<=' | 'crosses_above' | 'crosses_below';
export type StrategyStatus = 'pending' | 'triggered' | 'active' | 'closed' | 'expired' | 'failed';

export interface PriceTrigger {
  asset: string;
  operator: TriggerOperator;
  price: number;
}

export interface Trigger {
  price?: PriceTrigger;
  and?: Trigger[];
  or?: Trigger[];
}

export interface RiskParams {
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
}

export interface Strategy {
  id: string;
  thesis: string;
  asset: string;
  direction: Direction;
  leverage: number;
  sizeUsd: number;
  trigger: Trigger;
  risk: RiskParams;
  expiresAt?: number;
  status: StrategyStatus;
  createdAt: number;
  activatedAt?: number;
  closedAt?: number;
  errorMessage?: string;
}

export interface VibePosition {
  strategyId: string;
  asset: string;
  direction: Direction;
  entryPrice: number;
  currentPrice: number;
  sizeUsd: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  openedAt: number;
  orderId?: number;
  closing: boolean;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: number;
  fillPrice?: number;
  fillSize?: number;
  error?: string;
}

export type VibeEventType =
  | 'strategy_created'
  | 'strategy_triggered'
  | 'strategy_activated'
  | 'strategy_closed'
  | 'strategy_failed'
  | 'position_update'
  | 'stop_loss'
  | 'take_profit'
  | 'error';

export interface VibeEvent {
  type: VibeEventType;
  strategyId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export type VibeEventHandler = (event: VibeEvent) => void;

export interface RiskLimits {
  maxPositionUsd: number;
  maxTotalExposureUsd: number;
  maxLeverage: number;
  maxDailyLossUsd: number;
  requireStopLoss: boolean;
  minStopLossPercent: number;
  maxConcurrentPositions: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxPositionUsd: 10_000,
  maxTotalExposureUsd: 50_000,
  maxLeverage: 10,
  maxDailyLossUsd: 5_000,
  requireStopLoss: true,
  minStopLossPercent: -0.20,
  maxConcurrentPositions: 5,
};

export const SUPPORTED_ASSETS = [
  'BTC', 'ETH', 'SOL', 'ARB', 'DOGE', 'AVAX',
  'MATIC', 'OP', 'WIF', 'PEPE', 'BONK', 'SUI',
  'APT', 'INJ', 'SEI', 'TIA', 'JUP', 'ONDO'
] as const;

export type SupportedAsset = typeof SUPPORTED_ASSETS[number];

export function isValidAsset(asset: string): asset is SupportedAsset {
  return SUPPORTED_ASSETS.includes(asset as SupportedAsset);
}

export class VibeError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'VibeError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends VibeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends VibeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'EXECUTION_ERROR', details);
    this.name = 'ExecutionError';
  }
}

export class ParseError extends VibeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PARSE_ERROR', details);
    this.name = 'ParseError';
  }
}

export function validateStrategy(s: Strategy): void {
  if (!s.id || typeof s.id !== 'string') {
    throw new ValidationError('Strategy ID is required');
  }
  if (!s.asset) {
    throw new ValidationError('Asset is required');
  }
  if (!isValidAsset(s.asset)) {
    throw new ValidationError(`Unsupported asset: ${s.asset}`, {
      asset: s.asset,
      supported: SUPPORTED_ASSETS,
    });
  }
  if (s.direction !== 'long' && s.direction !== 'short') {
    throw new ValidationError(`Invalid direction: ${s.direction}`);
  }
  if (typeof s.leverage !== 'number' || s.leverage < 1 || s.leverage > 20) {
    throw new ValidationError(`Leverage must be 1-20, got ${s.leverage}`);
  }
  if (typeof s.sizeUsd !== 'number' || s.sizeUsd < 10 || s.sizeUsd > 100_000) {
    throw new ValidationError(`Size must be $10-$100,000, got $${s.sizeUsd}`);
  }
  if (s.risk.stopLossPercent !== undefined) {
    if (typeof s.risk.stopLossPercent !== 'number') {
      throw new ValidationError('Stop loss must be a number');
    }
    if (s.risk.stopLossPercent >= 0 || s.risk.stopLossPercent < -1) {
      throw new ValidationError('Stop loss must be between -100% and 0%');
    }
  }
  if (s.risk.takeProfitPercent !== undefined) {
    if (typeof s.risk.takeProfitPercent !== 'number') {
      throw new ValidationError('Take profit must be a number');
    }
    if (s.risk.takeProfitPercent <= 0) {
      throw new ValidationError('Take profit must be positive');
    }
  }
  validateTrigger(s.trigger);
}

function validateTrigger(t: Trigger): void {
  if (!t) return;
  if (t.price) {
    if (!t.price.asset) {
      throw new ValidationError('Trigger asset is required');
    }
    if (!isValidAsset(t.price.asset)) {
      throw new ValidationError(`Unsupported trigger asset: ${t.price.asset}`);
    }
    if (typeof t.price.price !== 'number' || t.price.price <= 0) {
      throw new ValidationError('Trigger price must be positive');
    }
    const validOps: TriggerOperator[] = ['>', '<', '>=', '<=', 'crosses_above', 'crosses_below'];
    if (!validOps.includes(t.price.operator)) {
      throw new ValidationError(`Invalid trigger operator: ${t.price.operator}`);
    }
  }
  if (t.and) {
    t.and.forEach(validateTrigger);
  }
  if (t.or) {
    t.or.forEach(validateTrigger);
  }
}

export interface PersistedState {
  version: number;
  strategies: Strategy[];
  positions: VibePosition[];
  dailyPnl: number;
  dailyResetDate: string;
  lastUpdated: number;
}

export const STATE_VERSION = 1;
