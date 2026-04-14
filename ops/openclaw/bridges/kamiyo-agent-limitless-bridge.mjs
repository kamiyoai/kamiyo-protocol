#!/usr/bin/env node
import fs from 'node:fs';
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_LIMITLESS_CTF_ADDRESS = '0xC9c98965297Bc527861c898329Ee280632B76e18';
const CTF_APPROVAL_ABI = [
  'function isApprovedForAll(address account,address operator) view returns (bool)',
  'function setApprovalForAll(address operator,bool approved)',
];

function envBool(key, fallback = false) {
  const raw = readTextEnv(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function resolveRpcUrl() {
  return String(readTextEnv('KYO_TRADING_LIMITLESS_RPC_URL') || 'https://mainnet.base.org').trim();
}

function resolveConditionalTokenContract(getContractAddressFn) {
  const override = String(readTextEnv('KYO_TRADING_LIMITLESS_CTF_ADDRESS') || '').trim();
  if (override) {
    return override;
  }
  if (typeof getContractAddressFn === 'function') {
    try {
      return String(getContractAddressFn('CTF', 8453) || DEFAULT_LIMITLESS_CTF_ADDRESS).trim();
    } catch {
      return DEFAULT_LIMITLESS_CTF_ADDRESS;
    }
  }
  return DEFAULT_LIMITLESS_CTF_ADDRESS;
}

function readPrivateKey() {
  const inline = readTextEnv('KYO_TRADING_LIMITLESS_PRIVATE_KEY') || readTextEnv('KYO_TRADING_POLYMARKET_PRIVATE_KEY');
  if (inline) {
    return inline.startsWith('0x') ? inline : `0x${inline}`;
  }

  const keyPath =
    readTextEnv('KYO_TRADING_LIMITLESS_PRIVATE_KEY_PATH') || readTextEnv('KYO_TRADING_POLYMARKET_PRIVATE_KEY_PATH');
  if (!keyPath) {
    fail(
      'missing_limitless_private_key',
      'KYO_TRADING_LIMITLESS_PRIVATE_KEY(_PATH) or KYO_TRADING_POLYMARKET_PRIVATE_KEY(_PATH) is required',
    );
  }

  let raw = '';
  try {
    raw = fs.readFileSync(keyPath, 'utf8').trim();
  } catch (error) {
    fail('limitless_private_key_read_failed', 'failed to read private key path', {
      path: keyPath,
      reason: String(error?.message || error),
    });
  }
  if (!raw) {
    fail('missing_limitless_private_key', 'private key file was empty');
  }
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

function resolveMarketSlug(candidate, metadata) {
  const preferred = String(
    metadata.limitlessMarketSlug || metadata.marketSlug || metadata.slug || candidate.marketSlug || '',
  ).trim();
  if (preferred) {
    return preferred;
  }

  const marketId = String(candidate.marketId || '').trim();
  if (marketId && marketId.includes('-')) {
    return marketId;
  }

  fail('missing_limitless_market_slug', 'candidate metadata.limitlessMarketSlug is required for sdk execution');
}

function resolveTokenId(candidate, metadata) {
  const direct = String(metadata.limitlessTokenId || metadata.tokenId || '').trim();
  if (direct) {
    return direct;
  }

  const ids = metadata.limitlessTokenIds;
  if (ids && typeof ids === 'object') {
    const yes = String(ids.yes || ids.YES || '').trim();
    const no = String(ids.no || ids.NO || '').trim();
    const direction = String(metadata.direction || '').trim().toLowerCase();
    if (direction === 'yes' && yes) {
      return yes;
    }
    if (direction === 'no' && no) {
      return no;
    }
    if (yes || no) {
      return yes || no;
    }
  }

  const maybeToken = String(candidate.marketId || '').trim();
  if (/^\d{20,}$/.test(maybeToken)) {
    return maybeToken;
  }

  fail('missing_limitless_token_id', 'candidate metadata.limitlessTokenId is required for sdk execution');
}

function orderTypeFromEnv(OrderType) {
  const raw = String(readTextEnv('KYO_TRADING_LIMITLESS_ORDER_TYPE') || 'FOK').trim().toUpperCase();
  return raw === 'GTC' ? OrderType.GTC : OrderType.FOK;
}

function sideFromEnvOrMetadata(metadata, Side) {
  const explicit = String(metadata.limitlessSide || readTextEnv('KYO_TRADING_LIMITLESS_SIDE') || 'buy')
    .trim()
    .toLowerCase();
  if (explicit === 'sell') {
    return Side.SELL;
  }
  return Side.BUY;
}

function makerAmountFromEnv() {
  const notional = toNumber(process.env.KYO_TRADING_NOTIONAL_USD, 0);
  if (!(notional > 0)) {
    fail('invalid_limitless_notional', 'KYO_TRADING_NOTIONAL_USD must be > 0');
  }
  const precisionRaw = Number(readTextEnv('KYO_TRADING_LIMITLESS_SIZE_DECIMALS') || '3');
  const precision = Number.isFinite(precisionRaw) ? Math.min(6, Math.max(0, Math.floor(precisionRaw))) : 3;
  const factor = 10 ** precision;
  const normalized = Math.floor(notional * factor) / factor;
  if (!(normalized > 0)) {
    fail('invalid_limitless_notional', 'KYO_TRADING_NOTIONAL_USD must be >= 0.000001');
  }
  return Number(normalized.toFixed(precision));
}

function normalizeAddress(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.toLowerCase();
}

function extractExchangeAddressHint(error) {
  const candidates = [];
  const body = error?.details?.body;
  if (typeof body === 'string') {
    candidates.push(body);
  } else if (body && typeof body === 'object') {
    if (typeof body.message === 'string') {
      candidates.push(body.message);
    }
    if (typeof body.error === 'string') {
      candidates.push(body.error);
    }
    if (typeof body.reason === 'string') {
      candidates.push(body.reason);
    }
  }
  if (typeof error?.message === 'string') {
    candidates.push(error.message);
  }

  const marker = /Exchange address for this market:\s*(0x[a-fA-F0-9]{40})/i;
  for (const text of candidates) {
    const match = text.match(marker);
    if (match?.[1]) {
      return match[1];
    }
  }
  return '';
}

function parseUsdTokenAmount(value) {
  if (value == null) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value).trim();
  if (!text) {
    return 0;
  }
  if (/^-?\d+$/.test(text)) {
    return Number(text) / 1_000_000;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function fetchJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    fail('limitless_request_failed', 'request to Limitless API failed', {
      url,
      reason: String(error?.message || error),
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.message || payload?.error || `${response.status} ${response.statusText || 'request failed'}`;
    fail('limitless_api_error', 'Limitless API request failed', {
      url,
      status: response.status,
      message,
      payload,
    });
  }

  return payload;
}

async function tryCancelOrder(baseUrl, orderId, headers = {}) {
  if (!orderId) {
    return false;
  }
  const url = `${baseUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(orderId)}`;
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });
    return response.ok;
  } catch {
    return false;
  }
}

function parseFeeRateBps(profile) {
  const feeRateRaw = Number(profile?.rank?.feeRateBps);
  if (Number.isFinite(feeRateRaw) && feeRateRaw >= 0) {
    return feeRateRaw;
  }
  return 300;
}

function parseSignatureType(defaultValue) {
  const raw = readTextEnv('KYO_TRADING_LIMITLESS_SIGNATURE_TYPE');
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3) {
    fail('invalid_limitless_signature_type', 'KYO_TRADING_LIMITLESS_SIGNATURE_TYPE must be between 0 and 3');
  }
  return Math.floor(parsed);
}

