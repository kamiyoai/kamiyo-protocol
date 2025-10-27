/**
 * KAMIYO x402 Payment SDK for JavaScript
 * 
 * This SDK enables AI agents to make x402 payments and access
 * KAMIYO exploit intelligence data through HTTP 402 payments.
 */

class KamiyoX402SDK {
    /**
     * Create a new KAMIYO x402 SDK instance
     * @param {Object} options - SDK configuration options
     * @param {string} options.apiBaseUrl - KAMIYO API base URL (default: https://api.kamiyo.ai)
     * @param {string} options.paymentAddress - Default payment address for on-chain payments
     */
    constructor(options = {}) {
        this.apiBaseUrl = options.apiBaseUrl || 'https://api.kamiyo.ai';
        this.paymentAddress = options.paymentAddress;
        this.paymentToken = options.paymentToken;
        this.currentPaymentId = null;
    }

    /**
     * Get supported chains and payment information
     * @returns {Promise<Object>} Supported chains and payment details
     */
    async getSupportedChains() {
        const response = await this._makeRequest('/x402/supported-chains');
        return response;
    }

    /**
     * Verify on-chain payment and get payment record
     * @param {string} txHash - Transaction hash
     * @param {string} chain - Blockchain network ('base', 'ethereum', 'solana')
     * @param {number} expectedAmount - Expected payment amount in USDC (optional)
     * @returns {Promise<Object>} Payment verification result
     */
    async verifyPayment(txHash, chain = 'base', expectedAmount = null) {
        const payload = {
            tx_hash: txHash,
            chain: chain
        };

        if (expectedAmount !== null) {
            payload.expected_amount = expectedAmount;
        }

        const response = await this._makeRequest('/x402/verify-payment', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.payment_id) {
            this.currentPaymentId = response.payment_id;
        }

        return response;
    }

    /**
     * Generate payment token for verified payment
     * @param {number} paymentId - Payment ID from verifyPayment
     * @returns {Promise<Object>} Payment token information
     */
    async generatePaymentToken(paymentId = null) {
        const targetPaymentId = paymentId || this.currentPaymentId;
        
        if (!targetPaymentId) {
            throw new Error('No payment ID provided and no current payment available');
        }

        const response = await this._makeRequest(`/x402/generate-token/${targetPaymentId}`, {
            method: 'POST'
        });

        this.paymentToken = response.payment_token;
        return response;
    }

    /**
     * Get payment status and remaining requests
     * @param {number} paymentId - Payment ID
     * @returns {Promise<Object>} Payment status information
     */
    async getPaymentStatus(paymentId = null) {
        const targetPaymentId = paymentId || this.currentPaymentId;
        
        if (!targetPaymentId) {
            throw new Error('No payment ID provided and no current payment available');
        }

        return await this._makeRequest(`/x402/payment/${targetPaymentId}`);
    }

    /**
     * Get exploit data with x402 payment
     * @param {Object} options - Exploit query options
     * @param {number} options.page - Page number (default: 1)
     * @param {number} options.pageSize - Items per page (default: 100)
     * @param {string} options.chain - Filter by blockchain
     * @param {number} options.minAmount - Minimum loss amount (USD)
     * @param {string} options.protocol - Filter by protocol name
     * @returns {Promise<Object>} Exploit data
     */
    async getExploits(options = {}) {
        const params = new URLSearchParams();
        
        if (options.page) params.append('page', options.page.toString());
        if (options.pageSize) params.append('page_size', options.pageSize.toString());
        if (options.chain) params.append('chain', options.chain);
        if (options.minAmount) params.append('min_amount', options.minAmount.toString());
        if (options.protocol) params.append('protocol', options.protocol);

        const queryString = params.toString();
        const url = `/exploits${queryString ? '?' + queryString : ''}`;

        return await this._makePaidRequest(url);
    }

    /**
     * Get statistics with x402 payment
     * @param {number} days - Time period in days (default: 1)
     * @returns {Promise<Object>} Statistics data
     */
    async getStats(days = 1) {
        return await this._makePaidRequest(`/stats?days=${days}`);
    }

    /**
     * Get chain information with x402 payment
     * @returns {Promise<Object>} Chain data
     */
    async getChains() {
        return await this._makePaidRequest('/chains');
    }

    /**
     * Get health information with x402 payment
     * @returns {Promise<Object>} Health data
     */
    async getHealth() {
        return await this._makePaidRequest('/health');
    }

    /**
     * Get risk score for a protocol
     * @param {string} protocol - Protocol name
     * @returns {Promise<Object>} Risk score information
     */
    async getRiskScore(protocol) {
        // This would integrate with KAMIYO's exploit risk scoring
        // For now, return a placeholder
        return await this._makePaidRequest(`/v2/analysis/risk?protocol=${encodeURIComponent(protocol)}`);
    }

    /**
     * Get payment statistics
     * @param {string} fromAddress - Filter by sender address (optional)
     * @returns {Promise<Object>} Payment statistics
     */
    async getPaymentStats(fromAddress = null) {
        const url = fromAddress 
            ? `/x402/stats?from_address=${encodeURIComponent(fromAddress)}`
            : '/x402/stats';
        
        return await this._makeRequest(url);
    }

    /**
     * Get pricing information
     * @returns {Promise<Object>} Pricing details
     */
    async getPricing() {
        return await this._makeRequest('/x402/pricing');
    }

    /**
     * Make a paid API request with x402 payment
     * @private
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} API response
     */
    async _makePaidRequest(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add payment authorization
        if (this.paymentToken) {
            headers['x-payment-token'] = this.paymentToken;
        }

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        });

        if (response.status === 402) {
            const paymentDetails = await response.json();
            throw new PaymentRequiredError('Payment required', paymentDetails);
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Make a free API request (for x402 endpoints)
     * @private
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise<Object>} API response
     */
    async _makeRequest(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Set payment token for subsequent requests
     * @param {string} token - Payment token
     */
    setPaymentToken(token) {
        this.paymentToken = token;
    }

    /**
     * Clear current payment token
     */
    clearPaymentToken() {
        this.paymentToken = null;
        this.currentPaymentId = null;
    }
}

/**
 * Payment Required Error
 * Thrown when API returns HTTP 402 Payment Required
 */
class PaymentRequiredError extends Error {
    constructor(message, paymentDetails) {
        super(message);
        this.name = 'PaymentRequiredError';
        this.paymentDetails = paymentDetails;
        this.statusCode = 402;
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = { KamiyoX402SDK, PaymentRequiredError };
} else if (typeof window !== 'undefined') {
    // Browser
    window.KamiyoX402SDK = KamiyoX402SDK;
    window.PaymentRequiredError = PaymentRequiredError;
}

export { KamiyoX402SDK, PaymentRequiredError };