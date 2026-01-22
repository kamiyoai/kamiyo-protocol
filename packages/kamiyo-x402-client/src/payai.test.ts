import {
  PayAIFacilitator,
  PayAIError,
  createPayAIFacilitator,
  payaiMiddleware,
  withPayAI,
  NETWORKS,
  type PayAINetwork,
  type PaymentRequirement,
} from './payai';

describe('PayAIFacilitator', () => {
  const merchant = '0x1234567890123456789012345678901234567890';

  describe('constructor', () => {
    it('requires merchantAddress', () => {
      expect(() => new PayAIFacilitator({ merchantAddress: '' })).toThrow(PayAIError);
    });

    it('uses default facilitator URL', () => {
      const f = new PayAIFacilitator({ merchantAddress: merchant });
      expect(f).toBeDefined();
    });

    it('accepts custom facilitator URL', () => {
      const f = new PayAIFacilitator({
        merchantAddress: merchant,
        facilitatorUrl: 'https://custom.facilitator.com',
      });
      expect(f).toBeDefined();
    });

    it('accepts custom timeout', () => {
      const f = new PayAIFacilitator({
        merchantAddress: merchant,
        timeoutMs: 60000,
      });
      expect(f).toBeDefined();
    });

    it('accepts default network', () => {
      const f = new PayAIFacilitator({
        merchantAddress: merchant,
        defaultNetwork: 'polygon',
      });
      expect(f).toBeDefined();
    });
  });

  describe('static utilities', () => {
    it('toMicro converts USDC to micro-units', () => {
      expect(PayAIFacilitator.toMicro(1)).toBe('1000000');
      expect(PayAIFacilitator.toMicro(0.01)).toBe('10000');
      expect(PayAIFacilitator.toMicro(0.000001)).toBe('1');
    });

    it('fromMicro converts micro-units to USDC', () => {
      expect(PayAIFacilitator.fromMicro('1000000')).toBe(1);
      expect(PayAIFacilitator.fromMicro(10000)).toBe(0.01);
      expect(PayAIFacilitator.fromMicro('1')).toBe(0.000001);
    });

    it('explorerUrl generates correct URLs', () => {
      const tx = '0xabc123';
      expect(PayAIFacilitator.explorerUrl('base', tx)).toBe('https://basescan.org/tx/0xabc123');
      expect(PayAIFacilitator.explorerUrl('polygon', tx)).toBe('https://polygonscan.com/tx/0xabc123');
    });

    it('explorerUrl handles Solana', () => {
      const tx = '5abc123';
      expect(PayAIFacilitator.explorerUrl('solana', tx)).toBe('https://solscan.io/tx/5abc123');
      expect(PayAIFacilitator.explorerUrl('solana-devnet', tx)).toContain('cluster=devnet');
    });

    it('isMainnet returns true for mainnet networks', () => {
      expect(PayAIFacilitator.isMainnet('base')).toBe(true);
      expect(PayAIFacilitator.isMainnet('polygon')).toBe(true);
      expect(PayAIFacilitator.isMainnet('solana')).toBe(true);
    });

    it('isMainnet returns false for testnets', () => {
      expect(PayAIFacilitator.isMainnet('base-sepolia')).toBe(false);
      expect(PayAIFacilitator.isMainnet('solana-devnet')).toBe(false);
    });

    it('isEVM returns true for EVM networks', () => {
      expect(PayAIFacilitator.isEVM('base')).toBe(true);
      expect(PayAIFacilitator.isEVM('polygon')).toBe(true);
    });

    it('isEVM returns false for Solana', () => {
      expect(PayAIFacilitator.isEVM('solana')).toBe(false);
      expect(PayAIFacilitator.isEVM('solana-devnet')).toBe(false);
    });

    it('mainnets returns only mainnet networks', () => {
      const mainnets = PayAIFacilitator.mainnets();
      expect(mainnets).toContain('base');
      expect(mainnets).not.toContain('base-sepolia');
    });

    it('testnets returns only testnet networks', () => {
      const testnets = PayAIFacilitator.testnets();
      expect(testnets).toContain('base-sepolia');
      expect(testnets).not.toContain('base');
    });

    it('getNetworkConfig returns config for network', () => {
      const config = PayAIFacilitator.getNetworkConfig('base');
      expect(config.name).toBe('Base');
      expect(config.chainId).toBe(8453);
      expect(config.usdc).toBeTruthy();
    });

    it('getChainId returns EIP-155 identifier', () => {
      expect(PayAIFacilitator.getChainId('base')).toBe('eip155:8453');
      expect(PayAIFacilitator.getChainId('solana')).toBe('solana:mainnet');
    });

    it('hasUsdcSupport returns true for networks with USDC', () => {
      expect(PayAIFacilitator.hasUsdcSupport('base')).toBe(true);
      expect(PayAIFacilitator.hasUsdcSupport('polygon')).toBe(true);
      expect(PayAIFacilitator.hasUsdcSupport('solana')).toBe(true);
    });

    it('hasUsdcSupport returns false for networks without USDC', () => {
      expect(PayAIFacilitator.hasUsdcSupport('peaq')).toBe(false);
      expect(PayAIFacilitator.hasUsdcSupport('sei-testnet')).toBe(false);
    });

    it('mainnetsWithUsdc excludes networks without USDC', () => {
      const networks = PayAIFacilitator.mainnetsWithUsdc();
      expect(networks).not.toContain('peaq');
      expect(networks).toContain('base');
    });

    it('testnetsWithUsdc excludes networks without USDC', () => {
      const networks = PayAIFacilitator.testnetsWithUsdc();
      expect(networks).not.toContain('sei-testnet');
      expect(networks).toContain('base-sepolia');
    });

    it('evmNetworks excludes Solana', () => {
      const networks = PayAIFacilitator.evmNetworks();
      expect(networks).not.toContain('solana');
      expect(networks).not.toContain('solana-devnet');
      expect(networks).toContain('base');
    });
  });

  describe('requirement', () => {
    const f = new PayAIFacilitator({ merchantAddress: merchant });

    it('creates payment requirement with defaults', () => {
      const req = f.requirement('/api/test', 0.01, 'Test payment');
      expect(req.scheme).toBe('exact');
      expect(req.network).toBe('base');
      expect(req.maxAmountRequired).toBe('10000');
      expect(req.resource).toBe('/api/test');
      expect(req.description).toBe('Test payment');
      expect(req.payTo).toBe(merchant);
      expect(req.asset).toBe('USDC');
      expect(req.maxTimeoutSeconds).toBe(60);
    });

    it('accepts custom network', () => {
      const req = f.requirement('/api/test', 0.01, 'Test', { network: 'polygon' });
      expect(req.network).toBe('polygon');
    });

    it('accepts upto scheme', () => {
      const req = f.requirement('/api/test', 0.01, 'Test', { scheme: 'upto' });
      expect(req.scheme).toBe('upto');
    });

    it('accepts custom timeout', () => {
      const req = f.requirement('/api/test', 0.01, 'Test', { timeout: 120 });
      expect(req.maxTimeoutSeconds).toBe(120);
    });

    it('accepts extra fields', () => {
      const req = f.requirement('/api/test', 0.01, 'Test', { extra: { custom: 'value' } });
      expect(req.extra).toEqual({ custom: 'value' });
    });
  });

  describe('requirements', () => {
    const f = new PayAIFacilitator({ merchantAddress: merchant });

    it('creates requirements for mainnets with USDC by default', () => {
      const reqs = f.requirements('/api/test', 0.01, 'Test');
      const mainnetsWithUsdc = PayAIFacilitator.mainnetsWithUsdc();
      expect(reqs.length).toBe(mainnetsWithUsdc.length);
      // Verify all returned networks have USDC support
      for (const req of reqs) {
        expect(PayAIFacilitator.hasUsdcSupport(req.network)).toBe(true);
      }
    });

    it('creates requirements for specified networks', () => {
      const reqs = f.requirements('/api/test', 0.01, 'Test', ['base', 'polygon']);
      expect(reqs.length).toBe(2);
      expect(reqs[0].network).toBe('base');
      expect(reqs[1].network).toBe('polygon');
    });
  });

  describe('response402', () => {
    const f = new PayAIFacilitator({ merchantAddress: merchant });

    it('creates 402 response body', () => {
      const response = f.response402('/api/test', 0.01, 'Test payment');
      expect(response.x402Version).toBe(1);
      expect(response.error).toBe('Payment Required');
      expect(response.facilitator).toBe(PayAIFacilitator.URL);
      expect(response.accepts.length).toBeGreaterThan(0);
    });

    it('limits to specified networks', () => {
      const response = f.response402('/api/test', 0.01, 'Test', ['base']);
      expect(response.accepts.length).toBe(1);
      expect(response.accepts[0].network).toBe('base');
    });
  });

  describe('headers402', () => {
    const f = new PayAIFacilitator({ merchantAddress: merchant });

    it('creates WWW-Authenticate header', () => {
      const headers = f.headers402('/api/test', 0.01, 'Test');
      expect(headers['WWW-Authenticate']).toContain('X402');
      expect(headers['WWW-Authenticate']).toContain('scheme="exact"');
    });

    it('includes payment details in headers', () => {
      const headers = f.headers402('/api/test', 0.01, 'Test', 'base');
      expect(headers['X-Payment-Network']).toBe('base');
      expect(headers['X-Payment-Amount']).toBe('10000');
      expect(headers['X-Payment-Asset']).toBe('USDC');
      expect(headers['X-Payment-PayTo']).toBe(merchant);
      expect(headers['X-Payment-Facilitator']).toBe(PayAIFacilitator.URL);
    });

    it('includes chain-specific info', () => {
      const headers = f.headers402('/api/test', 0.01, 'Test', 'base');
      expect(headers['X-Payment-Chain-Id']).toBe('eip155:8453');
      expect(headers['X-Payment-Asset-Address']).toBe(NETWORKS.base.usdc);
    });
  });

  describe('cache', () => {
    const f = new PayAIFacilitator({ merchantAddress: merchant });

    it('starts with empty cache', () => {
      expect(f.getCacheSize()).toBe(0);
    });

    it('clearCache empties the cache', () => {
      f.clearCache();
      expect(f.getCacheSize()).toBe(0);
    });
  });
});

