import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createSignedPayment,
  createPaymentHeader,
  generateTransactionId,
} from "@kamiyo/x402-client";

interface PaymentRequirement {
  scheme: "exact";
  network: string; // CAIP-2
  amount: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extensions?: Record<string, unknown>;
}

interface X402Response {
  x402Version: 2;
  accepts: PaymentRequirement[];
  error?: string;
  facilitator?: string;
}

export interface X402ToolsConfig {
  wallet: Keypair;
  connection: Connection;
  maxPriceUsd?: number;
  preferredNetwork?: string;
  onPayment?: (info: {
    endpoint: string;
    network: string;
    amountUsd: number;
    transactionId: string;
  }) => void;
}

const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;
const SOL_PRICE_USD = 150; // Approximate, should fetch from oracle in production

function fromMicro(micro: string | number): number {
  return (typeof micro === "string" ? parseInt(micro, 10) : micro) / MICRO;
}

function usdToLamports(usd: number): number {
  return Math.ceil((usd / SOL_PRICE_USD) * LAMPORTS_PER_SOL);
}

const X402FetchSchema = z.object({
  url: z.string().describe("API endpoint URL"),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional(),
  body: z.string().optional().describe("JSON body for POST/PUT"),
  headers: z.record(z.string()).optional(),
});

const X402PricingSchema = z.object({
  url: z.string().describe("API endpoint URL"),
});

type X402FetchInput = z.infer<typeof X402FetchSchema>;
type X402PricingInput = z.infer<typeof X402PricingSchema>;

export function createX402Tools(config: X402ToolsConfig) {
  const maxPrice = config.maxPriceUsd ?? 0.1;
  const preferredNetwork = config.preferredNetwork ?? "solana:mainnet";

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
    description: "Fetch data from an x402-gated API with automatic USDC payment.",
    schema: X402FetchSchema as z.ZodObject<any>,
    func: async (input: Record<string, any>): Promise<string> => {
      const { url, method = "GET", body, headers = {} } = input as X402FetchInput;

      try {
        const initialResponse = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: body || undefined,
        });

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

        const x402Response = (await initialResponse.json()) as X402Response;

        if (!x402Response.accepts || x402Response.accepts.length === 0) {
          return JSON.stringify({
            success: false,
            error: "No payment options available from endpoint",
          });
        }

        const requirement =
          x402Response.accepts.find((r) => r.network === preferredNetwork) ||
          x402Response.accepts[0];

        const amountUsd = fromMicro(requirement.amount);

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

        // Check balance
        const balance = await config.connection.getBalance(config.wallet.publicKey);
        const amountLamports = usdToLamports(amountUsd);

        if (balance < amountLamports + 5000) {
          return JSON.stringify({
            success: false,
            error: `Insufficient balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
          });
        }

        // Create signed payment header
        const transactionId = generateTransactionId();
        const signedPayment = createSignedPayment(
          config.wallet,
          transactionId,
          url,
          amountLamports
        );
        const paymentHeader = createPaymentHeader(signedPayment, config.wallet, requirement.network);

        const paidResponse = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-PAYMENT": paymentHeader,
            "PAYMENT-SIGNATURE": paymentHeader, // Backward compat
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

        config.onPayment?.({
          endpoint: url,
          network: requirement.network,
          amountUsd,
          transactionId,
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
            transactionId,
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
    description: "Check pricing for an x402-gated API without paying.",
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
          priceUsd: fromMicro(req.amount),
          asset: req.asset,
          description: req.description,
        }));

        return JSON.stringify({
          success: true,
          free: false,
          options,
          facilitator: x402Response.facilitator,
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
 * Create config from keypair and connection
 */
export function createX402ToolsConfig(
  wallet: Keypair,
  connection: Connection,
  options?: {
    maxPriceUsd?: number;
    preferredNetwork?: string;
    onPayment?: X402ToolsConfig["onPayment"];
  }
): X402ToolsConfig {
  return {
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd ?? 0.1,
    preferredNetwork: options?.preferredNetwork ?? "solana:mainnet",
    onPayment: options?.onPayment,
  };
}

/**
 * Create x402 tools from environment variables.
 * Requires SOLANA_PRIVATE_KEY (base64) and optionally SOLANA_RPC_URL.
 */
export function createX402ToolsFromEnv(options?: {
  maxPriceUsd?: number;
  preferredNetwork?: string;
  onPayment?: X402ToolsConfig["onPayment"];
}) {
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("SOLANA_PRIVATE_KEY environment variable required");
  }

  const keyBytes = Buffer.from(privateKey, "base64");
  const wallet = Keypair.fromSecretKey(keyBytes);
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl);

  return createX402Tools({
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd,
    preferredNetwork: options?.preferredNetwork,
    onPayment: options?.onPayment,
  });
}
