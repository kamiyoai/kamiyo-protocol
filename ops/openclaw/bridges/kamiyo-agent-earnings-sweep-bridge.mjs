#!/usr/bin/env node
import fs from 'node:fs';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

const RELAY_API_BASE_DEFAULT = 'https://api.relay.link';
const SOLANA_CHAIN_ID = 792703809;
const SOLANA_NATIVE_ADDRESS = '11111111111111111111111111111111';
const DEFAULT_BUFFER_BPS = 300;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_POLL_MS = 2500;
const ERC20_BALANCE_ABI = ['function balanceOf(address owner) view returns (uint256)'];

const CHAIN_DEFAULTS = {
  1: {
    rpc: 'https://eth.llamarpc.com',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  10: {
    rpc: 'https://mainnet.optimism.io',
    usdc: '0x0b2C639c533813f4Aa9D7837CaF62653d097FF85',
  },
  137: {
    rpc: 'https://polygon-rpc.com',
    usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  },
  8453: {
    rpc: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  42161: {
    rpc: 'https://arb1.arbitrum.io/rpc',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
};

function fail(code, message, details = {}) {
  const out = {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
  process.stderr.write(`${JSON.stringify(out)}\n`);
  process.exit(1);
}

function env(name, fallback = '') {
  const value = process.env[name];
  if (value == null) {
    return fallback;
  }
  return String(value).trim();
}

function envNumber(name, fallback = 0) {
  const raw = env(name, '');
  if (!raw) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parsePrivateKey() {
  const inline = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_PRIVATE_KEY') || env('KYO_TRADING_LIMITLESS_PRIVATE_KEY');
  if (inline) {
    return inline.startsWith('0x') ? inline : `0x${inline}`;
  }

  const path = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_PRIVATE_KEY_PATH') || env('KYO_TRADING_LIMITLESS_PRIVATE_KEY_PATH');
  if (!path) {
    fail('missing_evm_private_key', 'missing sweep source EVM private key', {
      expected: [
        'KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_PRIVATE_KEY',
        'KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_PRIVATE_KEY_PATH',
        'KYO_TRADING_LIMITLESS_PRIVATE_KEY',
        'KYO_TRADING_LIMITLESS_PRIVATE_KEY_PATH',
      ],
    });
  }

  let raw = '';
  try {
    raw = fs.readFileSync(path, 'utf8').trim();
  } catch (error) {
    fail('evm_private_key_read_failed', 'failed to read EVM private key path', {
      path,
      reason: String(error?.message || error),
    });
  }
  if (!raw) {
    fail('missing_evm_private_key', 'EVM private key file is empty', { path });
  }
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

function parseSolAddress(value) {
  const text = String(value || '').trim();
  if (!text) {
    fail('missing_solana_recipient', 'KYO_ROUTE_SWEEP_TO_PUBKEY is required');
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
    fail('invalid_solana_recipient', 'KYO_ROUTE_SWEEP_TO_PUBKEY is not a valid Solana address', {
      recipient: text,
    });
  }
  return text;
}

function deriveSweepUsdTarget() {
  const routeUsd = Math.max(0, envNumber('KYO_ROUTE_SWEEP_TARGET_USD', 0));
  const targetSol = Math.max(0, envNumber('KYO_ROUTE_SWEEP_TARGET_SOL', 0));
  const solPrice = Math.max(0.000001, envNumber('KYO_ROUTE_SWEEP_SOL_PRICE_USD', envNumber('KYO_TRADING_SOL_PRICE_USD', 150)));
  const targetFromSol = targetSol * solPrice;
  const baseline = Math.max(routeUsd, targetFromSol);
  if (!(baseline > 0)) {
    fail('invalid_sweep_target', 'sweep target must be greater than zero', {
      routeUsd,
      targetSol,
      solPrice,
    });
  }
  const bufferBps = Math.max(0, Math.floor(envNumber('KYO_TRADING_ROUTE_EARNINGS_SWEEP_BUFFER_BPS', DEFAULT_BUFFER_BPS)));
  return Math.max(0.01, baseline * (1 + bufferBps / 10000));
}

function toTokenUnits(amount, decimals) {
  const factor = 10 ** decimals;
  const normalized = Math.ceil(amount * factor);
  return String(Math.max(1, normalized));
}

function toUnitsFloat(units, decimals) {
  const base = 10 ** decimals;
  return Number(units) / base;
}

function fromTokenUnits(raw, decimals) {
  const text = String(raw || '').trim();
  if (!/^\d+$/.test(text)) {
    return 0;
  }
  const asBig = BigInt(text);
  return Number(asBig) / 10 ** decimals;
}

function baseHeaders() {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'kamiyo-agent-earnings-sweep/1.0',
  };
  const apiKey = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_RELAY_API_KEY');
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

async function postJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    fail('relay_request_failed', 'failed to call relay quote API', {
      url,
      reason: String(error?.message || error),
    });
  }

  const raw = await response.text();
  let body = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }

  if (!response.ok) {
    fail('relay_quote_failed', `relay quote returned HTTP ${response.status}`, {
      url,
      status: response.status,
      body,
    });
  }

  if (!body || typeof body !== 'object') {
    fail('relay_quote_invalid', 'relay quote payload is not an object');
  }

  return body;
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'kamiyo-agent-earnings-sweep/1.0',
      },
    });
  } catch (error) {
    fail('relay_status_failed', 'failed to call relay status API', {
      url,
      reason: String(error?.message || error),
    });
  }

  const raw = await response.text();
  let body = raw;
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }

  if (!response.ok) {
    fail('relay_status_failed', `relay status returned HTTP ${response.status}`, {
      url,
      status: response.status,
      body,
    });
  }

  if (!body || typeof body !== 'object') {
    fail('relay_status_invalid', 'relay status payload is not an object', { url });
  }

  return body;
}