describe('PayAIError', () => {
  it('creates error with code', () => {
    const err = new PayAIError('Test error', 'NETWORK_ERROR');
    expect(err.message).toBe('Test error');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.name).toBe('PayAIError');
  });

  it('includes details', () => {
    const err = new PayAIError('Test', 'TIMEOUT', { retryAfter: 30 });
    expect(err.details).toEqual({ retryAfter: 30 });
  });
});

describe('createPayAIFacilitator', () => {
  it('creates facilitator with defaults', () => {
    const f = createPayAIFacilitator('0x123');
    expect(f).toBeInstanceOf(PayAIFacilitator);
  });

  it('accepts options', () => {
    const f = createPayAIFacilitator('0x123', { defaultNetwork: 'polygon' });
    expect(f).toBeInstanceOf(PayAIFacilitator);
  });
});

describe('NETWORKS', () => {
  it('has all expected mainnet networks', () => {
    expect(NETWORKS.base).toBeDefined();
    expect(NETWORKS.polygon).toBeDefined();
    expect(NETWORKS.arbitrum).toBeDefined();
    expect(NETWORKS.optimism).toBeDefined();
    expect(NETWORKS.avalanche).toBeDefined();
    expect(NETWORKS.solana).toBeDefined();
  });

  it('has testnet variants', () => {
    expect(NETWORKS['base-sepolia']).toBeDefined();
    expect(NETWORKS['polygon-amoy']).toBeDefined();
    expect(NETWORKS['solana-devnet']).toBeDefined();
  });

  it('mainnets have valid USDC addresses', () => {
    const mainnets: PayAINetwork[] = ['base', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'solana'];
    for (const network of mainnets) {
      expect(NETWORKS[network].usdc).not.toBe('0x0000000000000000000000000000000000000000');
    }
  });

  it('has correct chain IDs', () => {
    expect(NETWORKS.base.chainId).toBe(8453);
    expect(NETWORKS.polygon.chainId).toBe(137);
    expect(NETWORKS.arbitrum.chainId).toBe(42161);
  });
});

