export interface X402PaymentRequest {
  x402Version: number;
  accepts: X402Accept[];
  error: string;
  message?: string;
}

export interface X402Accept {
  scheme: 'exact' | 'range';
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  metadata?: Record<string, any>;
}

export interface X402Payment {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: X402Payload;
}

export interface X402Payload {
  signature: string;
  amount: string;
  recipient: string;
  timestamp?: number;
  memo?: string;
}

export interface X402PaymentResponse {
  txHash: string;
  networkId: string;
  success: boolean;
  amount?: string;
  timestamp: number;
  resourceAccess?: {
    expiresAt: number;
    requestsRemaining: number;
  };
}

export interface X402Error {
  x402Version: number;
  error: string;
  code: number;
  details?: string;
}
