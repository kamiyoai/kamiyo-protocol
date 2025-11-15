import axios from 'axios';
import {
  TokenApproval,
  SupportedChain,
  MAX_UINT256,
  CHAIN_IDS,
} from '../types/approval.types.js';
import { logger } from '../utils/logger.js';

interface EtherscanApproval {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
}

export class ApprovalScanner {
  private etherscanApiKeys: Record<string, string>;
  private cache: Map<string, { data: TokenApproval[]; timestamp: number }>;
  private cacheTTL = 60000; // 1 minute

  constructor() {
    this.etherscanApiKeys = {
      ethereum: process.env.ETHERSCAN_API_KEY || '',
      polygon: process.env.POLYGONSCAN_API_KEY || '',
      bsc: process.env.BSCSCAN_API_KEY || '',
      arbitrum: process.env.ARBISCAN_API_KEY || '',
      optimism: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || '',
      base: process.env.BASESCAN_API_KEY || '',
      avalanche: process.env.SNOWTRACE_API_KEY || '',
    };
    this.cache = new Map();
  }

  async scanWalletApprovals(
    wallet: string,
    chains: SupportedChain[]
  ): Promise<TokenApproval[]> {
    const cacheKey = `${wallet}-${chains.join(',')}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.info('Returning cached approval data', { wallet, chains });
      return cached.data;
    }

    const allApprovals: TokenApproval[] = [];

    for (const chain of chains) {
      try {
        const approvals = await this.fetchChainApprovals(wallet, chain);
        allApprovals.push(...approvals);
      } catch (error) {
        logger.error(`Failed to fetch approvals for ${chain}`, error, {
          wallet,
          chain,
        });
      }
    }

    this.cache.set(cacheKey, {
      data: allApprovals,
      timestamp: Date.now(),
    });

    return allApprovals;
  }

  private async fetchChainApprovals(
    wallet: string,
    chain: SupportedChain
  ): Promise<TokenApproval[]> {
    const apiKey = this.etherscanApiKeys[chain];
    if (!apiKey) {
      logger.warn(`No API key configured for ${chain}`);
      return [];
    }

    const baseUrls: Record<SupportedChain, string> = {
      ethereum: 'https://api.etherscan.io/api',
      polygon: 'https://api.polygonscan.com/api',
      bsc: 'https://api.bscscan.com/api',
      arbitrum: 'https://api.arbiscan.io/api',
      optimism: 'https://api-optimistic.etherscan.io/api',
      base: 'https://api.basescan.org/api',
      avalanche: 'https://api.snowtrace.io/api',
    };

    const baseUrl = baseUrls[chain];

    try {
      // Fetch ERC20 token approval events
      const response = await axios.get(baseUrl, {
        params: {
          module: 'account',
          action: 'tokentx',
          address: wallet,
          startblock: 0,
          endblock: 99999999,
          sort: 'desc',
          apikey: apiKey,
        },
        timeout: 10000,
      });

      if (response.data.status !== '1') {
        logger.warn(`Etherscan API returned error for ${chain}`, {
          message: response.data.message,
        });
        return [];
      }

      const transactions: EtherscanApproval[] = response.data.result || [];

      // Get current allowances for unique token-spender pairs
      const approvalPairs = new Map<
        string,
        { token: string; spender: string; tx: EtherscanApproval }
      >();

      for (const tx of transactions) {
        const key = `${tx.contractAddress}-${tx.to}`;
        if (!approvalPairs.has(key) && tx.from.toLowerCase() === wallet.toLowerCase()) {
          approvalPairs.set(key, {
            token: tx.contractAddress,
            spender: tx.to,
            tx,
          });
        }
      }

      // Check current allowances
      const approvals: TokenApproval[] = [];
      for (const [, pair] of approvalPairs) {
        try {
          const allowance = await this.getCurrentAllowance(
            pair.token,
            wallet,
            pair.spender,
            chain
          );

          if (allowance && allowance !== '0') {
            approvals.push({
              token_address: pair.token,
              token_symbol: pair.tx.tokenSymbol,
              token_name: pair.tx.tokenName,
              spender_address: pair.spender,
              allowance,
              is_unlimited: allowance === MAX_UINT256,
              last_updated: new Date(parseInt(pair.tx.timeStamp) * 1000).toISOString(),
              transaction_hash: pair.tx.hash,
            });
          }
        } catch (error) {
          logger.error('Failed to get allowance', error, {
            token: pair.token,
            spender: pair.spender,
          });
        }
      }

      logger.info(`Found ${approvals.length} active approvals on ${chain}`, {
        wallet,
        chain,
      });

      return approvals;
    } catch (error) {
      logger.error(`Failed to fetch approvals from ${chain}`, error);
      return [];
    }
  }

  private async getCurrentAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    chain: SupportedChain
  ): Promise<string> {
    const apiKey = this.etherscanApiKeys[chain];
    const baseUrls: Record<SupportedChain, string> = {
      ethereum: 'https://api.etherscan.io/api',
      polygon: 'https://api.polygonscan.com/api',
      bsc: 'https://api.bscscan.com/api',
      arbitrum: 'https://api.arbiscan.io/api',
      optimism: 'https://api-optimistic.etherscan.io/api',
      base: 'https://api.basescan.org/api',
      avalanche: 'https://api.snowtrace.io/api',
    };

    const baseUrl = baseUrls[chain];

    // ERC20 allowance(address owner, address spender) function
    const data = `0xdd62ed3e${owner.slice(2).padStart(64, '0')}${spender
      .slice(2)
      .padStart(64, '0')}`;

    try {
      const response = await axios.get(baseUrl, {
        params: {
          module: 'proxy',
          action: 'eth_call',
          to: tokenAddress,
          data,
          tag: 'latest',
          apikey: apiKey,
        },
        timeout: 5000,
      });

      if (response.data.result) {
        return response.data.result;
      }

      return '0';
    } catch (error) {
      logger.error('Failed to fetch current allowance', error);
      return '0';
    }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      ttl_ms: this.cacheTTL,
    };
  }
}
