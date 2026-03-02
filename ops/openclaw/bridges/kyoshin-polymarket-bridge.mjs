#!/usr/bin/env node
import {
  buildResult,
  candidateMetadata,
  fail,
  inferOrderId,
  parseCandidate,
  postJson,
  printError,
  printResult,
  readTextEnv,
  toNumber,
} from './trading-bridge-shared.mjs';

async function main() {
  const candidate = parseCandidate();
  const metadata = candidateMetadata(candidate);

  const payload = metadata.polymarketOrder || metadata.orderPayload;
  if (!payload || typeof payload !== 'object') {
    fail('missing_polymarket_order_payload', 'candidate metadata.polymarketOrder is required for bridge execution');
  }

  const apiKey = readTextEnv('KYO_TRADING_POLYMARKET_API_KEY');
  const apiSecret = readTextEnv('KYO_TRADING_POLYMARKET_API_SECRET');
  const apiPassphrase = readTextEnv('KYO_TRADING_POLYMARKET_API_PASSPHRASE');

  if (!apiKey || !apiSecret || !apiPassphrase) {
    fail('missing_polymarket_credentials', 'KYO_TRADING_POLYMARKET_API_KEY/API_SECRET/API_PASSPHRASE are required');
  }

  const clobBase = readTextEnv('KYO_TRADING_POLYMARKET_CLOB_BASE_URL') || 'https://clob.polymarket.com';
  const orderUrl =
    readTextEnv('KYO_TRADING_POLYMARKET_ORDER_URL') || `${clobBase.replace(/\/$/, '')}/order`;

  const response = await postJson(orderUrl, payload, {
    'POLYMARKET-API-KEY': apiKey,
    'POLYMARKET-API-SECRET': apiSecret,
    'POLYMARKET-API-PASSPHRASE': apiPassphrase,
  });

  const orderId = inferOrderId(response, String(candidate.id || candidate.marketId || 'polymarket'));
  const positionId = String(response?.positionId || response?.position_id || candidate.marketId || orderId);
  const expectedCost = toNumber(candidate?.feesEstimate, 0) + toNumber(candidate?.expectedSlippage, 0);
  const grossUsd = toNumber(response?.grossUsd ?? response?.payoutUsd, 0);
  const costUsd = Math.max(0, toNumber(response?.costUsd ?? response?.feeUsd, expectedCost));
  const netUsd = toNumber(response?.netUsd, grossUsd - costUsd);
  const paymentRef = String(response?.txHash || response?.signature || response?.paymentRef || orderId);

  printResult(
    buildResult({
      orderId,
      positionId,
      grossUsd,
      costUsd,
      netUsd,
      realized: Boolean(response?.realized || response?.closed),
      paymentRef,
      raw: response,
    }),
  );
}

main().catch((error) => {
  printError(error);
  process.exit(1);
});