function resolveOriginConfig() {
  const originChainId = Math.floor(envNumber('KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_CHAIN_ID', 137));
  const defaults = CHAIN_DEFAULTS[originChainId] || CHAIN_DEFAULTS[137];
  const rpcUrl = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_EVM_RPC_URL') || defaults.rpc;
  const originCurrency = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_ORIGIN_CURRENCY') || defaults.usdc;
  if (!rpcUrl || !originCurrency) {
    fail('invalid_origin_config', 'missing origin RPC or currency configuration', {
      originChainId,
    });
  }
  return {
    originChainId,
    originCurrency,
    rpcUrl,
  };
}

function toAbsoluteUrl(base, endpoint) {
  if (String(endpoint || '').startsWith('https://')) {
    return endpoint;
  }
  const root = base.replace(/\/$/, '');
  const suffix = String(endpoint || '').startsWith('/') ? endpoint : `/${String(endpoint || '')}`;
  return `${root}${suffix}`;
}

function parseRequestId(steps) {
  for (const step of steps) {
    const direct = String(step?.requestId || step?.requestID || '').trim();
    if (direct) {
      return direct;
    }
    if (!Array.isArray(step?.items)) {
      continue;
    }
    for (const item of step.items) {
      const endpoint = String(item?.check?.endpoint || '').trim();
      if (!endpoint) {
        continue;
      }
      try {
        const parsed = new URL(toAbsoluteUrl(RELAY_API_BASE_DEFAULT, endpoint));
        const requestId = parsed.searchParams.get('requestId') || parsed.searchParams.get('requestID');
        if (requestId) {
          return requestId;
        }
      } catch {
        continue;
      }
    }
  }
  return '';
}

function parseHashCandidate(value) {
  const text = String(value || '').trim();
  return /^0x[a-fA-F0-9]{64}$/.test(text) ? text : '';
}

function parseStatusHashes(payload) {
  const hashes = [];
  const scan = (node) => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        scan(item);
      }
      return;
    }
    if (typeof node !== 'object') {
      const maybe = parseHashCandidate(node);
      if (maybe) {
        hashes.push(maybe);
      }
      return;
    }
    const directKeys = ['txHash', 'txhash', 'hash', 'destinationTxHash', 'originTxHash', 'transactionHash'];
    for (const key of directKeys) {
      const maybe = parseHashCandidate(node[key]);
      if (maybe) {
        hashes.push(maybe);
      }
    }
    for (const value of Object.values(node)) {
      if (typeof value === 'object' || typeof value === 'string') {
        scan(value);
      }
    }
  };
  scan(payload);
  const deduped = [];
  const seen = new Set();
  for (const hash of hashes) {
    const lower = hash.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    deduped.push(hash);
  }
  return deduped;
}

