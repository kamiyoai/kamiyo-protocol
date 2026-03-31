import crypto from 'node:crypto';

export function fail(code, message, details = {}) {
  const error = new Error(message || code);
  error.code = code;
  error.details = details;
  throw error;
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCandidate() {
  const raw = process.env.KYO_TRADING_CANDIDATE_JSON || '';
  if (!raw.trim()) {
    fail('missing_candidate_json', 'KYO_TRADING_CANDIDATE_JSON is required');
  }
  try {
    const decoded = JSON.parse(raw);
    if (!decoded || typeof decoded !== 'object') {
      fail('invalid_candidate_json', 'candidate payload must decode to object');
    }
    return decoded;
  } catch (error) {
    fail('invalid_candidate_json', 'failed to parse KYO_TRADING_CANDIDATE_JSON', {
      reason: String(error?.message || error),
    });
  }
}

export function candidateMetadata(candidate) {
  const metadata = candidate?.metadata;
  if (metadata && typeof metadata === 'object') {
    return metadata;
  }
  return {};
}

export async function postJson(url, payload, headers = {}) {
  if (!url || !String(url).startsWith('https://')) {
    fail('invalid_order_url', 'order URL must be https://');
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'user-agent': 'kamiyo-agent-trading-bridge/1.0',
      ...headers,
    },
    body: JSON.stringify(payload ?? {}),
  });

  const rawBody = await response.text();
  let body = rawBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = rawBody;
  }

  if (!response.ok) {
    fail('order_request_failed', `bridge request failed with status ${response.status}`, {
      status: response.status,
      body,
    });
  }

  return body;
}

export function readTextEnv(name) {
  return String(process.env[name] || '').trim();
}

export function inferOrderId(response, fallbackSeed) {
  const direct = String(
    response?.orderId || response?.order_id || response?.id || response?.txHash || response?.signature || ''
  ).trim();
  if (direct) {
    return direct;
  }
  const digest = crypto
    .createHash('sha1')
    .update(`${fallbackSeed}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 18);
  return `bridge-${digest}`;
}

export function buildResult({
  orderId,
  positionId,
  grossUsd,
  costUsd,
  netUsd,
  realized,
  paymentRef,
  raw,
}) {
  return {
    orderId,
    positionId,
    grossUsd,
    costUsd,
    netUsd,
    realized,
    paymentRef,
    raw,
  };
}

export function printResult(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function printError(error) {
  const out = {
    ok: false,
    error: {
      code: String(error?.code || 'bridge_failed'),
      message: String(error?.message || 'bridge failed'),
      details: error?.details && typeof error.details === 'object' ? error.details : undefined,
    },
  };
  process.stderr.write(`${JSON.stringify(out)}\n`);
}
