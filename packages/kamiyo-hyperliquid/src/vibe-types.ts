export type Direction = 'long' | 'short';
export type TriggerOperator = '>' | '<' | '>=' | '<=' | 'crosses_above' | 'crosses_below';

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
  status: 'pending' | 'triggered' | 'active' | 'closed' | 'expired' | 'failed';
  createdAt: number;
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
}

export interface ExecutionResult {
  success: boolean;
  orderId?: number;
  fillPrice?: number;
  fillSize?: number;
  error?: string;
}

export interface VibeEvent {
  type: 'strategy_created' | 'strategy_triggered' | 'strategy_activated' | 'strategy_closed' | 'strategy_failed' | 'position_update' | 'stop_loss' | 'take_profit';
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

export const SUPPORTED_ASSETS = ['BTC', 'ETH', 'SOL', 'ARB', 'DOGE', 'AVAX', 'MATIC', 'OP', 'WIF', 'PEPE', 'BONK'];
