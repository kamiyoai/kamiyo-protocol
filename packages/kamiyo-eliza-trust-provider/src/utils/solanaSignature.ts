const SOLSCAN_TX_RE = /solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{43,88})/i;
const BASE58_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{43,88}$/;

export function parseSolanaSignature(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  const match = text.match(SOLSCAN_TX_RE);
  if (match?.[1] && BASE58_SIG_RE.test(match[1])) return match[1];

  if (BASE58_SIG_RE.test(text)) return text;

  return null;
}