async function executeTransactionStep({ step, walletByChain }) {
  if (!Array.isArray(step?.items) || step.items.length === 0) {
    fail('relay_step_missing_items', 'transaction step has no items', {
      stepId: step?.id || null,
    });
  }

  const txHashes = [];
  for (const item of step.items) {
    if (String(item?.status || '').toLowerCase() === 'complete') {
      continue;
    }
    const data = item?.data;
    if (!data || typeof data !== 'object') {
      fail('relay_step_missing_data', 'transaction item is missing tx data', {
        stepId: step?.id || null,
      });
    }

    const chainId = Number(data.chainId || data.chainID || 0);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      fail('relay_step_missing_chain', 'transaction item is missing chainId', {
        stepId: step?.id || null,
      });
    }

    const wallet = walletByChain(chainId);
    const txRequest = {
      to: data.to,
      data: data.data || '0x',
      value: BigInt(String(data.value || '0')),
      chainId,
    };
    if (data.gas) {
      txRequest.gasLimit = BigInt(String(data.gas));
    }
    if (data.gasPrice) {
      txRequest.gasPrice = BigInt(String(data.gasPrice));
    }
    if (data.maxFeePerGas) {
      txRequest.maxFeePerGas = BigInt(String(data.maxFeePerGas));
    }
    if (data.maxPriorityFeePerGas) {
      txRequest.maxPriorityFeePerGas = BigInt(String(data.maxPriorityFeePerGas));
    }

    let sent;
    try {
      sent = await wallet.sendTransaction(txRequest);
    } catch (error) {
      fail('relay_transaction_send_failed', 'failed to submit relay bridge transaction', {
        stepId: step?.id || null,
        chainId,
        reason: String(error?.shortMessage || error?.message || error),
      });
    }

    txHashes.push(sent.hash);

    try {
      await sent.wait(1);
    } catch (error) {
      fail('relay_transaction_confirm_failed', 'bridge transaction failed to confirm', {
        stepId: step?.id || null,
        chainId,
        txHash: sent.hash,
        reason: String(error?.shortMessage || error?.message || error),
      });
    }
  }

  return txHashes;
}

async function resolveOriginSpendAmount({
  originChainId,
  originCurrency,
  walletByChain,
  requestedAmountUnits,
}) {
  const wallet = walletByChain(originChainId);
  if (!originCurrency || !String(originCurrency).startsWith('0x')) {
    return {
      amountUnits: requestedAmountUnits,
      requestedAmountUnits,
      availableAmountUnits: requestedAmountUnits,
      partial: false,
    };
  }

  const token = new Contract(originCurrency, ERC20_BALANCE_ABI, wallet.provider);
  let availableRaw;
  try {
    availableRaw = await token.balanceOf(wallet.address);
  } catch (error) {
    fail('origin_balance_read_failed', 'failed to read source token balance for sweep', {
      chainId: originChainId,
      currency: originCurrency,
      reason: String(error?.message || error),
    });
  }

  const availableUnits = BigInt(String(availableRaw || 0));
  const minReserveBps = Math.max(0, Math.floor(envNumber('KYO_TRADING_ROUTE_EARNINGS_SWEEP_BALANCE_RESERVE_BPS', 50)));
  const spendableUnits =
    minReserveBps > 0
      ? (availableUnits * BigInt(Math.max(0, 10000 - minReserveBps))) / 10000n
      : availableUnits;

  if (spendableUnits <= 0n) {
    fail('insufficient_source_balance', 'source token balance is zero for earnings sweep', {
      chainId: originChainId,
      currency: originCurrency,
      availableUnits: availableUnits.toString(),
    });
  }

  const cappedUnits = requestedAmountUnits <= spendableUnits ? requestedAmountUnits : spendableUnits;
  if (cappedUnits <= 0n) {
    fail('insufficient_source_balance', 'spendable source token balance is zero after reserve', {
      chainId: originChainId,
      currency: originCurrency,
      availableUnits: availableUnits.toString(),
      spendableUnits: spendableUnits.toString(),
      reserveBps: minReserveBps,
    });
  }

  return {
    amountUnits: cappedUnits,
    requestedAmountUnits,
    availableAmountUnits: availableUnits,
    partial: cappedUnits < requestedAmountUnits,
  };
}