function resolveExecutionContext({ walletAddress, profile, allowance }) {
  const walletAddressNorm = normalizeAddress(walletAddress);
  const tradeWalletOption = String(profile?.tradeWalletOption || '').trim().toLowerCase();
  const normalizedTradeWalletOption = tradeWalletOption.replace(/[\s_-]+/g, '');
  const profileAccount = String(profile?.account || '').trim();
  const smartWallet = String(profile?.smartWallet || allowance?.checkedAddress || '').trim();
  const embeddedAccount = String(profile?.embeddedAccount || '').trim();
  const checkedAddress = String(allowance?.checkedAddress || '').trim();

  const forceMaker = String(readTextEnv('KYO_TRADING_LIMITLESS_MAKER_ADDRESS') || '').trim();
  const forceSigner = String(readTextEnv('KYO_TRADING_LIMITLESS_SIGNER_ADDRESS') || '').trim();
  const explicitEoaMode = normalizedTradeWalletOption === 'eoa';
  const explicitSmartWalletMode = normalizedTradeWalletOption === 'smartwallet';
  let smartWalletMode = explicitSmartWalletMode;

  if (!explicitEoaMode && !explicitSmartWalletMode) {
    const checkedNorm = normalizeAddress(checkedAddress);
    const smartNorm = normalizeAddress(smartWallet);
    smartWalletMode = Boolean(
      checkedNorm &&
        smartNorm &&
        normalizeAddress(embeddedAccount) &&
        checkedNorm === smartNorm &&
        checkedNorm !== walletAddressNorm
    );
  }

  const ownerId = Number(profile?.id);
  if (!Number.isFinite(ownerId) || ownerId <= 0) {
    fail('missing_limitless_owner_id', 'unable to resolve Limitless ownerId from profile', {
      profileId: profile?.id ?? null,
      walletAddress,
    });
  }

  let makerAddress = forceMaker || profileAccount || walletAddress;
  let signerAddress = forceSigner || profileAccount || walletAddress;
  let signatureType = parseSignatureType(0);
  let mode = 'eoa';

  if (smartWalletMode) {
    mode = 'smart_wallet';
    makerAddress = forceMaker || smartWallet || profileAccount || walletAddress;
    signerAddress = forceSigner || embeddedAccount || '';
    signatureType = parseSignatureType(1);

    if (!signerAddress) {
      fail('missing_limitless_embedded_signer', 'smart wallet profile requires embedded signer address', {
        walletAddress,
        tradeWalletOption: profile?.tradeWalletOption ?? null,
        smartWallet: smartWallet || null,
        embeddedAccount: embeddedAccount || null,
      });
    }
  } else {
    makerAddress = forceMaker || checkedAddress || profileAccount || walletAddress;
    signerAddress = forceSigner || makerAddress;
  }

  if (walletAddressNorm !== normalizeAddress(signerAddress)) {
    fail(
      'limitless_signer_alignment_mismatch',
      'signing key does not match required Limitless signer for this profile',
      {
        mode,
        walletSigner: walletAddress,
        expectedSigner: signerAddress,
        expectedMaker: makerAddress,
        tradeWalletOption: profile?.tradeWalletOption ?? null,
        smartWallet: smartWallet || null,
        embeddedAccount: embeddedAccount || null,
      },
    );
  }

  return {
    ownerId,
    feeRateBps: parseFeeRateBps(profile),
    mode,
    makerAddress,
    signerAddress,
    signatureType,
    tradeWalletOption: profile?.tradeWalletOption ?? null,
    smartWallet: smartWallet || null,
    embeddedAccount: embeddedAccount || null,
  };
}

