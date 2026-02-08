import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import {
  UnifiedMiddlewareConfig,
  PrepareRequest,
  VerifyResult,
  TARS_PROGRAM_ID,
} from './types';
import { TarsBridge, createTarsBridge } from './bridge';
import { deriveAgentPda, deriveJobPda } from './job-linker';

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

function canonicalizeNetwork(network: string): string | null {
  const normalized = network.trim().toLowerCase();
  if (
    normalized === 'solana' ||
    normalized === 'solana:mainnet' ||
    normalized === 'solana:mainnet-beta' ||
    normalized === SOLANA_MAINNET_CAIP2
  ) {
    return SOLANA_MAINNET_CAIP2;
  }
  if (
    normalized === 'solana-devnet' ||
    normalized === 'solana:devnet' ||
    normalized === SOLANA_DEVNET_CAIP2
  ) {
    return SOLANA_DEVNET_CAIP2;
  }
  return null;
}

function getPaymentHeader(req: MiddlewareRequest): string | undefined {
  return (
    req.header('PAYMENT-SIGNATURE') ||
    req.header('X-PAYMENT-SIGNATURE') ||
    req.header('X-PAYMENT')
  );
}

export type MiddlewareRequest = {
  method: string;
  path: string;
  originalUrl: string;
  protocol: string;
  headers: {
    host?: string;
    'x-payment'?: string;
    'user-agent'?: string;
    accept?: string;
  };
  header: (name: string) => string | undefined;
  body?: Record<string, unknown>;
};

export type MiddlewareResponse = {
  status: (code: number) => MiddlewareResponse;
  json: (body: unknown) => void;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
  headersSent: boolean;
  statusCode: number;
  end: (...args: unknown[]) => MiddlewareResponse;
};

export type NextFunction = (err?: unknown) => void | Promise<void>;

export interface UnifiedPaymentAccepts {
  x402Version: number;
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
  description?: string;
  extra?: {
    feePayer?: string;
    tarsEnabled?: boolean;
    kamiyoEnabled?: boolean;
    minReputation?: number;
  };
}

export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    transaction?: string;
  };
}

export interface FacilitatorClient {
  verify(payload: PaymentPayload, requirements: UnifiedPaymentAccepts): Promise<VerifyResult>;
  settle(payload: PaymentPayload, requirements: UnifiedPaymentAccepts): Promise<{
    success: boolean;
    transaction?: string;
    errorReason?: string;
    jobId?: string;
  }>;
  supported(): Promise<{ kinds: Array<{ network: string; scheme: string; extra?: { feePayer?: string } }> }>;
}

async function createFacilitatorClient(facilitatorUrl: string): Promise<FacilitatorClient> {
  return {
    async verify(payload, requirements): Promise<VerifyResult> {
      const response = await fetch(`${facilitatorUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
      });
      return response.json() as Promise<VerifyResult>;
    },
    async settle(payload, requirements): Promise<{ success: boolean; transaction?: string; errorReason?: string; jobId?: string }> {
      const response = await fetch(`${facilitatorUrl}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
      });
      return response.json() as Promise<{ success: boolean; transaction?: string; errorReason?: string; jobId?: string }>;
    },
    async supported(): Promise<{ kinds: Array<{ network: string; scheme: string; extra?: { feePayer?: string } }> }> {
      const response = await fetch(`${facilitatorUrl}/supported`);
      return response.json() as Promise<{ kinds: Array<{ network: string; scheme: string; extra?: { feePayer?: string } }> }>;
    },
  };
}

