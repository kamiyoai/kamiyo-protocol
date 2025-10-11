/**
 * Type definitions for Kamiyo Frontend
 */

// User and Authentication
export interface User {
  id: string;
  email: string;
  name?: string;
  tier: SubscriptionTier;
  created_at: string;
  api_key?: string;
}

export type SubscriptionTier = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Exploits
export interface Exploit {
  tx_hash: string;
  protocol: string;
  chain: string;
  amount_usd: number;
  attack_type: string;
  timestamp: string;
  source: string;
  description?: string;
  verified: boolean;
}

export interface ExploitsResponse {
  data: Exploit[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// Statistics
export interface Stats {
  total_exploits: number;
  total_loss_usd: number;
  affected_chains: number;
  affected_protocols: number;
  period_days: number;
  top_chains: ChainStat[];
  top_protocols: ProtocolStat[];
}

export interface ChainStat {
  chain: string;
  exploit_count: number;
  total_loss: number;
}

export interface ProtocolStat {
  protocol: string;
  exploit_count: number;
  total_loss: number;
}

// Pricing
export interface PricingTier {
  name: string;
  tier: SubscriptionTier;
  price: number;
  priceAnnual: number;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
  limits: {
    api_calls: string;
    rate_limit: string;
    webhooks: number;
    historical_data: string;
    support: string;
  };
}

// Usage
export interface UsageData {
  current_period_start: string;
  current_period_end: string;
  api_calls: number;
  api_limit: number;
  percentage_used: number;
  daily_usage: DailyUsage[];
}

export interface DailyUsage {
  date: string;
  calls: number;
}

// WebSocket
export interface WebSocketMessage {
  type: 'exploit' | 'status' | 'error' | 'heartbeat';
  data?: any;
  timestamp: string;
}

export interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
}

// Notifications
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
  duration?: number;
}

// API Response
export interface APIError {
  error: string;
  detail?: string;
  status_code?: number;
}

// Dashboard
export interface DashboardData {
  recent_exploits: Exploit[];
  usage: UsageData;
  stats: Stats;
  alerts: AlertConfig[];
}

export interface AlertConfig {
  id: string;
  name: string;
  enabled: boolean;
  chains: string[];
  min_amount: number;
  notification_channels: ('email' | 'discord' | 'telegram')[];
}

// Source Rankings
export interface SourceRanking {
  source: string;
  total_score: number;
  speed_score: number;
  exclusivity_score: number;
  reliability_score: number;
  coverage_score: number;
  accuracy_score: number;
  exploit_count: number;
  rank: number;
}

export interface SourceComparison {
  period_days: number;
  total_sources: number;
  rankings: SourceRanking[];
  methodology: {
    speed_weight: number;
    exclusivity_weight: number;
    reliability_weight: number;
    coverage_weight: number;
    accuracy_weight: number;
  };
}
