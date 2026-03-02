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

  const payload = metadata.limitlessOrder || metadata.orderPayload;
  if (!payload || typeof payload !== 'object') {
    fail('missing_limitless_order_payload', 'candidate metadata.limitlessOrder is required for bridge execution');
  }

  const apiKey = readTextEnv('KYO_TRADING_LIMITLESS_API_KEY');
  if (!apiKey) {
    fail('missing_limitless_api_key', 'KYO_TRADING_LIMITLESS_API_KEY is required');
  }

  const baseUrl = readTextEnv('KYO_TRADING_LIMITLESS_API_BASE_URL') || 'https://api.limitless.exchange';
  const orderUrl =
    readTextEnv('KYO_TRADING_LIMITLESS_ORDER_URL') || `${baseUrl.replace(/\/$/, '')}/orders`;

  const response = await postJson(orderUrl, payload, {
    'X-API-Key': apiKey,
  });

  const orderId = inferOrderId(response, String(candidate.id || candidate.marketId || 'limitless'));
  const positionId = String(response?.positionId || response?.position_id || response?.marketPositionId || orderId);
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
