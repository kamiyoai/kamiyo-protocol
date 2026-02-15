import { describe, expect, it } from 'vitest';
import { TRUST_EVIDENCE_TYPES } from '../types';

describe('plugin-trust contract', () => {
  it('uses only TrustEvidenceType values defined by @elizaos/plugin-trust', async () => {
    const pluginTrust = await import('@elizaos/plugin-trust');
    const valid = new Set(Object.values(pluginTrust.TrustEvidenceType));

    for (const t of TRUST_EVIDENCE_TYPES) {
      expect(valid.has(t), `unknown evidence type: ${t}`).toBe(true);
    }
  });
});

