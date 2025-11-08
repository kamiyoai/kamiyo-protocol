/**
 * Python Verifier Bridge
 *
 * Bridges the Node.js SaaS layer with the Python payment verifier
 * Provides two integration methods: HTTP API and Direct Execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { CircuitBreaker } from './circuit-breaker.js';

const execAsync = promisify(exec);

// Circuit breaker for Python verifier HTTP calls
const verifierCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes
  timeout: 60000          // 1 minute cooldown
});

export class PythonVerifierBridge {
  /**
   * Call Python payment verifier via HTTP API
   * This is the recommended approach for production
   *
   * Prerequisites:
   * 1. Create FastAPI wrapper for payment_verifier.py
   * 2. Deploy as separate service or run alongside Next.js
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async callViaHTTP(txHash, chain, expectedAmount = null) {
    // Use circuit breaker to prevent cascade failures
    return await verifierCircuitBreaker.execute(async () => {
      const verifierUrl = process.env.PYTHON_VERIFIER_URL || 'http://localhost:8000';

      // Use AbortController for proper timeout handling
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(`${verifierUrl}/x402/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.PYTHON_VERIFIER_KEY || ''
          },
          body: JSON.stringify({
            tx_hash: txHash,
            chain: chain,
            expected_amount: expectedAmount
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Verifier API returned ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();

        return {
          isValid: data.is_valid || data.isValid,
          txHash: data.tx_hash || data.txHash,
          chain: data.chain,
          amountUsdc: data.amount_usdc || data.amountUsdc,
          fromAddress: data.from_address || data.fromAddress,
          toAddress: data.to_address || data.toAddress,
          confirmations: data.confirmations,
          riskScore: data.risk_score || data.riskScore,
          timestamp: data.timestamp,
          errorMessage: data.error_message || data.errorMessage
        };

      } catch (error) {
        clearTimeout(timeout);

        if (error.name === 'AbortError') {
          throw new Error('Python verifier timeout after 30 seconds');
        }

        throw new Error(`Python verifier HTTP call failed: ${error.message}`);
      }
    });
  }

  /**
   * Call Python payment verifier via direct execution
   * DEPRECATED: This method has been disabled due to security concerns.
   * Use HTTP API mode (PYTHON_VERIFIER_URL) instead.
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async callViaDirect(txHash, chain, expectedAmount = null) {
    // SECURITY: Direct execution disabled to prevent command injection
    // This method was vulnerable to code injection via crafted txHash values
    // Example attack: txHash = "\\'; malicious_code; #"
    //
    // To use x402 payment verification, you MUST deploy the Python verifier
    // as a separate HTTP API service and set PYTHON_VERIFIER_URL.
    //
    // See: PRODUCTION_SETUP.md for deployment instructions

    throw new Error(
      'Direct Python execution is disabled for security reasons. ' +
      'Please deploy the Python verifier as an HTTP API service and set ' +
      'PYTHON_VERIFIER_URL environment variable. ' +
      'See PRODUCTION_SETUP.md for instructions.'
    );
  }

  /**
   * Call Python verifier (HTTP API only)
   * SECURITY: Direct execution fallback has been disabled
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async call(txHash, chain, expectedAmount = null) {
    // Only use HTTP API mode for security
    if (!process.env.PYTHON_VERIFIER_URL) {
      throw new Error(
        'PYTHON_VERIFIER_URL environment variable is required. ' +
        'Direct Python execution has been disabled for security reasons. ' +
        'Please deploy the Python verifier as an HTTP API service. ' +
        'See PRODUCTION_SETUP.md for instructions.'
      );
    }

    return await this.callViaHTTP(txHash, chain, expectedAmount);
  }
}
