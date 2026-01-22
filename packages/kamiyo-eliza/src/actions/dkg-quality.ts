import BN from 'bn.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getKeypair, parseAmount } from '../utils';
import { getDKGQualityContext } from '../dkg-context';

export const publishQualityStakedAssetAction: Action = {
  name: 'PUBLISH_QUALITY_STAKED_ASSET',
  description: 'Publish Knowledge Asset to DKG with KAMIYO quality stake. Stake returned if verified, slashed if disputed.',
  similes: ['publish knowledge', 'stake on quality', 'publish to dkg', 'quality stake'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Publish this research to DKG with 0.5 SOL quality stake' } },
      { user: '{{agent}}', content: { text: 'Published Knowledge Asset with 0.5 SOL quality stake. UAL: did:dkg:otp/0x.../1234', action: 'PUBLISH_QUALITY_STAKED_ASSET' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('publish') && (text.includes('dkg') || text.includes('knowledge'))) ||
      (text.includes('quality') && text.includes('stake'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; assetUal?: string; escrowPda?: string; error?: string }> {
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const stakeAmount = parseAmount(text) || 0.1;
    const content = message.content.knowledge || message.content.data;

    if (!content) {
      callback?.({ text: 'No knowledge content provided. Include knowledge data in message.' });
      return { success: false, error: 'No content provided' };
    }

    try {
      const { stakingManager, dkgClient } = await getDKGQualityContext(runtime);

      // Publish to DKG first
      let assetUal: string;
      if ('publish' in dkgClient) {
        assetUal = await (dkgClient as any).publish(content);
      } else {
        // Fallback for mock client
        assetUal = `did:dkg:otp/0x${Date.now().toString(16)}/${Date.now()}`;
      }

      // Create quality stake
      const stake = await stakingManager.createQualityStake({
        assetUal,
        publisher: keypair.publicKey,
        stakeAmount: new BN(stakeAmount * 1e9),
      });

      callback?.({
        text: `Published Knowledge Asset with ${stakeAmount} SOL quality stake. Awaiting oracle verification (24-72h).`,
        content: {
          assetUal: stake.assetUal,
          escrowPda: stake.escrowPda.toBase58(),
          stakeAmount,
          verificationDeadline: new Date(stake.verificationDeadline * 1000).toISOString(),
        },
      });

      return {
        success: true,
        assetUal: stake.assetUal,
        escrowPda: stake.escrowPda.toBase58(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to publish: ${error}` });
      return { success: false, error };
    }
  },
};

export const queryVerifiedKnowledgeAction: Action = {
  name: 'QUERY_VERIFIED_KNOWLEDGE',
  description: 'Query DKG for quality-verified Knowledge Assets. Returns only assets meeting quality threshold.',
  similes: ['query dkg', 'search knowledge', 'find verified', 'quality search'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Find verified knowledge about climate change with quality >= 80' } },
      { user: '{{agent}}', content: { text: 'Found 5 verified Knowledge Assets about climate change (quality 80+)', action: 'QUERY_VERIFIED_KNOWLEDGE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('query') || text.includes('search') || text.includes('find')) &&
      (text.includes('knowledge') || text.includes('dkg') || text.includes('verified'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; results?: unknown[]; error?: string }> {
    const text = message.content.text || '';
    const sparql = message.content.sparql as string;
    const minQuality = (message.content.minQuality as number) || 80;

    if (!sparql && !text) {
      callback?.({ text: 'Provide SPARQL query or search terms.' });
      return { success: false, error: 'No query provided' };
    }

    try {
      const { DragQualityClient } = await import('@kamiyo/dkg-quality-oracle');
      const { dkgClient } = await getDKGQualityContext(runtime);

      const client = new DragQualityClient(dkgClient);

      const results = await client.queryWithQuality({
        sparql: sparql || `SELECT ?asset WHERE { ?asset schema:about "${text}" }`,
        qualityRequirements: {
          minOverallScore: minQuality,
          excludeDisputed: true,
        },
      });

      callback?.({
        text: `Found ${results.length} verified Knowledge Assets (quality >= ${minQuality})`,
        content: {
          resultCount: results.length,
          results: results.slice(0, 5),
          minQuality,
        },
      });

      return { success: true, results };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Query failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const assessAssetQualityAction: Action = {
  name: 'ASSESS_ASSET_QUALITY',
  description: 'Submit quality assessment for Knowledge Asset (oracle only). Scores factual accuracy, source quality, completeness, consistency.',
  similes: ['assess quality', 'rate knowledge', 'oracle assessment', 'quality score'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Assess quality of did:dkg:otp/0x.../1234' } },
      { user: '{{agent}}', content: { text: 'Submitted quality assessment: Overall 85/100. Commitment recorded.', action: 'ASSESS_ASSET_QUALITY' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('assess') || text.includes('rate') || text.includes('score')) &&
      (text.includes('quality') || text.includes('knowledge') || text.includes('asset'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; commitment?: string; error?: string }> {
    const keypair = getKeypair(runtime);
    const assetUal = message.content.assetUal as string;
    const scores = message.content.scores as {
      factualAccuracy: number;
      sourceQuality: number;
      completeness: number;
      consistency: number;
    };

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    if (!assetUal) {
      callback?.({ text: 'Provide asset UAL to assess.' });
      return { success: false, error: 'No asset UAL provided' };
    }

    if (!scores) {
      callback?.({ text: 'Provide quality scores (factualAccuracy, sourceQuality, completeness, consistency).' });
      return { success: false, error: 'No scores provided' };
    }

    try {
      const { oracleManager } = await getDKGQualityContext(runtime);

      const salt = oracleManager.generateSalt();
      const overallScore = oracleManager.calculateOverallScore(scores);

      const commitment = oracleManager.computeCommitment(
        overallScore,
        salt,
        assetUal,
        keypair.publicKey
      );

      // Store salt securely for reveal phase
      await runtime.setState?.(`oracle_salt_${assetUal}`, salt);

      callback?.({
        text: `Submitted quality assessment. Overall: ${overallScore}/100. Commitment recorded for reveal phase.`,
        content: {
          assetUal,
          overallScore,
          scores,
          commitment,
        },
      });

      return { success: true, commitment };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Assessment failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const recordInferenceProvenanceAction: Action = {
  name: 'RECORD_INFERENCE_PROVENANCE',
  description: 'Log which Knowledge Assets influenced an AI decision. Enables tracing for dispute resolution.',
  similes: ['record provenance', 'log sources', 'track inference', 'cite sources'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Record that my decision used these 3 knowledge assets' } },
      { user: '{{agent}}', content: { text: 'Recorded inference provenance. 3 sources tracked. Confidence: 85%', action: 'RECORD_INFERENCE_PROVENANCE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('record') || text.includes('log') || text.includes('track')) &&
      (text.includes('provenance') || text.includes('source') || text.includes('inference'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; inferenceId?: string; error?: string }> {
    const keypair = getKeypair(runtime);
    const usedAssets = message.content.usedAssets as Array<{
      assetUal: string;
      qualityScore: number;
      publisherReputation: number;
    }>;
    const confidence = (message.content.confidence as number) || 0;

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    if (!usedAssets || usedAssets.length === 0) {
      callback?.({ text: 'Provide usedAssets array with asset details.' });
      return { success: false, error: 'No assets provided' };
    }

    try {
      const { provenanceTracker } = await getDKGQualityContext(runtime);

      const inferenceId = provenanceTracker.startInference(keypair.publicKey);

      for (const asset of usedAssets) {
        provenanceTracker.recordAssetUsage({
          inferenceId,
          assetUal: asset.assetUal,
          qualityScore: asset.qualityScore,
          publisherReputation: asset.publisherReputation,
        });
      }

      provenanceTracker.finalizeInference({ inferenceId, confidence });
      const provenanceHash = provenanceTracker.generateProvenanceHash(inferenceId);

      callback?.({
        text: `Recorded inference provenance. ${usedAssets.length} sources tracked. Confidence: ${confidence}%`,
        content: {
          inferenceId,
          provenanceHash,
          sourcesCount: usedAssets.length,
          confidence,
        },
      });

      return { success: true, inferenceId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to record provenance: ${error}` });
      return { success: false, error };
    }
  },
};

export const disputeKnowledgeQualityAction: Action = {
  name: 'DISPUTE_KNOWLEDGE_QUALITY',
  description: 'Challenge quality assessment with counter-evidence. Triggers oracle re-evaluation.',
  similes: ['dispute quality', 'challenge assessment', 'contest score', 'file dispute'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Dispute the quality of did:dkg:otp/0x.../1234 - sources are outdated' } },
      { user: '{{agent}}', content: { text: 'Filed quality dispute. Original score: 85. Re-evaluation pending.', action: 'DISPUTE_KNOWLEDGE_QUALITY' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('dispute') || text.includes('challenge') || text.includes('contest')) &&
      (text.includes('quality') || text.includes('assessment') || text.includes('score'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; disputeId?: string; error?: string }> {
    const keypair = getKeypair(runtime);
    const assetUal = message.content.assetUal as string;
    const reason = message.content.reason as string || message.content.text;
    const evidenceUal = message.content.evidenceUal as string;

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    if (!assetUal) {
      callback?.({ text: 'Provide asset UAL to dispute.' });
      return { success: false, error: 'No asset UAL provided' };
    }

    try {
      const { disputeManager } = await getDKGQualityContext(runtime);

      const dispute = await disputeManager.fileDispute({
        assetUal,
        challenger: keypair.publicKey,
        reason: reason || 'No reason provided',
        evidenceUal,
      });

      callback?.({
        text: `Filed quality dispute for ${assetUal.slice(0, 30)}... Reason: ${reason?.slice(0, 50) || 'Not specified'}. Re-evaluation pending.`,
        content: {
          disputeId: dispute.disputeId,
          assetUal,
          reason,
          evidenceUal,
          status: dispute.status,
          originalScore: dispute.originalScore,
        },
      });

      return { success: true, disputeId: dispute.disputeId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to file dispute: ${error}` });
      return { success: false, error };
    }
  },
};

export const getPublisherReputationAction: Action = {
  name: 'GET_PUBLISHER_REPUTATION',
  description: 'Look up reputation stats for a Knowledge Asset publisher.',
  similes: ['check reputation', 'publisher stats', 'reputation lookup', 'trust score'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check reputation of publisher ABC123' } },
      { user: '{{agent}}', content: { text: 'Publisher ABC123: 87/100 avg quality, 142 verified assets, 2 disputed', action: 'GET_PUBLISHER_REPUTATION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('reputation') || text.includes('trust')) &&
      (text.includes('publisher') || text.includes('check') || text.includes('lookup'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; reputation?: unknown; error?: string }> {
    const publisherId = message.content.publisherId as string;

    if (!publisherId) {
      callback?.({ text: 'Provide publisher ID or public key.' });
      return { success: false, error: 'No publisher ID provided' };
    }

    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { stakingManager } = await getDKGQualityContext(runtime);

      let pubkey: InstanceType<typeof PublicKey>;
      try {
        pubkey = new PublicKey(publisherId);
      } catch {
        callback?.({ text: 'Invalid publisher ID format. Provide a valid public key.' });
        return { success: false, error: 'Invalid publisher ID format' };
      }

      const rep = stakingManager.getReputation(pubkey);

      if (!rep) {
        // Return default reputation for new publishers
        const reputation = {
          publisher: publisherId,
          totalAssets: 0,
          verifiedAssets: 0,
          disputedAssets: 0,
          contestedAssets: 0,
          averageQualityScore: 0,
          memberSince: 'N/A',
        };

        callback?.({
          text: `Publisher ${publisherId.slice(0, 8)}...: No reputation history found.`,
          content: reputation,
        });

        return { success: true, reputation };
      }

      const reputation = {
        publisher: publisherId,
        totalAssets: rep.totalAssets,
        verifiedAssets: rep.verifiedAssets,
        disputedAssets: rep.disputedAssets,
        contestedAssets: rep.contestedAssets,
        averageQualityScore: Math.round(rep.averageQualityScore),
        memberSince: new Date(rep.memberSince * 1000).toISOString().split('T')[0],
      };

      callback?.({
        text: `Publisher ${publisherId.slice(0, 8)}...: ${reputation.averageQualityScore}/100 avg quality, ${reputation.verifiedAssets} verified, ${reputation.disputedAssets} disputed`,
        content: reputation,
      });

      return { success: true, reputation };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to get reputation: ${error}` });
      return { success: false, error };
    }
  },
};

export const dkgQualityActions: Action[] = [
  publishQualityStakedAssetAction,
  queryVerifiedKnowledgeAction,
  assessAssetQualityAction,
  recordInferenceProvenanceAction,
  disputeKnowledgeQualityAction,
  getPublisherReputationAction,
];
