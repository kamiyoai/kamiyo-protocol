import type {
  Market,
  Order,
  Position,
  OrderBook,
  Trade,
  User,
  Transaction,
  PlaceOrderRequest,
  PlaceOrderResponse,
  CancelOrderResponse,
  ClaimWinningsResponse,
  PaginatedResponse,
  MarketFilters,
  OrderFilters,
  Outcome,
  WalletBalance,
  DepositAddress,
  DepositRequest,
  DepositResponse,
  WithdrawRequest,
  WithdrawResponse,
  Notification,
  NotificationPreferences,
  Leaderboard,
  LeaderboardPeriod,
  LeaderboardMetric,
  PublicProfile,
  ProfileActivity,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Access token stored in memory only (XSS-safe)
// Refresh token stored in httpOnly cookie (handled by /api/auth)
class ApiClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private refreshPromise: Promise<void> | null = null;

  setAccessToken(accessToken: string, expiresAt?: number) {
    this.accessToken = accessToken;
    this.tokenExpiresAt = expiresAt || Date.now() + 15 * 60 * 1000; // Default 15 min
  }

  clearAccessToken() {
    this.accessToken = null;
    this.tokenExpiresAt = null;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return true;
    // Refresh if less than 1 minute remaining
    return Date.now() > this.tokenExpiresAt - 60 * 1000;
  }

  // Check if we have a refresh token (httpOnly cookie)
  async checkSession(): Promise<boolean> {
    try {
      const res = await fetch('/api/auth', { method: 'GET' });
      const data = await res.json();
      return data.hasRefreshToken;
    } catch {
      return false;
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    skipRefresh = false
  ): Promise<T> {
    // Auto-refresh token if expiring soon
    if (!skipRefresh && this.accessToken && this.isTokenExpiringSoon()) {
      await this.refreshSession();
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    // Handle 401 by attempting token refresh
    if (res.status === 401 && !skipRefresh && this.accessToken) {
      try {
        await this.refreshSession();
        // Retry request with new token
        return this.request(path, options, true);
      } catch {
        this.clearAccessToken();
        throw new ApiError(401, 'Session expired');
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return res.json();
  }

  // Refresh access token using httpOnly cookie
  private async refreshSession(): Promise<void> {
    // Prevent concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth', { method: 'PUT' });
        if (!res.ok) {
          this.clearAccessToken();
          throw new Error('Refresh failed');
        }
        const data = await res.json();
        this.setAccessToken(data.accessToken, data.expiresAt);
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private buildQuery(params: Record<string, unknown> | object): string {
    const filtered = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null
    );
    if (filtered.length === 0) return '';
    return '?' + new URLSearchParams(
      filtered.map(([k, v]) => [k, String(v)])
    ).toString();
  }

  // Markets
  async getMarkets(filters?: MarketFilters): Promise<PaginatedResponse<Market>> {
    const query = this.buildQuery(filters || {});
    return this.request(`/markets${query}`);
  }

  async getMarket(id: string): Promise<Market> {
    return this.request(`/markets/${id}`);
  }

  async getOrderBook(
    marketId: string,
    outcome: Outcome,
    depth = 20
  ): Promise<OrderBook> {
    return this.request(
      `/markets/${marketId}/orderbook?outcome=${outcome}&depth=${depth}`
    );
  }

  async getTrades(
    marketId: string,
    params?: { outcome?: Outcome; limit?: number; before?: string }
  ): Promise<PaginatedResponse<Trade>> {
    const query = this.buildQuery(params || {});
    return this.request(`/markets/${marketId}/trades${query}`);
  }

  // Orders
  async getOrders(filters?: OrderFilters): Promise<PaginatedResponse<Order>> {
    const query = this.buildQuery(filters || {});
    return this.request(`/orders${query}`);
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.request(`/orders/${orderId}`);
  }

  async placeOrder(data: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelOrder(orderId: string): Promise<CancelOrderResponse> {
    return this.request(`/orders/${orderId}`, {
      method: 'DELETE',
    });
  }

  // Positions
  async getPositions(): Promise<PaginatedResponse<Position>> {
    return this.request<PaginatedResponse<Position>>('/positions');
  }

  async getPosition(marketId: string): Promise<Position> {
    return this.request(`/positions/${marketId}`);
  }

  async claimWinnings(marketId: string): Promise<ClaimWinningsResponse> {
    return this.request(`/positions/${marketId}/claim`, {
      method: 'POST',
    });
  }

  // User
  async getProfile(): Promise<User> {
    return this.request('/user/profile');
  }

  async getTransactions(params?: {
    limit?: number;
    offset?: number;
    txType?: string;
  }): Promise<PaginatedResponse<Transaction>> {
    const query = this.buildQuery(params || {});
    return this.request(`/user/transactions${query}`);
  }

  // Wallet
  async getWalletBalance(): Promise<WalletBalance> {
    return this.request('/wallet/balance');
  }

  async getDepositAddress(): Promise<DepositAddress> {
    return this.request('/wallet/deposit/address');
  }

  async deposit(data: DepositRequest): Promise<DepositResponse> {
    return this.request('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async withdraw(data: WithdrawRequest): Promise<WithdrawResponse> {
    return this.request('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Auth
  async getNonce(): Promise<string> {
    const res = await this.request<{ nonce: string }>('/auth/nonce', {}, true);
    return res.nonce;
  }

  async login(
    wallet: string,
    signature: string,
    message: string
  ): Promise<{ accessToken: string; expiresAt: number }> {
    // Use Next.js API route which sets httpOnly cookie for refresh token
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, signature, message }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new ApiError(res.status, data.error || 'Login failed');
    }

    const data = await res.json();
    this.setAccessToken(data.accessToken, data.expiresAt);
    return data;
  }

  async refresh(): Promise<{ accessToken: string; expiresAt: number }> {
    const res = await fetch('/api/auth', { method: 'PUT' });

    if (!res.ok) {
      this.clearAccessToken();
      throw new ApiError(res.status, 'Token refresh failed');
    }

    const data = await res.json();
    this.setAccessToken(data.accessToken, data.expiresAt);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } finally {
      this.clearAccessToken();
    }
  }

  // Restore session on page load (if refresh token exists)
  async restoreSession(): Promise<boolean> {
    const hasToken = await this.checkSession();
    if (hasToken) {
      try {
        await this.refresh();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // Notifications
  async getNotifications(params?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Promise<PaginatedResponse<Notification>> {
    const query = this.buildQuery(params || {});
    return this.request(`/notifications${query}`);
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return this.request('/notifications/unread-count');
  }

  async markAsRead(notificationId: string): Promise<void> {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    });
  }

  async markAllAsRead(): Promise<void> {
    return this.request('/notifications/read-all', {
      method: 'PUT',
    });
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.request('/notifications/preferences');
  }

  async updateNotificationPreferences(
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return this.request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  // Leaderboards
  async getLeaderboard(
    period: LeaderboardPeriod = 'weekly',
    metric: LeaderboardMetric = 'pnl',
    limit = 100
  ): Promise<Leaderboard> {
    return this.request(`/leaderboard?period=${period}&metric=${metric}&limit=${limit}`);
  }

  async getUserRank(
    wallet: string,
    period: LeaderboardPeriod = 'weekly',
    metric: LeaderboardMetric = 'pnl'
  ): Promise<{ rank: number; value: number }> {
    return this.request(`/leaderboard/rank/${wallet}?period=${period}&metric=${metric}`);
  }

  // Public profiles
  async getPublicProfile(wallet: string): Promise<PublicProfile> {
    return this.request(`/profiles/${wallet}`);
  }

  async getProfileActivity(
    wallet: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<ProfileActivity>> {
    const query = this.buildQuery(params || {});
    return this.request(`/profiles/${wallet}/activity${query}`);
  }

  async getProfilePositions(wallet: string): Promise<PaginatedResponse<Position>> {
    return this.request(`/profiles/${wallet}/positions`);
  }
}

export const api = new ApiClient();
export { ApiError };
