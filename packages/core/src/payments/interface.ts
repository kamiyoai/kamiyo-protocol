export interface Balance {
  available: number;
  locked: number;
  currency: string;
}

export interface PaymentParams {
  amount: number;
  currency: string;
  recipient: string;
  agentId: string;
  memo?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  reason?: string;
}

export interface RevenueParams {
  totalAmount: number;
  currency: string;
  shares: Array<{
    recipient: string;
    percentage: number;
  }>;
}

export interface PaymentProvider {
  processPayment(params: PaymentParams): Promise<PaymentResult>;
  getBalance(address: string): Promise<Balance>;
  distributeRevenue(params: RevenueParams): Promise<void>;
  checkAccess(agentId: string, feature: string): Promise<boolean>;
  unlockFeature(agentId: string, feature: string): Promise<void>;
}
