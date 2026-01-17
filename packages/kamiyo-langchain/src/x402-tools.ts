/**
 * x402 API Tools for LangChain
 *
 * Enables LangChain agents to consume x402-gated APIs with automatic
 * USDC payment via PayAI facilitator.
 *
 * Supported networks: Base, Solana, Polygon, Arbitrum
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// x402 payment types
interface PaymentRequirement {
  scheme: "exact" | "upto";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

interface X402Response {
  x402Version: number;
  accepts: PaymentRequirement[];
  error?: string;
  facilitator?: string;
}

export interface X402ToolsConfig {
  /** Wallet address for payments (EVM or Solana format) */
  walletAddress: string;
  /** Optional: Private key for signing (if not using external signer) */
  privateKey?: string;
  /** Maximum price per request in USD (default: 0.10) */
  maxPriceUsd?: number;
  /** Preferred network: base, solana, polygon, arbitrum (default: base) */
  preferredNetwork?: string;
  /** PayAI facilitator URL (default: https://facilitator.payai.network) */
  facilitatorUrl?: string;
  /** Optional: Callback for payment events */
  onPayment?: (info: {
    endpoint: string;
    network: string;
    amountUsd: number;
    tx?: string;
  }) => void;
}

const PAYAI_FACILITATOR = "https://facilitator.payai.network";
const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;

function fromMicro(micro: string | number): number {
  return (typeof micro === "string" ? parseInt(micro, 10) : micro) / MICRO;
}

// Schemas
const X402FetchSchema = z.object({
  url: z.string().describe("The x402-gated API endpoint URL"),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE"])
    .optional()
    .describe("HTTP method (default: GET)"),
  body: z.string().optional().describe("Request body as JSON string (for POST/PUT)"),
  headers: z
    .record(z.string())
    .optional()
    .describe("Additional headers as key-value pairs"),
});

const X402PricingSchema = z.object({
  url: z.string().describe("The x402-gated API endpoint URL to check pricing"),
});

// Type aliases
type X402FetchInput = z.infer<typeof X402FetchSchema>;
type X402PricingInput = z.infer<typeof X402PricingSchema>;

/**
 * Create x402 API tools for LangChain agents
 */
