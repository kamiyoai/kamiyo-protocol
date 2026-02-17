import { describe, expect, it } from 'vitest';

import { compileUsdcSpendPolicy } from './policies.js';

describe('compileUsdcSpendPolicy', () => {
  it('keeps Solana allowedMerchants case-sensitive', () => {
    const program = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const programLower = program.toLowerCase();

    const policy = compileUsdcSpendPolicy({
      description: 'test',
      network: 'solana',
      maxSpendMicroUsd: 1_000_000n,
      allowedMerchants: [program, programLower],
    });

    const accept = policy.rules.find(
      (rule) => rule.action === 'accept' && rule.operation === 'sendSolTransaction'
    );
    expect(accept).toBeTruthy();
    if (!accept) return;

    const criteria = accept.criteria as any[];
    const splAddress = criteria.find((c) => c.type === 'splAddress');
    expect(splAddress?.addresses).toEqual([program, programLower]);
  });

  it('dedupes Base allowedMerchants case-insensitively', () => {
    const policy = compileUsdcSpendPolicy({
      description: 'test',
      network: 'base',
      maxSpendMicroUsd: 1_000_000n,
      allowedMerchants: [
        '0x00000000000000000000000000000000000000Aa',
        '0x00000000000000000000000000000000000000aa',
      ],
    });

    const accept = policy.rules.find(
      (rule) => rule.action === 'accept' && rule.operation === 'sendEvmTransaction'
    );
    expect(accept).toBeTruthy();
    if (!accept) return;

    const criteria = accept.criteria as any[];
    const evmData = criteria.find((c) => c.type === 'evmData');
    const transfer = evmData?.conditions?.find((cond: any) => cond.function === 'transfer');
    expect(transfer?.params?.[0]?.values).toEqual(['0x00000000000000000000000000000000000000Aa']);
  });
});
