/**
 * @dkg/plugin-kamiyo
 *
 * KAMIYO Quality Oracle plugin for OriginTrail DKG nodes.
 * Adds quality staking, oracle assessments, and quality-filtered queries.
 */

import type { PublicKey, Connection } from '@solana/web3.js';
import type BN from 'bn.js';

/**
 * DKG Plugin Context (provided by DKG node)
 */
export interface DkgPluginContext {
  logger: {
    info: (msg: string, meta?: object) => void;
    warn: (msg: string, meta?: object) => void;
    error: (msg: string, meta?: object) => void;
    debug: (msg: string, meta?: object) => void;
  };
  dkgClient: {
    publish: (content: object, options?: object) => Promise<string>;
    get: (ual: string) => Promise<{ content: unknown; metadata?: object }>;
    update: (ual: string, data: object) => Promise<void>;
    query: (sparql: string) => Promise<unknown[]>;
  };
  config: Record<string, unknown>;
}

/**
 * MCP Tools interface (provided by DKG node)
 */
export interface McpToolsInterface {
  register: (
    name: string,
    definition: {
      description: string;
      inputSchema: object;
      handler: (params: unknown) => Promise<unknown>;
    }
  ) => void;
}

/**
 * API interface (provided by DKG node)
 */
export interface ApiInterface {
  get: (path: string, handler: (req: unknown, res: unknown) => Promise<void>) => void;
  post: (path: string, handler: (req: unknown, res: unknown) => Promise<void>) => void;
}

/**
 * KAMIYO plugin configuration
 */
export interface KamiyoPluginConfig {
  solanaRpcUrl: string;
  programId: string;
  walletPath?: string;
  minStakeAmount?: number;
  verificationWindowHours?: number;
}

/**
 * Define DKG plugin (matches OriginTrail plugin spec)
 */
export function defineDkgPlugin(
  setup: (ctx: DkgPluginContext, mcp: McpToolsInterface, api: ApiInterface) => void | Promise<void>
) {
  return {
    name: 'kamiyo-quality-oracle',
    version: '0.1.0',
    setup,
  };
}

/**
 * KAMIYO Quality Oracle Plugin
 */
