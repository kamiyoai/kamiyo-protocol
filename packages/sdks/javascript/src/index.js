/**
 * x402 Infrastructure JavaScript/TypeScript SDK
 *
 * Official client for x402 payment verification API
 */

const BASE_URL = 'https://kamiyo.ai/api/v1/x402';

class X402Error extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'X402Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}

class X402QuotaExceeded extends X402Error {
  constructor(message = 'Monthly quota exceeded') {
    super(message, 'QUOTA_EXCEEDED', 429);
    this.name = 'X402QuotaExceeded';
  }
}

class X402AuthError extends X402Error {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'X402AuthError';
  }
}

class X402Client {
  /**
   * Initialize x402 client
   * @param {Object} options - Client options
   * @param {string} options.apiKey - Your x402 API key
   * @param {string} [options.baseUrl] - Custom API URL (for testing)
   */
  constructor(options) {
    if (!options || !options.apiKey) {
      throw new Error('API key is required');
    }

    if (!options.apiKey.startsWith('x402_live_') && !options.apiKey.startsWith('x402_test_')) {
      throw new Error('Invalid API key format. Must start with x402_live_ or x402_test_');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || BASE_URL;
  }

  /**
   * Make API request
   * @private
   */
  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        throw new X402QuotaExceeded(data.error || 'Monthly quota exceeded');
      }

      if (response.status === 401) {
        throw new X402AuthError(data.error || 'Invalid API key');
      }

      throw new X402Error(
        data.error || 'API request failed',
        data.errorCode || 'API_ERROR',
        response.status
      );
    }

    return data;
  }

  /**
   * Verify on-chain USDC payment
   *
   * @param {Object} params - Verification parameters
   * @param {string} params.txHash - Transaction hash to verify
   * @param {string} params.chain - Blockchain network (solana, base, ethereum, etc.)
   * @param {number} [params.expectedAmount] - Expected payment amount in USDC
   * @returns {Promise<Object>} Verification result
   *
   * @example
   * const result = await client.verifyPayment({
   *   txHash: '5KZ...',
   *   chain: 'solana',
   *   expectedAmount: 1.00
   * });
   *
   * if (result.success) {
   *   console.log(`Verified ${result.amountUsdc} USDC`);
   * }
   */
  async verifyPayment({ txHash, chain, expectedAmount }) {
    return this._request('/verify', {
      method: 'POST',
      body: JSON.stringify({
        tx_hash: txHash,
        chain,
        expected_amount: expectedAmount
      })
    });
  }

  /**
   * Get current usage statistics
   *
   * @returns {Promise<Object>} Usage statistics
   *
   * @example
   * const usage = await client.getUsage();
   * console.log(`Used: ${usage.verifications_used}/${usage.verifications_limit}`);
   */
  async getUsage() {
    return this._request('/usage');
  }

  /**
   * Get chains available for your tier
   *
   * @returns {Promise<Object>} Chain information
   *
   * @example
   * const chains = await client.getSupportedChains();
   * console.log('Enabled chains:', chains.enabled_chains);
   */
  async getSupportedChains() {
    return this._request('/supported-chains');
  }
}

// Export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    X402Client,
    X402Error,
    X402QuotaExceeded,
    X402AuthError
  };
}

// Export for ES modules
export { X402Client, X402Error, X402QuotaExceeded, X402AuthError };
export default X402Client;
