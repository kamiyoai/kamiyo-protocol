export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export function safeSerialize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
