/**
 * Python Verifier Bridge
 *
 * Bridges the Node.js SaaS layer with the Python payment verifier
 * Provides two integration methods: HTTP API and Direct Execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    const verifierUrl = process.env.PYTHON_VERIFIER_URL || 'http://localhost:8000';

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
        timeout: 30000 // 30 second timeout
      });

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
        errorMessage: data.error_message || data.errorMessage
      };

    } catch (error) {
      throw new Error(`Python verifier HTTP call failed: ${error.message}`);
    }
  }

  /**
   * Call Python payment verifier via direct execution
   * This works but is slower and less production-ready than HTTP API
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async callViaDirect(txHash, chain, expectedAmount = null) {
    // Escape inputs to prevent injection
    const safeTxHash = txHash.replace(/'/g, "\\'");
    const safeChain = chain.replace(/'/g, "\\'");
    const safeAmount = expectedAmount ? `Decimal('${expectedAmount}')` : 'None';

    const pythonCode = `
import asyncio
import json
import sys
from decimal import Decimal
from api.x402.payment_verifier import payment_verifier

async def verify():
    try:
        result = await payment_verifier.verify_payment(
            tx_hash='${safeTxHash}',
            chain='${safeChain}',
            expected_amount=${safeAmount}
        )

        output = {
            'isValid': result.is_valid,
            'txHash': result.tx_hash,
            'chain': result.chain,
            'amountUsdc': str(result.amount_usdc),
            'fromAddress': result.from_address,
            'toAddress': result.to_address,
            'confirmations': result.confirmations,
            'riskScore': result.risk_score,
            'errorMessage': result.error_message
        }

        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({
            'isValid': False,
            'error': str(e)
        }), file=sys.stderr)
        sys.exit(1)

asyncio.run(verify())
`;

    try {
      const { stdout, stderr } = await execAsync(`python3 -c "${pythonCode}"`, {
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout
      });

      if (stderr && !stdout) {
        throw new Error(`Python execution failed: ${stderr}`);
      }

      const result = JSON.parse(stdout);

      if (result.error) {
        throw new Error(result.error);
      }

      return result;

    } catch (error) {
      throw new Error(`Python verifier direct call failed: ${error.message}`);
    }
  }

  /**
   * Auto-select the best available method
   * Tries HTTP first, falls back to direct execution
   *
   * @param {string} txHash - Transaction hash
   * @param {string} chain - Blockchain network
   * @param {number} expectedAmount - Expected amount
   * @returns {Promise<object>}
   */
  static async call(txHash, chain, expectedAmount = null) {
    // Try HTTP API if URL is configured
    if (process.env.PYTHON_VERIFIER_URL) {
      try {
        return await this.callViaHTTP(txHash, chain, expectedAmount);
      } catch (error) {
        console.warn('HTTP verifier failed, falling back to direct execution:', error.message);
      }
    }

    // Fall back to direct execution
    return await this.callViaDirect(txHash, chain, expectedAmount);
  }
}