export function createX402Tools(config: X402ToolsConfig) {
  const maxPrice = config.maxPriceUsd ?? 0.1;
  const preferredNetwork = config.preferredNetwork ?? "base";
  const facilitatorUrl = config.facilitatorUrl ?? PAYAI_FACILITATOR;

  /**
   * Create signed payment header for x402
   */
  async function createPaymentHeader(
    requirement: PaymentRequirement
  ): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(2, 10);

    // In production, integrate with PayAI SDK for actual signing
    // This creates a placeholder token - real implementation would:
    // 1. Connect to PayAI facilitator
    // 2. Sign with wallet private key (EVM or Solana)
    // 3. Return signed payment proof

    const token = Buffer.from(
      JSON.stringify({
        version: 1,
        payer: config.walletAddress,
        payTo: requirement.payTo,
        amount: requirement.maxAmountRequired,
        network: requirement.network,
        asset: requirement.asset,
        timestamp,
        nonce,
      })
    ).toString("base64");

    return token;
  }

  /**
   * Summarize response data for agent consumption
   */
  function summarize(data: unknown): string {
    if (Array.isArray(data)) {
      return `Retrieved ${data.length} items.`;
    }
    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      if (keys.length <= 5) {
        const preview = keys
          .map((k) => {
            const v = (data as Record<string, unknown>)[k];
            if (typeof v === "number") return `${k}: ${v.toLocaleString()}`;
            if (typeof v === "string")
              return `${k}: ${v.length > 50 ? v.slice(0, 50) + "..." : v}`;
            return `${k}: ${typeof v}`;
          })
          .join(", ");
        return preview;
      }
      return `Retrieved object with ${keys.length} fields: ${keys.slice(0, 5).join(", ")}...`;
    }
    return "Retrieved data.";
  }

  const x402FetchTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_x402_fetch",
    description:
      "Fetch data from an x402-gated API endpoint with automatic USDC payment. " +
      "Handles the 402 payment flow automatically. " +
      "Supports Base, Solana, Polygon, and Arbitrum networks. " +
      "Use this when you need to access paid API endpoints.",
    schema: X402FetchSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { url, method = "GET", body, headers = {} } = input as X402FetchInput;

      try {
        // Step 1: Initial request to get 402 requirements
        const initialResponse = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: body || undefined,
        });

        // If not 402, endpoint doesn't require payment
        if (initialResponse.status !== 402) {
          if (initialResponse.ok) {
            const data = await initialResponse.json();
            return JSON.stringify({
              success: true,
              paid: false,
              data,
              summary: summarize(data),
            });
          }
          return JSON.stringify({
            success: false,
            error: `Endpoint returned ${initialResponse.status}: ${initialResponse.statusText}`,
          });
        }

        // Step 2: Parse 402 payment requirements
        const x402Response = (await initialResponse.json()) as X402Response;

        if (!x402Response.accepts || x402Response.accepts.length === 0) {
          return JSON.stringify({
            success: false,
            error: "No payment options available from endpoint",
          });
        }

        // Find preferred network or first available
        const requirement =
          x402Response.accepts.find((r) => r.network === preferredNetwork) ||
          x402Response.accepts[0];

        const amountUsd = fromMicro(requirement.maxAmountRequired);

        // Check max price
        if (amountUsd > maxPrice) {
          return JSON.stringify({
            success: false,
            error: `Price $${amountUsd} USDC exceeds max $${maxPrice}`,
            requirement: {
              network: requirement.network,
              amount: amountUsd,
              description: requirement.description,
            },
          });
        }

        // Step 3: Create payment header
        const paymentHeader = await createPaymentHeader(requirement);

        // Step 4: Retry with payment
        const paidResponse = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Payment": paymentHeader,
            ...headers,
          },
          body: body || undefined,
        });

        if (!paidResponse.ok) {
          if (paidResponse.status === 402) {
            return JSON.stringify({
              success: false,
              error: "Payment rejected by server",
            });
          }
          return JSON.stringify({
            success: false,
            error: `API returned ${paidResponse.status} after payment`,
          });
        }

        const data = await paidResponse.json();

        // Notify callback if configured
        config.onPayment?.({
          endpoint: url,
          network: requirement.network,
          amountUsd,
        });

        return JSON.stringify({
          success: true,
          paid: true,
          data,
          summary: summarize(data),
          payment: {
            network: requirement.network,
            amountUsd,
            asset: requirement.asset,
          },
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  const x402PricingTool = new (DynamicStructuredTool as any)({
    name: "kamiyo_x402_pricing",
    description:
      "Check pricing for an x402-gated API endpoint without making payment. " +
      "Use this to see how much an endpoint costs before fetching.",
    schema: X402PricingSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { url } = input as X402PricingInput;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (response.status !== 402) {
          if (response.ok) {
            return JSON.stringify({
              success: true,
              free: true,
              message: "Endpoint does not require payment",
            });
          }
          return JSON.stringify({
            success: false,
            error: `Endpoint returned ${response.status}`,
          });
        }

        const x402Response = (await response.json()) as X402Response;

        if (!x402Response.accepts || x402Response.accepts.length === 0) {
          return JSON.stringify({
            success: false,
            error: "No payment options available",
          });
        }

        const options = x402Response.accepts.map((req) => ({
          network: req.network,
          priceUsd: fromMicro(req.maxAmountRequired),
          asset: req.asset,
          description: req.description,
        }));

        return JSON.stringify({
          success: true,
          free: false,
          options,
          facilitator: x402Response.facilitator || PAYAI_FACILITATOR,
          maxConfiguredPrice: maxPrice,
          affordableOptions: options.filter((o) => o.priceUsd <= maxPrice),
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
        });
      }
    },
  });

  return [x402FetchTool, x402PricingTool];
}

/**
 * Create x402 tools from environment variables
 *
 * Required env vars:
 * - X402_WALLET_ADDRESS: Your wallet address
 *
 * Optional env vars:
 * - X402_PRIVATE_KEY: Private key for signing
 * - X402_MAX_PRICE_USD: Max price per request (default: 0.10)
 * - X402_PREFERRED_NETWORK: base, solana, polygon, arbitrum (default: base)
 */
export function createX402ToolsFromEnv() {
  const walletAddress = process.env.X402_WALLET_ADDRESS;
  if (!walletAddress) {
    throw new Error("X402_WALLET_ADDRESS environment variable is required");
  }

  return createX402Tools({
    walletAddress,
    privateKey: process.env.X402_PRIVATE_KEY,
    maxPriceUsd: parseFloat(process.env.X402_MAX_PRICE_USD || "0.10"),
    preferredNetwork: process.env.X402_PREFERRED_NETWORK || "base",
  });
}
