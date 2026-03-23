export function parseBearerToken(header: string | undefined | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

export function isAuthorized(header: string | undefined | null, expectedToken: string): boolean {
  const actual = parseBearerToken(header);
  return actual !== null && actual === expectedToken;
}
