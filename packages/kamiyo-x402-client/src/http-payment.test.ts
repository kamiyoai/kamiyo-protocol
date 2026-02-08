import {
  normalizeFacilitatorPolicy,
  evaluateFacilitatorPolicy,
  getRequirementAmountRaw,
  parseUsdcAmountUsd,
  selectPreferredRequirement,
  withPaymentHeaders,
} from './http-payment';

describe('http-payment', () => {
  describe('normalizeFacilitatorPolicy', () => {
    it('normalizes known aliases', () => {
      expect(normalizeFacilitatorPolicy('require-kamiyo')).toBe('force-kamiyo');
      expect(normalizeFacilitatorPolicy('exclude-kamiyo')).toBe('disable-kamiyo');
      expect(normalizeFacilitatorPolicy('prefer')).toBe('prefer-kamiyo');
    });

    it('defaults to auto', () => {
      expect(normalizeFacilitatorPolicy(undefined)).toBe('auto');
      expect(normalizeFacilitatorPolicy('unknown')).toBe('auto');
    });
  });

  describe('evaluateFacilitatorPolicy', () => {
    it('blocks non-kamiyo facilitator when force-kamiyo policy is used', () => {
      const decision = evaluateFacilitatorPolicy('https://facilitator.payai.network', 'force-kamiyo');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('requires Kamiyo');
    });

    it('blocks kamiyo facilitator when disable-kamiyo policy is used', () => {
      const decision = evaluateFacilitatorPolicy('https://x402.kamiyo.ai', 'disable-kamiyo');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('excludes Kamiyo');
    });
  });

  describe('selectPreferredRequirement', () => {
    const requirements = [
      { network: 'eip155:8453', amount: '1000' },
      { network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', amount: '2000' },
    ];

    it('matches canonical network aliases', () => {
      const selected = selectPreferredRequirement(requirements, 'solana:mainnet');
      expect(selected.network).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('falls back to first requirement', () => {
      const selected = selectPreferredRequirement(requirements, 'eip155:1');
      expect(selected.network).toBe('eip155:8453');
    });
  });

  describe('amount helpers', () => {
    it('extracts amount from amount or maxAmountRequired', () => {
      expect(getRequirementAmountRaw({ network: 'eip155:8453', amount: '12345' })).toBe('12345');
      expect(getRequirementAmountRaw({ network: 'eip155:8453', maxAmountRequired: '54321' })).toBe('54321');
    });

    it('parses integer base units and decimal amounts', () => {
      expect(parseUsdcAmountUsd('1000')).toBe(0.001);
      expect(parseUsdcAmountUsd('0.0125')).toBe(0.0125);
    });
  });

  describe('withPaymentHeaders', () => {
    it('adds canonical and compatibility payment headers', () => {
      const headers = withPaymentHeaders('header-value', { 'Content-Type': 'application/json' });
      expect(headers['PAYMENT-SIGNATURE']).toBe('header-value');
      expect(headers['X-PAYMENT']).toBe('header-value');
      expect(headers['X-PAYMENT-SIGNATURE']).toBe('header-value');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