function decodePaymentHeader(header: string): PaymentPayload {
  const decoded = Buffer.from(header, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

function parsePrice(price: string | number): string {
  if (typeof price === 'number') {
    return Math.floor(price * 1_000_000).toString();
  }
  if (price.startsWith('$')) {
    const amount = parseFloat(price.slice(1));
    return Math.floor(amount * 1_000_000).toString();
  }
  return price;
}

export function kamiyoTarsMiddleware(config: UnifiedMiddlewareConfig) {
  const {
    payTo,
    tarsEnabled,
    kamiyoEscrowEnabled,
    minReputation,
    price,
    network,
    facilitatorUrl = 'https://x402.org/facilitator',
  } = config;

  const canonicalNetwork = canonicalizeNetwork(network);
  if (!canonicalNetwork) {
    throw new Error(`Unsupported network: ${network}`);
  }

  let facilitator: FacilitatorClient | null = null;
  let feePayer: string | undefined;

  const initialize = async () => {
    if (!facilitator) {
      facilitator = await createFacilitatorClient(facilitatorUrl);
      const supported = await facilitator.supported();
      const networkSupport = supported.kinds.find(
        (k) => canonicalizeNetwork(k.network) === canonicalNetwork && k.scheme === 'exact'
      );
      feePayer = networkSupport?.extra?.feePayer;
    }
  };

  return async function unifiedPaymentMiddleware(
    req: MiddlewareRequest,
    res: MiddlewareResponse,
    next: NextFunction
  ): Promise<void> {
    await initialize();

    const maxAmountRequired = parsePrice(price);
    const resourceUrl = `${req.protocol}://${req.headers.host}${req.path}`;

    const paymentRequirements: UnifiedPaymentAccepts = {
      x402Version: 2,
      scheme: 'exact',
      network: canonicalNetwork,
      maxAmountRequired,
      resource: resourceUrl,
      payTo,
      asset: canonicalNetwork.startsWith('solana:')
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      extra: {
        feePayer,
        tarsEnabled,
        kamiyoEnabled: kamiyoEscrowEnabled,
        minReputation,
      },
    };

    const payment = getPaymentHeader(req);
    const userAgent = req.header('User-Agent') || '';
    const acceptHeader = req.header('Accept') || '';
    const isWebBrowser = acceptHeader.includes('text/html') && userAgent.includes('Mozilla');

    if (!payment) {
      if (isWebBrowser) {
        res.status(402).send(generatePaywallHtml(paymentRequirements, resourceUrl));
        return;
      }

      res.status(402).json({
        x402Version: 2,
        error: 'Payment header is required',
        accepts: [paymentRequirements],
      });
      return;
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = decodePaymentHeader(payment);
      decodedPayment.x402Version = 2;
    } catch {
      res.status(402).json({
        x402Version: 2,
        error: 'Invalid or malformed payment header',
        accepts: [paymentRequirements],
      });
      return;
    }

    try {
      const verifyResult = await facilitator!.verify(decodedPayment, paymentRequirements);

      if (!verifyResult.isValid) {
        res.status(402).json({
          x402Version: 2,
          error: verifyResult.invalidReason,
          accepts: [paymentRequirements],
          payer: verifyResult.payer,
        });
        return;
      }
    } catch (error) {
      res.status(402).json({
        x402Version: 2,
        error: error instanceof Error ? error.message : 'Verification failed',
        accepts: [paymentRequirements],
      });
      return;
    }

    const originalEnd = res.end.bind(res);
    let capturedArgs: unknown[] = [];

    res.end = function (...args: unknown[]) {
      capturedArgs = args;
      return res;
    };

    await next();

    if (res.statusCode >= 400) {
      res.end = originalEnd;
      if (capturedArgs.length > 0) {
        originalEnd(...capturedArgs);
      }
      return;
    }

    try {
      const settleResult = await facilitator!.settle(decodedPayment, paymentRequirements);

      res.setHeader('X-PAYMENT-RESPONSE', JSON.stringify({
        success: settleResult.success,
        transaction: settleResult.transaction,
      }));

      if (settleResult.jobId) {
        res.setHeader('X-JOB-ID', settleResult.jobId);
      }

      if (!settleResult.success) {
        res.status(402).json({
          x402Version: 2,
          error: settleResult.errorReason,
          accepts: [paymentRequirements],
        });
        return;
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(402).json({
          x402Version: 2,
          error: error instanceof Error ? error.message : 'Settlement failed',
          accepts: [paymentRequirements],
        });
        return;
      }
    } finally {
      res.end = originalEnd;
      if (capturedArgs.length > 0) {
        originalEnd(...capturedArgs);
      }
    }
  };
}

function generatePaywallHtml(requirements: UnifiedPaymentAccepts, resourceUrl: string): string {
  const amount = (parseInt(requirements.maxAmountRequired) / 1_000_000).toFixed(2);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Payment Required</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
    h1 { color: #333; }
    .amount { font-size: 2em; color: #0066cc; margin: 20px 0; }
    .details { color: #666; font-size: 0.9em; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; margin: 2px; }
    .tars { background: #e3f2fd; color: #1565c0; }
    .kamiyo { background: #f3e5f5; color: #7b1fa2; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Payment Required</h1>
    <div class="amount">$${amount} USDC</div>
    <p>To access: ${resourceUrl}</p>
    <div class="details">
      <p>Network: ${requirements.network}</p>
      <p>Pay to: ${requirements.payTo.slice(0, 8)}...${requirements.payTo.slice(-6)}</p>
      ${requirements.extra?.tarsEnabled ? '<span class="badge tars">TARS Tracking</span>' : ''}
      ${requirements.extra?.kamiyoEnabled ? '<span class="badge kamiyo">KAMIYO Escrow</span>' : ''}
      ${requirements.extra?.minReputation ? `<p>Min reputation: ${requirements.extra.minReputation}</p>` : ''}
    </div>
    <p><small>Use an x402-compatible wallet to make this payment</small></p>
  </div>
</body>
</html>`;
}

export function createUnifiedMiddleware(config: UnifiedMiddlewareConfig) {
  return kamiyoTarsMiddleware(config);
}