async function waitForStatus({ apiBase, requestId, timeoutMs, pollMs }) {
  const started = Date.now();
  let lastPayload = null;
  while (Date.now() - started < timeoutMs) {
    const url = `${apiBase.replace(/\/$/, '')}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`;
    const payload = await getJson(url);
    lastPayload = payload;

    const status = String(payload?.status || payload?.result?.status || '').trim().toLowerCase();
    if (['success', 'completed', 'complete'].includes(status)) {
      return payload;
    }
    if (['failure', 'failed', 'cancelled', 'canceled', 'reverted', 'expired'].includes(status)) {
      fail('relay_bridge_failed', 'relay intent finished unsuccessfully', {
        requestId,
        status,
        payload,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  fail('relay_status_timeout', 'relay intent status polling timed out', {
    requestId,
    timeoutMs,
    lastStatus: lastPayload?.status || lastPayload?.result?.status || null,
  });
}

async function main() {
  const apiBase = env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_RELAY_API_BASE_URL', RELAY_API_BASE_DEFAULT) || RELAY_API_BASE_DEFAULT;
  const recipient = parseSolAddress(env('KYO_ROUTE_SWEEP_TO_PUBKEY'));
  const sweepUsdTarget = deriveSweepUsdTarget();
  const { originChainId, originCurrency, rpcUrl } = resolveOriginConfig();

  const privateKey = parsePrivateKey();
  const providerCache = new Map();
  const walletCache = new Map();

  const walletByChain = (chainId) => {
    if (!providerCache.has(chainId)) {
      const rpc = chainId === originChainId ? rpcUrl : env(`KYO_TRADING_ROUTE_EARNINGS_SWEEP_CHAIN_${chainId}_RPC_URL`);
      if (!rpc) {
        fail('missing_chain_rpc', 'missing RPC URL for relay execution step chain', { chainId });
      }
      providerCache.set(chainId, new JsonRpcProvider(rpc));
    }
    if (!walletCache.has(chainId)) {
      walletCache.set(chainId, new Wallet(privateKey, providerCache.get(chainId)));
    }
    return walletCache.get(chainId);
  };

  const sourceWallet = walletByChain(originChainId);
  const requestedAmountUnits = BigInt(toTokenUnits(sweepUsdTarget, 6));
  const amountResolution = await resolveOriginSpendAmount({
    originChainId,
    originCurrency,
    walletByChain,
    requestedAmountUnits,
  });
  const amount = amountResolution.amountUnits.toString();

  const quotePayload = {
    user: sourceWallet.address,
    recipient,
    originChainId,
    destinationChainId: SOLANA_CHAIN_ID,
    originCurrency,
    destinationCurrency: env('KYO_TRADING_ROUTE_EARNINGS_SWEEP_DESTINATION_CURRENCY', SOLANA_NATIVE_ADDRESS) || SOLANA_NATIVE_ADDRESS,
    amount,
    tradeType: 'EXACT_INPUT',
    useExternalLiquidity: false,
    disableEstimate: false,
  };

  const quote = await postJson(`${apiBase.replace(/\/$/, '')}/quote/v2`, quotePayload);
  const steps = Array.isArray(quote?.steps) ? quote.steps : [];
  if (steps.length === 0) {
    fail('relay_quote_missing_steps', 'relay quote did not return executable steps', {
      quote,
    });
  }

  const txHashes = [];
  for (const step of steps) {
    const kind = String(step?.kind || '').trim().toLowerCase();
    if (!kind) {
      continue;
    }
    if (kind === 'transaction') {
      const hashes = await executeTransactionStep({ step, walletByChain });
      txHashes.push(...hashes);
      continue;
    }
    const allComplete = Array.isArray(step?.items) && step.items.every((item) => String(item?.status || '').toLowerCase() === 'complete');
    if (allComplete) {
      continue;
    }
    fail('unsupported_relay_step_kind', 'relay quote returned unsupported step kind for sweep worker', {
      stepId: step?.id || null,
      kind,
    });
  }

  const requestId = parseRequestId(steps);
  let statusPayload = null;
  if (requestId) {
    statusPayload = await waitForStatus({
      apiBase,
      requestId,
      timeoutMs: Math.max(30000, Math.floor(envNumber('KYO_TRADING_ROUTE_EARNINGS_SWEEP_TIMEOUT_MS', DEFAULT_TIMEOUT_MS))),
      pollMs: Math.max(1000, Math.floor(envNumber('KYO_TRADING_ROUTE_EARNINGS_SWEEP_POLL_MS', DEFAULT_POLL_MS))),
    });
  }

  const statusHashes = parseStatusHashes(statusPayload);
  const destinationTxHash = statusHashes[statusHashes.length - 1] || txHashes[txHashes.length - 1] || '';
  if (!destinationTxHash) {
    fail('relay_missing_tx_hash', 'unable to determine sweep transaction hash', {
      requestId,
      txHashes,
      statusPayload,
    });
  }

  const estimatedOutRaw =
    quote?.details?.currencyOut?.amount ||
    quote?.details?.toAmount ||
    quote?.details?.amountOut ||
    quote?.destination?.amount ||
    '0';
  const sweptSol = Math.max(0, fromTokenUnits(estimatedOutRaw, 9));

  const result = {
    txSignature: destinationTxHash,
    sweptSol: Number(sweptSol.toFixed(9)),
    requestId,
    originTxHash: txHashes[0] || '',
    destinationTxHash,
    sweepInputUsd: Number(toUnitsFloat(amountResolution.amountUnits, 6).toFixed(6)),
    sweepInputRequestedUsd: Number(toUnitsFloat(amountResolution.requestedAmountUnits, 6).toFixed(6)),
    sweepInputAvailableUsd: Number(toUnitsFloat(amountResolution.availableAmountUnits, 6).toFixed(6)),
    sweepInputPartial: amountResolution.partial,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  fail('earnings_sweep_bridge_failed', 'earnings sweep bridge worker failed', {
    reason: String(error?.message || error),
  });
});
