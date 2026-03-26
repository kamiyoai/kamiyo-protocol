import { PayAIFacilitator } from '@kamiyo/x402-client';

import { CREDITS_PRICING, getMcpCapability, getX402Capability, resolveX402SupportedNetworks } from './core-capabilities';
import { getSapAgentUri, getSapHealthEndpoint, getSapMcpEndpoint, getSapPricingEndpoint } from './sap';

function getNetworkManifest() {
  return resolveX402SupportedNetworks().map((network) => ({
    name: network,
    chainId: PayAIFacilitator.getChainId(network),
    usdc: PayAIFacilitator.getUsdcAddress(network),
  }));
}

export function getX402DiscoveryDocument(baseUrl = getMcpCapability().publicBaseUrl) {
  const capability = getX402Capability();

  return {
    version: 2,
    name: 'KAMIYO Companion API',
    description: 'x402 discovery document for the KAMIYO paid API and SAP execution surfaces.',
    enabled: capability.enabled,
    status: capability.state,
    reason: capability.reason,
    facilitator: PayAIFacilitator.URL,
    merchant: capability.merchantWallet,
    networks: getNetworkManifest(),
    resources: [
      {
        path: '/api/paid/chat',
        method: 'POST',
        asset: 'USDC',
        priceUsd: CREDITS_PRICING.chat.usd,
        paymentMode: 'direct',
        description: 'AI chat with real-time crypto context.',
      },
      {
        path: '/api/paid/market',
        method: 'GET',
        asset: 'USDC',
        priceUsd: CREDITS_PRICING.market.usd,
        paymentMode: 'direct',
        description: 'Real-time market data for BTC, ETH, KAMIYO, and sentiment.',
      },
      {
        path: '/api/sap/execute',
        method: 'POST',
        asset: 'USDC',
        priceUsd: null,
        paymentMode: 'sap',
        description: 'SAP execution surface for pricing checks, pass-through fetches, and escrow tooling.',
        pricingEndpoint: getSapPricingEndpoint(baseUrl),
        metadataEndpoint: getSapAgentUri(baseUrl),
      },
    ],
    links: {
      paidPricing: new URL('/api/paid/pricing', baseUrl).toString(),
      paidHealth: new URL('/api/paid/health', baseUrl).toString(),
      sapMetadata: getSapAgentUri(baseUrl),
      sapPricing: getSapPricingEndpoint(baseUrl),
      sapHealth: getSapHealthEndpoint(baseUrl),
      mcp: getSapMcpEndpoint(baseUrl),
    },
  };
}
