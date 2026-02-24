export type MarketStatus = 'active' | 'paused' | 'closed' | 'resolved' | 'cancelled';
export type Outcome = 'yes' | 'no';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'expired';
export type OrderType = 'limit' | 'market';
export type TransactionType = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'claim' | 'mint' | 'redeem';
export type MarketFrequency = 'daily' | 'weekly' | 'monthly' | 'annually' | 'one-time';

export interface MarketOutcome {
  label: string;
  probability: number;
}

export interface Market {
  id: string;
  address: string;
  question: string;
  description: string;
  category: string;
  status: MarketStatus;
  yesPrice: number;
  noPrice: number;
  yesSupply: number;
  noSupply: number;
  volume24h: number;
  totalVolume: number;
  totalCollateral: number;
  feeBps: number;
  oracle: string;
  collateralMint: string;
  yesMint: string;
  noMint: string;
  resolutionDeadline: string;
  tradingEnd: string;
  resolvedOutcome?: Outcome;
  createdAt: string;
  resolvedAt?: string;
  outcomes?: MarketOutcome[];
  frequency?: MarketFrequency;
  imageUrl?: string;
}

export interface Order {
  id: string;
  orderId: number;
  marketId: string;
  owner: string;
  side: OrderSide;
  outcome: Outcome;
  orderType: OrderType;
  price: number;
  priceBps: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  isPrivate: boolean;
  txSignature?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface Position {
  marketId: string;
  marketQuestion: string;
  owner: string;
  yesBalance: number;
  noBalance: number;
  avgYesCost: number;
  avgNoCost: number;
  currentYesPrice: number;
  currentNoPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalDeposited: number;
  totalWithdrawn: number;
  openOrderCount: number;
  totalTrades: number;
  createdAt: string;
}

export interface Trade {
  id: string;
  marketId: string;
  outcome: Outcome;
  price: number;
  quantity: number;
  buyer: string;
  seller: string;
  txSignature: string;
  createdAt: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface OrderBook {
  marketId: string;
  outcome: Outcome;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdated: string;
}

export interface User {
  wallet: string;
  username?: string;
  createdAt: string;
  stats: UserStats;
  settings: UserSettings;
}

export interface UserStats {
  totalTrades: number;
  totalVolume: number;
  winRate: number;
  pnl30d: number;
  pnlAllTime: number;
}

export interface UserSettings {
  defaultPrivacyMode: string;
  notificationsEnabled: boolean;
}

export interface Transaction {
  id: string;
  owner: string;
  txType: TransactionType;
  marketId?: string;
  amount: number;
  fee: number;
  txSignature?: string;
  status: string;
  createdAt: string;
}

// API Request/Response types
export interface PlaceOrderRequest {
  marketId: string;
  side: OrderSide;
  outcome: Outcome;
  orderType: OrderType;
  price?: number;
  quantity: number;
  expiresIn?: number;
  isPrivate?: boolean;
}

export interface PlaceOrderResponse {
  orderId: string;
  status: string;
  txSignature?: string;
}

export interface CancelOrderResponse {
  success: boolean;
  txSignature?: string;
}

export interface ClaimWinningsResponse {
  amount: number;
  txSignature: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MarketFilters {
  status?: MarketStatus;
  category?: string;
  limit?: number;
  offset?: number;
  sort?: 'volume' | 'newest' | 'ending';
  order?: 'asc' | 'desc';
}

export interface OrderFilters {
  marketId?: string;
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}

// Wallet types
export type DepositSource = 'wallet' | 'blindfold' | 'jupiter';

export interface WalletBalance {
  available: number;
  locked: number;
  total: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

export interface DepositAddress {
  address: string;
  mint: string;
  memoRequired: boolean;
  memoFormat: string;
  network: string;
  minimumAmount: number;
}

export interface DepositRequest {
  amount: number;
  txSignature?: string;
  source: DepositSource;
}

export interface DepositResponse {
  transactionId: string;
  status: string;
  amount: number;
  depositAddress?: string;
}

export interface WithdrawRequest {
  amount: number;
  destination: string;
}

export interface WithdrawResponse {
  transactionId: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  estimatedCompletion: string;
}

// Notification types
export type NotificationType =
  | 'order_filled'
  | 'order_cancelled'
  | 'market_resolved'
  | 'position_liquidated'
  | 'deposit_confirmed'
  | 'withdrawal_completed'
  | 'price_alert'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  marketId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationPreferences {
  orderFills: boolean;
  marketResolutions: boolean;
  priceAlerts: boolean;
  systemAnnouncements: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// Leaderboard types
export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';
export type LeaderboardMetric = 'pnl' | 'volume' | 'trades' | 'win_rate';

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  username?: string;
  value: number;
  change?: number;
  previousRank?: number;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  entries: LeaderboardEntry[];
  updatedAt: string;
}

// Public profile types
export interface PublicProfile {
  wallet: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  joinedAt: string;
  stats: PublicProfileStats;
  badges: ProfileBadge[];
}

export interface PublicProfileStats {
  totalTrades: number;
  totalVolume: number;
  winRate: number;
  pnl30d: number;
  pnlAllTime: number;
  marketsTraded: number;
  bestTrade: number;
  worstTrade: number;
  currentStreak: number;
  longestStreak: number;
}

export interface ProfileBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export interface ProfileActivity {
  id: string;
  type: 'trade' | 'position_opened' | 'position_closed' | 'market_resolved';
  marketId: string;
  marketQuestion: string;
  outcome?: Outcome;
  amount?: number;
  pnl?: number;
  createdAt: string;
}
