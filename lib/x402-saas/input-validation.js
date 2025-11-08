/**
 * Input Validation for x402 API
 *
 * Validates and sanitizes all user inputs to prevent attacks
 */

// Valid blockchain networks
const VALID_CHAINS = [
  'solana',
  'base',
  'ethereum',
  'polygon',
  'arbitrum',
  'optimism',
  'avalanche',
  'bsc'
];

// Transaction hash patterns by chain
const TX_HASH_PATTERNS = {
  solana: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/,  // Base58, 87-88 chars
  ethereum: /^0x[a-fA-F0-9]{64}$/,            // 0x + 64 hex chars
  base: /^0x[a-fA-F0-9]{64}$/,                // Same as Ethereum
  polygon: /^0x[a-fA-F0-9]{64}$/,
  arbitrum: /^0x[a-fA-F0-9]{64}$/,
  optimism: /^0x[a-fA-F0-9]{64}$/,
  avalanche: /^0x[a-fA-F0-9]{64}$/,
  bsc: /^0x[a-fA-F0-9]{64}$/
};

// Address patterns by chain
const ADDRESS_PATTERNS = {
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,    // Base58, 32-44 chars
  ethereum: /^0x[a-fA-F0-9]{40}$/,             // 0x + 40 hex chars
  base: /^0x[a-fA-F0-9]{40}$/,
  polygon: /^0x[a-fA-F0-9]{40}$/,
  arbitrum: /^0x[a-fA-F0-9]{40}$/,
  optimism: /^0x[a-fA-F0-9]{40}$/,
  avalanche: /^0x[a-fA-F0-9]{40}$/,
  bsc: /^0x[a-fA-F0-9]{40}$/
};

export class InputValidation {
  /**
   * Validate transaction hash
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @returns {{valid: boolean, error: string|null}}
   */
  static validateTxHash(txHash, chain) {
    if (!txHash || typeof txHash !== 'string') {
      return {
        valid: false,
        error: 'Transaction hash is required and must be a string'
      };
    }

    // Length check (prevent DoS)
    if (txHash.length > 200) {
      return {
        valid: false,
        error: 'Transaction hash too long (max 200 characters)'
      };
    }

    // Normalize chain name
    const chainLower = chain.toLowerCase();

    // Check pattern for specific chain
    const pattern = TX_HASH_PATTERNS[chainLower];
    if (pattern && !pattern.test(txHash)) {
      return {
        valid: false,
        error: `Invalid transaction hash format for ${chain} network`
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Validate blockchain network name
   *
   * @param {string} chain - Blockchain network
   * @returns {{valid: boolean, error: string|null, normalized: string|null}}
   */
  static validateChain(chain) {
    if (!chain || typeof chain !== 'string') {
      return {
        valid: false,
        error: 'Chain parameter is required and must be a string',
        normalized: null
      };
    }

    const chainLower = chain.toLowerCase();

    if (!VALID_CHAINS.includes(chainLower)) {
      return {
        valid: false,
        error: `Invalid chain. Supported: ${VALID_CHAINS.join(', ')}`,
        normalized: null
      };
    }

    return {
      valid: true,
      error: null,
      normalized: chainLower
    };
  }

  /**
   * Validate USDC amount
   *
   * @param {number|string} amount - Amount in USDC
   * @returns {{valid: boolean, error: string|null, value: number|null}}
   */
  static validateAmount(amount) {
    if (amount === null || amount === undefined) {
      return { valid: true, error: null, value: null };
    }

    // Convert to number
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numAmount)) {
      return {
        valid: false,
        error: 'Amount must be a valid number',
        value: null
      };
    }

    if (numAmount <= 0) {
      return {
        valid: false,
        error: 'Amount must be positive',
        value: null
      };
    }

    if (numAmount > 1000000) {
      return {
        valid: false,
        error: 'Amount exceeds maximum (1,000,000 USDC)',
        value: null
      };
    }

    // Check decimal places (USDC has 6 decimals)
    const decimalPlaces = (numAmount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 6) {
      return {
        valid: false,
        error: 'Amount has too many decimal places (max 6 for USDC)',
        value: null
      };
    }

    return { valid: true, error: null, value: numAmount };
  }

  /**
   * Validate wallet address
   *
   * @param {string} address - Wallet address
   * @param {string} chain - Blockchain network
   * @returns {{valid: boolean, error: string|null}}
   */
  static validateAddress(address, chain) {
    if (!address || typeof address !== 'string') {
      return {
        valid: false,
        error: 'Address is required and must be a string'
      };
    }

    // Length check
    if (address.length > 100) {
      return {
        valid: false,
        error: 'Address too long (max 100 characters)'
      };
    }

    const chainLower = chain.toLowerCase();
    const pattern = ADDRESS_PATTERNS[chainLower];

    if (pattern && !pattern.test(address)) {
      return {
        valid: false,
        error: `Invalid address format for ${chain} network`
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Validate API key format
   *
   * @param {string} apiKey - API key
   * @returns {{valid: boolean, error: string|null}}
   */
  static validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        valid: false,
        error: 'API key is required and must be a string'
      };
    }

    // Check prefix
    if (!apiKey.startsWith('x402_live_') && !apiKey.startsWith('x402_test_')) {
      return {
        valid: false,
        error: 'Invalid API key format (must start with x402_live_ or x402_test_)'
      };
    }

    // Length check
    if (apiKey.length < 50 || apiKey.length > 100) {
      return {
        valid: false,
        error: 'Invalid API key length'
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Validate days parameter (for analytics)
   *
   * @param {number|string} days - Number of days
   * @returns {{valid: boolean, error: string|null, value: number|null}}
   */
  static validateDays(days) {
    if (days === null || days === undefined) {
      return { valid: true, error: null, value: 30 }; // Default
    }

    const numDays = typeof days === 'string' ? parseInt(days, 10) : days;

    if (isNaN(numDays) || !Number.isInteger(numDays)) {
      return {
        valid: false,
        error: 'Days must be an integer',
        value: null
      };
    }

    if (numDays < 1 || numDays > 90) {
      return {
        valid: false,
        error: 'Days must be between 1 and 90',
        value: null
      };
    }

    return { valid: true, error: null, value: numDays };
  }

  /**
   * Get list of supported chains
   *
   * @returns {string[]}
   */
  static getSupportedChains() {
    return [...VALID_CHAINS];
  }
}
