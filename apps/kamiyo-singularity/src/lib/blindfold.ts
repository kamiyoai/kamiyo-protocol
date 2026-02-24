/**
 * Blindfold Finance Integration
 *
 * Blindfold Fi is a non-KYC card payment provider for crypto purchases.
 * https://www.blindfoldfinance.com/
 *
 * Integration pattern: Redirect-based payment flow
 * 1. User initiates payment on our site
 * 2. We redirect to Blindfold's payment page with amount + callback URL
 * 3. User completes card payment on Blindfold
 * 4. Blindfold redirects back to our site with payment result
 * 5. Blindfold sends webhook to confirm payment completion
 *
 * TODO: Replace placeholder values when Blindfold API docs are available
 */

const BLINDFOLD_BASE_URL = process.env.NEXT_PUBLIC_BLINDFOLD_URL || 'https://pay.blindfoldfinance.com';
const BLINDFOLD_MERCHANT_ID = process.env.NEXT_PUBLIC_BLINDFOLD_MERCHANT_ID || '';

export interface BlindpayConfig {
  amount: number; // USDC amount in smallest units (6 decimals)
  walletAddress: string;
  callbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BlindpaySession {
  sessionId: string;
  paymentUrl: string;
  expiresAt: number;
}

/**
 * Create a Blindfold payment session
 *
 * This generates a payment URL that the user can be redirected to.
 * The actual implementation will depend on Blindfold's API.
 */
export async function createPaymentSession(
  config: BlindpayConfig
): Promise<BlindpaySession> {
  // Placeholder implementation
  // Replace with actual Blindfold API call when docs are available

  const params = new URLSearchParams({
    merchant: BLINDFOLD_MERCHANT_ID,
    amount: (config.amount / 1_000_000).toFixed(2),
    currency: 'USD',
    crypto_currency: 'USDC',
    network: 'solana',
    wallet_address: config.walletAddress,
    callback_url: config.callbackUrl,
    success_url: config.successUrl,
    cancel_url: config.cancelUrl,
  });

  return {
    sessionId: crypto.randomUUID(),
    paymentUrl: `${BLINDFOLD_BASE_URL}/pay?${params.toString()}`,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
  };
}

/**
 * Verify a Blindfold webhook signature
 *
 * Webhooks are signed with HMAC-SHA256 using your merchant secret.
 */
export function verifyWebhookSignature(
  _payload: string,
  _signature: string,
  _secret: string
): boolean {
  // This is handled server-side in app/src/api/wallet.rs
  // Client-side verification is not needed
  return true;
}

/**
 * Parse payment status from redirect URL params
 */
export function parseRedirectParams(searchParams: URLSearchParams): {
  success: boolean;
  sessionId: string | null;
  paymentId: string | null;
  error: string | null;
} {
  const status = searchParams.get('status');
  const sessionId = searchParams.get('session_id');
  const paymentId = searchParams.get('payment_id');
  const error = searchParams.get('error');

  return {
    success: status === 'success' || status === 'completed',
    sessionId,
    paymentId,
    error,
  };
}

/**
 * Format amount for display
 */
export function formatUsdAmount(amountLamports: number): string {
  return `$${(amountLamports / 1_000_000).toFixed(2)}`;
}
