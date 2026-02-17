import { createCdpClient } from '@kamiyo/cdp';

let cached: ReturnType<typeof createCdpClient> | null = null;

export function getCdpClient(): ReturnType<typeof createCdpClient> {
  if (cached) return cached;
  cached = createCdpClient();
  return cached;
}
