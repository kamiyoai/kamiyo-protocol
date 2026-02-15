export function parseSecretKey(raw: string): Uint8Array | null {
  const input = raw.trim();

  if (input.startsWith('[')) {
    try {
      const arr = JSON.parse(input) as unknown;
      if (!Array.isArray(arr)) return null;
      const nums = arr.map(n => Number(n));
      if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null;
      return Uint8Array.from(nums);
    } catch {
      return null;
    }
  }

  if (input.includes(',')) {
    const parts = input.split(',').map(s => s.trim()).filter(Boolean);
    const nums = parts.map(n => Number(n));
    if (nums.length < 32) return null;
    if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return Uint8Array.from(nums);
  }

  try {
    const buf = Buffer.from(input, 'base64');
    if (buf.length < 32) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