export default defineDkgPlugin(async (ctx, mcp, api) => {
  const { logger, dkgClient, config } = ctx;

  const kamiyoConfig = config.kamiyo as KamiyoPluginConfig | undefined;

  if (!kamiyoConfig) {
    logger.warn('KAMIYO config not provided, plugin running in limited mode');
  }

  logger.info('Initializing KAMIYO Quality Oracle plugin');

  // Import KAMIYO modules
  const { createQualityOracleSystem } = await import('@kamiyo/dkg-quality-oracle');

  const { stakingManager, oracleManager, provenanceTracker, disputeManager } =
    createQualityOracleSystem({
      stakingConfig: {
        verificationWindowHours: kamiyoConfig?.verificationWindowHours ?? 72,
      },
    });

  // ==================
  // MCP Tools
  // ==================

  mcp.register('kamiyo_stake_quality', {
    description: 'Stake SOL on Knowledge Asset quality. Stake returned if verified, slashed if disputed.',
    inputSchema: {
      type: 'object',
      properties: {
        assetUAL: { type: 'string', description: 'Asset UAL to stake on' },
        stakeAmount: { type: 'number', description: 'SOL to stake' },
      },
      required: ['assetUAL', 'stakeAmount'],
    },
    handler: async (params: any) => {
      try {
        const { Keypair } = await import('@solana/web3.js');
        const BN = (await import('bn.js')).default;

        // Load wallet (placeholder - real impl would use secure key management)
        const publisher = Keypair.generate().publicKey;

        const stake = await stakingManager.createQualityStake({
          assetUal: params.assetUAL,
          publisher,
          stakeAmount: new BN(params.stakeAmount * 1e9),
        });

        // Add stake reference to DKG asset metadata
        await dkgClient.update(params.assetUAL, {
          'kamiyo:qualityStake': stake.escrowPda.toBase58(),
          'kamiyo:stakeAmount': params.stakeAmount.toString(),
          'kamiyo:stakeStatus': 'pending',
        });

        logger.info('Quality stake created', {
          assetUAL: params.assetUAL,
          stakeAmount: params.stakeAmount,
        });

        return {
          success: true,
          escrowPda: stake.escrowPda.toBase58(),
          assetUAL: params.assetUAL,
          verificationDeadline: new Date(stake.verificationDeadline * 1000).toISOString(),
        };
      } catch (error: any) {
        logger.error('Failed to create quality stake', { error: error.message });
        return { success: false, error: error.message };
      }
    },
  });

  mcp.register('kamiyo_verify_and_pay', {
    description: 'Query DKG with quality verification and automatic payment via escrow',
    inputSchema: {
      type: 'object',
      properties: {
        sparql: { type: 'string', description: 'SPARQL query' },
        minQualityScore: { type: 'number', description: 'Minimum quality score' },
        maxPayment: { type: 'number', description: 'Max SOL for query' },
      },
      required: ['sparql'],
    },
    handler: async (params: any) => {
      try {
        const { DragQualityClient } = await import('@kamiyo/dkg-quality-oracle');

        const client = new DragQualityClient({
          query: dkgClient.query.bind(dkgClient),
          get: dkgClient.get.bind(dkgClient) as any,
          update: dkgClient.update.bind(dkgClient),
        });

        const results = await client.queryWithQuality({
          sparql: params.sparql,
          qualityRequirements: {
            minOverallScore: params.minQualityScore ?? 80,
            excludeDisputed: true,
          },
        });

        logger.info('Quality query executed', {
          resultCount: results.length,
          minQuality: params.minQualityScore ?? 80,
        });

        return {
          success: true,
          results: results.slice(0, 10),
          totalCount: results.length,
        };
      } catch (error: any) {
        logger.error('Quality query failed', { error: error.message });
        return { success: false, error: error.message };
      }
    },
  });

  mcp.register('kamiyo_assess_quality', {
    description: 'Submit quality assessment as oracle (commit phase)',
    inputSchema: {
      type: 'object',
      properties: {
        assetUAL: { type: 'string' },
        factualAccuracy: { type: 'number' },
        sourceQuality: { type: 'number' },
        completeness: { type: 'number' },
        consistency: { type: 'number' },
      },
      required: ['assetUAL', 'factualAccuracy'],
    },
    handler: async (params: any) => {
      try {
        const { Keypair } = await import('@solana/web3.js');

        const oracleId = Keypair.generate().publicKey;
        const salt = oracleManager.generateSalt();

        const scores = {
          factualAccuracy: params.factualAccuracy,
          sourceQuality: params.sourceQuality ?? 75,
          completeness: params.completeness ?? 75,
          consistency: params.consistency ?? 75,
        };

        const overallScore = oracleManager.calculateOverallScore(scores);
        const commitment = oracleManager.computeCommitment(
          overallScore,
          salt,
          params.assetUAL,
          oracleId
        );

        logger.info('Quality assessment submitted', {
          assetUAL: params.assetUAL,
          overallScore,
        });

        return {
          success: true,
          commitment,
          overallScore,
          // Note: salt should be stored securely for reveal phase
        };
      } catch (error: any) {
        logger.error('Assessment failed', { error: error.message });
        return { success: false, error: error.message };
      }
    },
  });

  // ==================
  // REST API Routes
  // ==================

  api.post('/kamiyo/quality-stake', async (req: any, res: any) => {
    const { assetUAL, stakeAmount } = req.body;

    try {
      const { Keypair } = await import('@solana/web3.js');
      const BN = (await import('bn.js')).default;

      const publisher = Keypair.generate().publicKey;

      const stake = await stakingManager.createQualityStake({
        assetUal: assetUAL,
        publisher,
        stakeAmount: new BN(stakeAmount * 1e9),
      });

      res.json({
        success: true,
        escrowPda: stake.escrowPda.toBase58(),
        status: stake.status,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  api.post('/kamiyo/assess', async (req: any, res: any) => {
    const { assetUAL, scores } = req.body;

    try {
      const { Keypair } = await import('@solana/web3.js');

      const oracleId = Keypair.generate().publicKey;
      const salt = oracleManager.generateSalt();
      const overallScore = oracleManager.calculateOverallScore(scores);
      const commitment = oracleManager.computeCommitment(
        overallScore,
        salt,
        assetUAL,
        oracleId
      );

      res.json({
        success: true,
        commitment,
        overallScore,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  api.get('/kamiyo/reputation/:did', async (req: any, res: any) => {
    const { did } = req.params;

    try {
      // Placeholder - real impl would query on-chain
      res.json({
        success: true,
        reputation: {
          publisher: did,
          totalAssets: 0,
          verifiedAssets: 0,
          disputedAssets: 0,
          averageQualityScore: 0,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  api.post('/kamiyo/dispute', async (req: any, res: any) => {
    const { assetUAL, reason, evidenceUAL } = req.body;

    try {
      const { Keypair } = await import('@solana/web3.js');

      const challenger = Keypair.generate().publicKey;

      const dispute = await disputeManager.fileDispute({
        assetUal: assetUAL,
        challenger,
        reason,
        evidenceUal: evidenceUAL,
      });

      res.json({
        success: true,
        disputeId: dispute.disputeId,
        status: dispute.status,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  logger.info('KAMIYO Quality Oracle plugin initialized', {
    tools: ['kamiyo_stake_quality', 'kamiyo_verify_and_pay', 'kamiyo_assess_quality'],
    routes: ['/kamiyo/quality-stake', '/kamiyo/assess', '/kamiyo/reputation/:did', '/kamiyo/dispute'],
  });
});

// Re-export types
export type { UAL, QualityStake, PublisherReputation } from '@kamiyo/dkg-quality-oracle';