function candidateRequestsClose(candidate, metadata) {
  const kind = String(candidate?.kind || '').trim().toLowerCase();
  if (kind === 'trade_close' || kind === 'close_candidate') {
    return true;
  }
  const intent = String(metadata?.executionIntent || metadata?.intent || '').trim().toLowerCase();
  return intent === 'close' || intent === 'exit' || intent === 'reduce' || intent === 'settle';
}

function hasSettlementEvidence(payload) {
  const settlementRef = String(payload?.settlementRef || payload?.fillId || payload?.closeId || '').trim();
  if (settlementRef) {
    return true;
  }
  const txHash = String(
    payload?.txSignature || payload?.txHash || payload?.transactionHash || payload?.execution?.txHash || '',
  ).trim();
  return /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

async function ensureConditionalTokenAllowance({
  ethersPkg,
  wallet,
  walletAddress,
  makerAddress,
  operatorAddress,
  ctfAddress,
  marketSlug,
  candidateId,
}) {
  const JsonRpcProvider = ethersPkg?.JsonRpcProvider;
  const Contract = ethersPkg?.Contract;
  if (!JsonRpcProvider || !Contract) {
    fail('missing_limitless_bridge_dependencies', 'ethers provider/contract exports are unavailable');
  }
  if (!operatorAddress || normalizeAddress(operatorAddress) === normalizeAddress(ZERO_ADDRESS)) {
    fail('missing_limitless_exchange_address', 'missing exchange address for conditional token approval', {
      marketSlug,
      candidateId,
    });
  }
  if (normalizeAddress(makerAddress) !== normalizeAddress(walletAddress)) {
    fail('limitless_conditional_allowance_owner_mismatch', 'cannot auto-set conditional token allowance for non-signer maker', {
      walletSigner: walletAddress,
      makerAddress,
      operatorAddress,
      marketSlug,
      candidateId,
    });
  }

  const rpcUrl = resolveRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl, 8453);
  const signer = wallet.connect(provider);
  const ctf = new Contract(ctfAddress, CTF_APPROVAL_ABI, signer);

  let approved = false;
  try {
    approved = Boolean(await ctf.isApprovedForAll(makerAddress, operatorAddress));
  } catch (error) {
    fail('limitless_conditional_allowance_check_failed', 'failed to check conditional token approval', {
      ctfAddress,
      makerAddress,
      operatorAddress,
      marketSlug,
      candidateId,
      reason: String(error?.message || error),
    });
  }
  if (approved) {
    return {
      attempted: false,
      alreadyApproved: true,
      ctfAddress,
      operatorAddress,
      makerAddress,
      rpcUrl,
    };
  }

  let tx;
  try {
    tx = await ctf.setApprovalForAll(operatorAddress, true);
    await tx.wait(1);
  } catch (error) {
    fail('limitless_conditional_allowance_set_failed', 'failed to set conditional token approval', {
      ctfAddress,
      makerAddress,
      operatorAddress,
      marketSlug,
      candidateId,
      rpcUrl,
      reason: String(error?.message || error),
    });
  }

  return {
    attempted: true,
    alreadyApproved: false,
    txHash: String(tx?.hash || '').trim() || null,
    ctfAddress,
    operatorAddress,
    makerAddress,
    rpcUrl,
  };
}

