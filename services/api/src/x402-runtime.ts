import type { IncomingHttpHeaders } from 'node:http';
import { createPayAIFacilitator, PayAIFacilitator, type PayAINetwork } from '@kamiyo/x402-client';
import { COMPANION_X402_NETWORKS, getX402Capability } from './core-capabilities';
import { logger } from './logger';

export type X402HeaderType = 'missing' | 'payment-signature' | 'x-payment';

export interface X402PaymentHeader {
  type: X402HeaderType;
  value: string | null;
}

export interface SettledX402Payment {
  payer?: string;
  network?: string;
  amount?: string;
  tx?: string;
  headerType: Exclude<X402HeaderType, 'missing'>;
}

export const SUPPORTED_X402_NETWORKS: PayAINetwork[] = [...COMPANION_X402_NETWORKS];

let facilitator: PayAIFacilitator | null = null;

function readHeader(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return null;
}

export function initX402Gateway(): void {
  const capability = getX402Capability();
  facilitator = null;

  if (!capability.enabled || !capability.merchantWallet) {
    return;
  }

  facilitator = createPayAIFacilitator(capability.merchantWallet, {
    defaultNetwork: 'base',
    onVerified: (result) => {
      logger.info('x402 payment verified', {
        valid: result.valid,
        payer: result.payer?.slice(0, 10),
        network: result.network,
        amount: result.amount,
      });
    },
    onSettled: (result) => {
      logger.info('x402 payment settled', {
        success: result.success,
        tx: result.tx?.slice(0, 16),
        network: result.network,
      });
    },
    onError: (error) => {
      logger.error('x402 payment error', { code: error.code, message: error.message });
    },
  });

  logger.info('x402 payment gateway initialized', {
    merchant: `${capability.merchantWallet.slice(0, 10)}...`,
    networks: SUPPORTED_X402_NETWORKS.join(', '),
  });
}

export function getX402Gateway(): PayAIFacilitator | null {
  return facilitator;
}

export function isX402Available(): boolean {
  return facilitator !== null;
}

export function getX402PaymentHeader(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>
): X402PaymentHeader {
  const paymentSignature = readHeader(headers, 'payment-signature');
  if (paymentSignature) {
    return { type: 'payment-signature', value: paymentSignature };
  }

  const legacyHeader = readHeader(headers, 'x-payment');
  if (legacyHeader) {
    return { type: 'x-payment', value: legacyHeader };
  }

  return { type: 'missing', value: null };
}

export function getX402Challenge(
  resource: string,
  priceUsd: number,
  description: string,
  networks: readonly PayAINetwork[] = SUPPORTED_X402_NETWORKS
): { body: Record<string, unknown>; headers: Record<string, string> } {
  if (!facilitator) {
    throw new Error('x402 gateway not configured');
  }

  return {
    body: facilitator.response402(resource, priceUsd, description, [...networks]) as unknown as Record<string, unknown>,
    headers: facilitator.headers402(),
  };
}

export async function verifyAndSettleX402Payment(
  paymentHeader: X402PaymentHeader,
  resource: string,
  priceUsd: number,
  description: string,
  networks: readonly PayAINetwork[] = SUPPORTED_X402_NETWORKS
): Promise<{ ok: true; payment: SettledX402Payment } | { ok: false; verifyError?: string }> {
  if (!facilitator) {
    throw new Error('x402 gateway not configured');
  }

  if (paymentHeader.type === 'missing' || !paymentHeader.value) {
    return { ok: false };
  }

  const requirements = facilitator.requirements(resource, priceUsd, description, [...networks]);
  let verifyError: string | undefined;

  for (const requirement of requirements) {
    try {
      const { verify, settle } = await facilitator.verifyAndSettle(paymentHeader.value, requirement);
      if (verify.valid && settle?.success) {
        return {
          ok: true,
          payment: {
            payer: verify.payer,
            network: verify.network,
            amount: verify.amount,
            tx: settle.tx,
            headerType: paymentHeader.type,
          },
        };
      }

      if (!verify.valid && verify.reason) {
        verifyError = verify.reason;
      }
    } catch (error) {
      verifyError = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, verifyError };
}