describe('payaiMiddleware', () => {
  const merchant = '0x1234567890123456789012345678901234567890';
  const facilitator = new PayAIFacilitator({ merchantAddress: merchant });

  const createMockRes = () => ({
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  });

  it('returns 402 when no payment header', async () => {
    const middleware = payaiMiddleware({
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
    });

    const req = { headers: {}, path: '/api/test' };
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(402);
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('x402Version', 1);
  });

  it('returns 402 when payment header is array', async () => {
    const middleware = payaiMiddleware({
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
    });

    const req = { headers: { 'x-payment': ['a', 'b'] }, path: '/api/test' };
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.statusCode).toBe(402);
  });

  it('skips check when skip returns true', async () => {
    const middleware = payaiMiddleware({
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
      skip: () => true,
    });

    const req = { headers: {}, path: '/api/test' };
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('sets payment headers on 402 response', async () => {
    const middleware = payaiMiddleware({
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
      networks: ['base'],
    });

    const req = { headers: {}, path: '/api/test' };
    const res = createMockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.headers['X-Payment-Network']).toBe('base');
    expect(res.headers['X-Payment-Amount']).toBe('10000');
  });
});

describe('withPayAI', () => {
  const merchant = '0x1234567890123456789012345678901234567890';
  const facilitator = new PayAIFacilitator({ merchantAddress: merchant });

  it('wraps handler and returns 402 when no payment', async () => {
    const handler = jest.fn().mockResolvedValue('success');
    const wrapped = withPayAI(handler, {
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
    });

    const req = { headers: {}, path: '/api/test' };
    const res = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
      setHeader: jest.fn(),
    };

    await wrapped(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(402);
  });

  it('skips payment check when skip returns true', async () => {
    const handler = jest.fn().mockResolvedValue('success');
    const wrapped = withPayAI(handler, {
      facilitator,
      priceUsd: 0.01,
      description: 'Test',
      skip: () => true,
    });

    const req = { headers: {}, path: '/api/test' };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };

    await wrapped(req, res);

    expect(handler).toHaveBeenCalled();
  });
});