async function executeWithSignedPayload(candidate, metadata, apiKey, orderUrl) {
  const payload = metadata.limitlessOrder || metadata.orderPayload;
  if (!payload || typeof payload !== 'object') {
    fail('missing_limitless_order_payload', 'candidate metadata.limitlessOrder is required for bridge execution');
  }

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
  const closeIntent = candidateRequestsClose(candidate, metadata);
  const realizedFromResponse = Boolean(response?.realized || response?.closed);

  return buildResult({
    orderId,
    positionId,
    grossUsd,
    costUsd,
    netUsd,
    realized: closeIntent && realizedFromResponse && hasSettlementEvidence(response),
    paymentRef,
    raw: response,
  });
}

async function executeWithSdk(candidate, metadata, apiKey, baseUrl) {
  let sdk;
  let ethersPkg;
  try {
    sdk = await import('@limitless-exchange/sdk');
    ethersPkg = await import('ethers');
  } catch (error) {
    fail(
      'missing_limitless_bridge_dependencies',
      'install bridge deps: npm i @limitless-exchange/sdk ethers',
      { reason: String(error?.message || error) },
    );
  }

  const { HttpClient, MarketFetcher, OrderBuilder, Side, OrderType, getContractAddress } = sdk;
  const Wallet = ethersPkg?.Wallet;
  if (!HttpClient || !MarketFetcher || !OrderBuilder || !Side || !OrderType || !Wallet) {
    fail('invalid_limitless_bridge_dependencies', 'failed to load Limitless SDK exports');
  }

  const privateKey = readPrivateKey();
  const wallet = new Wallet(privateKey);
  const walletAddress = await wallet.getAddress();
  const httpClient = new HttpClient({ baseURL: baseUrl, apiKey });
  const marketFetcher = new MarketFetcher(httpClient);

  const marketSlug = resolveMarketSlug(candidate, metadata);
  const tokenId = resolveTokenId(candidate, metadata);
  const side = sideFromEnvOrMetadata(metadata, Side);
  const orderType = orderTypeFromEnv(OrderType);
  const makerAmount = makerAmountFromEnv();
  const closeIntent = candidateRequestsClose(candidate, metadata);

  const authHeaders = { 'X-API-Key': apiKey };
  const profile = await fetchJson(`${baseUrl.replace(/\/$/, '')}/profiles/${walletAddress}`, authHeaders);
  const allowance = await fetchJson(`${baseUrl.replace(/\/$/, '')}/portfolio/trading/allowance?type=clob`, authHeaders);
  const context = resolveExecutionContext({ walletAddress, profile, allowance });

  let market;
  try {
    market = await marketFetcher.getMarket(marketSlug);
  } catch (error) {
    fail('limitless_market_fetch_failed', 'failed to fetch market details for signing domain', {
      marketSlug,
      reason: String(error?.message || error),
    });
  }
  const exchangeAddress = String(market?.venue?.exchange || '').trim();
  if (!exchangeAddress) {
    fail('missing_limitless_exchange_address', 'market venue exchange address is required', {
      marketSlug,
    });
  }
  const autoApproveConditional = envBool('KYO_TRADING_LIMITLESS_AUTO_CONDITIONAL_APPROVAL', true);
  const ctfAddress = resolveConditionalTokenContract(getContractAddress);
  let conditionalApproval = {
    attempted: false,
    alreadyApproved: false,
    skipped: true,
  };
  if (autoApproveConditional && (closeIntent || side === Side.SELL)) {
    conditionalApproval = await ensureConditionalTokenAllowance({
      ethersPkg,
      wallet,
      walletAddress,
      makerAddress: context.makerAddress,
      operatorAddress: exchangeAddress,
      ctfAddress,
      marketSlug,
      candidateId: String(candidate.id || ''),
    });
  }

  const orderBuilder = new OrderBuilder(context.makerAddress, context.feeRateBps, 1e-3);
  let unsignedOrder;
  if (orderType === OrderType.GTC) {
    const price = toNumber(metadata.midpoint, Number.NaN);
    if (!(price > 0 && price < 1)) {
      fail('missing_limitless_gtc_price', 'metadata.midpoint is required for GTC orders');
    }
    const normalizedPrice = Math.round(price * 1000) / 1000;
    if (!(normalizedPrice > 0 && normalizedPrice < 1)) {
      fail('invalid_limitless_gtc_price', 'metadata.midpoint must normalize to a valid 3-decimal price');
    }
    unsignedOrder = orderBuilder.buildOrder({
      tokenId,
      side,
      price: normalizedPrice,
      size: makerAmount,
    });
  } else {
    unsignedOrder = orderBuilder.buildOrder({
      tokenId,
      side,
      makerAmount,
    });
  }

  unsignedOrder = {
    ...unsignedOrder,
    maker: context.makerAddress,
    signer: context.signerAddress,
    taker: unsignedOrder.taker || ZERO_ADDRESS,
    signatureType: context.signatureType,
  };

  const domain = {
    name: 'Limitless CTF Exchange',
    version: '1',
    chainId: 8453,
    verifyingContract: exchangeAddress,
  };
  const types = {
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'signer', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'makerAmount', type: 'uint256' },
      { name: 'takerAmount', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'feeRateBps', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'signatureType', type: 'uint8' },
    ],
  };

  const clientOrderId = `kamiyo-agent-${String(candidate.id || marketSlug || Date.now())
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)}-${Date.now()}`;
  const ordersUrl = `${baseUrl.replace(/\/$/, '')}/orders`;

  const submitWithExchange = async (verifyingContract) => {
    const domainForExchange = {
      ...domain,
      verifyingContract,
    };
    let signature;
    try {
      signature = await wallet.signTypedData(domainForExchange, types, unsignedOrder);
    } catch (error) {
      fail('limitless_order_sign_failed', 'failed to sign Limitless order payload', {
        reason: String(error?.message || error),
        mode: context.mode,
        walletSigner: walletAddress,
        expectedSigner: context.signerAddress,
        expectedMaker: context.makerAddress,
        signatureType: context.signatureType,
        tradeWalletOption: context.tradeWalletOption,
        smartWallet: context.smartWallet,
        embeddedAccount: context.embeddedAccount,
        verifyingContract,
      });
    }
    const payload = {
      order: {
        ...unsignedOrder,
        signature,
      },
      ownerId: context.ownerId,
      orderType,
      marketSlug,
      clientOrderId,
    };
    return postJson(ordersUrl, payload, authHeaders);
  };

  let response;
  let exchangeUsed = exchangeAddress;
  try {
    response = await submitWithExchange(exchangeAddress);
  } catch (error) {
    const hintedExchange = extractExchangeAddressHint(error);
    if (hintedExchange && normalizeAddress(hintedExchange) !== normalizeAddress(exchangeAddress)) {
      exchangeUsed = hintedExchange;
      response = await submitWithExchange(hintedExchange);
    } else {
      throw error;
    }
  }

  const order = response?.order || {};
  const orderId = String(order.id || inferOrderId(response, String(candidate.id || marketSlug || 'limitless'))).trim();
  const positionId = orderId;
  const paymentRef = String(response?.execution?.txHash || response?.txHash || orderId);
  const execution = response?.execution || {};
  const matched = Boolean(execution?.matched);
  if (!candidateRequestsClose(candidate, metadata) && !matched) {
    const cancelled = await tryCancelOrder(baseUrl, orderId, authHeaders);
    fail('limitless_order_unmatched', 'order was placed but did not match immediately', {
      orderId,
      marketSlug,
      cancelled,
    });
  }
  const totalsRaw = execution?.totalsRaw || {};
  const grossUsd = parseUsdTokenAmount(totalsRaw?.usdGross ?? response?.grossUsd ?? 0);
  const costUsd = parseUsdTokenAmount(totalsRaw?.usdFee ?? response?.costUsd ?? 0);
  const netUsd = parseUsdTokenAmount(totalsRaw?.usdNet ?? response?.netUsd ?? grossUsd - costUsd);
  const settlementStatus = String(execution?.settlementStatus || '').trim().toUpperCase();
  const settled = settlementStatus === 'CONFIRMED' || settlementStatus === 'MINED';
  const realized = closeIntent && (settled || hasSettlementEvidence(response));

  return buildResult({
    orderId,
    positionId,
    grossUsd,
    costUsd,
    netUsd,
    realized,
    paymentRef,
    raw: {
      sdk: true,
      marketSlug,
      tokenId,
      side,
      orderType,
      makerAmount,
      exchangeAddress: exchangeUsed,
      signingContext: {
        mode: context.mode,
        walletSigner: walletAddress,
        maker: context.makerAddress,
        signer: context.signerAddress,
        signatureType: context.signatureType,
        tradeWalletOption: context.tradeWalletOption,
        smartWallet: context.smartWallet,
        embeddedAccount: context.embeddedAccount,
      },
      conditionalApproval,
      response,
    },
  });
}

async function main() {
  const candidate = parseCandidate();
  const metadata = candidateMetadata(candidate);

  const apiKey = readTextEnv('KYO_TRADING_LIMITLESS_API_KEY');
  if (!apiKey) {
    fail('missing_limitless_api_key', 'KYO_TRADING_LIMITLESS_API_KEY is required');
  }

  const baseUrl = readTextEnv('KYO_TRADING_LIMITLESS_API_BASE_URL') || 'https://api.limitless.exchange';
  const orderUrl =
    readTextEnv('KYO_TRADING_LIMITLESS_ORDER_URL') || `${baseUrl.replace(/\/$/, '')}/orders`;
  const hasSignedPayload = metadata.limitlessOrder && typeof metadata.limitlessOrder === 'object';
  const result = hasSignedPayload
    ? await executeWithSignedPayload(candidate, metadata, apiKey, orderUrl)
    : await executeWithSdk(candidate, metadata, apiKey, baseUrl);
  printResult(result);
}

main().catch((error) => {
  printError(error);
  process.exit(1);
});
