/**
 * KAMIYO PayAI Integration - Basic Payment Example (TypeScript)
 *
 * This example demonstrates how to:
 * 1. Request a paid endpoint
 * 2. Handle 402 Payment Required response
 * 3. Authorize payment via PayAI
 * 4. Retry with payment token
 * 5. Receive exploit intelligence data
 */

interface PaymentDetails {
  payment_required: boolean;
  endpoint: string;
  amount_usdc: number;
  payment_options: PaymentOption[];
}

interface PaymentOption {
  provider: string;
  type: string;
  priority: number;
  recommended: boolean;
  supported_chains?: string[];
  x402_standard?: X402Standard;
}

interface X402Standard {
  x402Version: number;
  error: string;
  accepts: PaymentAccept[];
}

interface PaymentAccept {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
}

interface ExploitData {
  exploits: Exploit[];
}

interface Exploit {
  tx_hash: string;
  chain: string;
  protocol?: string;
  amount_stolen_usd: number;
  attack_type?: string;
  timestamp: string;
}

// API Configuration
const API_BASE_URL = "https://api.kamiyo.ai";
const ENDPOINT = "/exploits";

/**
 * Request endpoint with automatic payment handling
 */
async function requestWithPayment(): Promise<ExploitData | null> {
  // Step 1: Request endpoint
  console.log(`📡 Requesting ${ENDPOINT}...`);
  let response = await fetch(`${API_BASE_URL}${ENDPOINT}`);

  // Step 2: Handle 402 Payment Required
  if (response.status === 402) {
    console.log("💰 Payment required!");
    const paymentDetails: PaymentDetails = await response.json();

    console.log(`   Amount: $${paymentDetails.amount_usdc} USDC`);
    console.log(`   Endpoint: ${paymentDetails.endpoint}`);
    console.log(`   Payment options: ${paymentDetails.payment_options.length}`);

    // Step 3: Get PayAI option
    const payaiOption = paymentDetails.payment_options.find(
      opt => opt.provider === "PayAI Network"
    );

    if (!payaiOption) {
      console.log("❌ PayAI option not available");
      return null;
    }

    console.log(`\n✅ Using PayAI Network`);
    console.log(`   Supported chains: ${payaiOption.supported_chains?.slice(0, 3).join(", ")}...`);

    // Step 4: Authorize payment
    const paymentToken = await authorizePayAIPayment(
      paymentDetails.endpoint,
      paymentDetails.amount_usdc,
      payaiOption
    );

    // Step 5: Retry with payment
    console.log(`\n🔄 Retrying with payment token...`);
    response = await fetch(`${API_BASE_URL}${ENDPOINT}`, {
      headers: {
        "X-PAYMENT": paymentToken
      }
    });

    if (response.status === 200) {
      const data: ExploitData = await response.json();
      console.log(`\n✅ Success! Received ${data.exploits.length} exploits`);
      return data;
    } else {
      console.log(`\n❌ Payment verification failed: ${response.status}`);
      return null;
    }
  } else if (response.status === 200) {
    // Already authenticated
    const data: ExploitData = await response.json();
    console.log(`✅ Success! Received ${data.exploits.length} exploits`);
    return data;
  } else {
    console.log(`❌ Error: ${response.status}`);
    return null;
  }
}

/**
 * Authorize payment via PayAI Network
 *
 * In production, replace this with actual PayAI SDK integration:
 * - Connect wallet (Phantom, MetaMask, etc.)
 * - Sign payment authorization
 * - Return base64-encoded payment token
 *
 * Example with PayAI SDK:
 * ```typescript
 * import { useX402 } from '@x402sdk/sdk';
 * const payment = await useX402(endpoint, amountUsdc, payaiOption.x402_standard);
 * return payment.token;
 * ```
 */
async function authorizePayAIPayment(
  endpoint: string,
  amountUsdc: number,
  payaiOption: PaymentOption
): Promise<string> {
  console.log(`\n💳 Authorizing payment...`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log(`   Amount: $${amountUsdc} USDC`);

  // Mock payment authorization
  // In production, use PayAI SDK or wallet integration
  const mockPayment = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      payer: "0xMockAddress",
      amount: String(Math.floor(amountUsdc * 1e6)),  // USDC has 6 decimals
      resource: endpoint
    }
  };

  const paymentToken = btoa(JSON.stringify(mockPayment));
  console.log(`   ✅ Payment authorized`);

  return paymentToken;
}

/**
 * Main example function
 */
async function main() {
  console.log("=".repeat(70));
  console.log("KAMIYO PAYAI INTEGRATION - BASIC PAYMENT EXAMPLE");
  console.log("=".repeat(70) + "\n");

  const result = await requestWithPayment();

  if (result) {
    console.log("\n📊 Exploit Data:");
    result.exploits.slice(0, 3).forEach(exploit => {  // Show first 3
      console.log(`\n   🔴 ${exploit.protocol || "Unknown"}`);
      console.log(`      Amount: $${exploit.amount_stolen_usd.toLocaleString()}`);
      console.log(`      Chain: ${exploit.chain}`);
      console.log(`      Type: ${exploit.attack_type || "unknown"}`);
    });
  }

  console.log("\n" + "=".repeat(70));
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { requestWithPayment, authorizePayAIPayment };
