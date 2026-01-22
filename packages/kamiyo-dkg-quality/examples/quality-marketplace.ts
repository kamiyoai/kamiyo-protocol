/**
 * Quality Marketplace Demo
 *
 * End-to-end example of KAMIYO Quality Oracle integration with OriginTrail DKG.
 *
 * Flow:
 * 1. Publisher creates Knowledge Asset with quality stake
 * 2. Oracles assess quality (commit-reveal)
 * 3. AI agent queries verified knowledge with escrow
 * 4. Inference provenance recorded for accountability
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  createQualityOracleSystem,
  DragQualityClient,
  QualityRAGContextBuilder,
  type UAL,
  type QualityScores,
} from '../src/index.js';

// Mock DKG client (replace with real dkg.js in production)
const mockDkgClient = {
  knowledgeAssets: new Map<string, { content: unknown; metadata: Record<string, unknown> }>(),

  async publish(content: object): Promise<string> {
    const ual = `did:dkg:otp/0x1234/${Date.now()}`;
    this.knowledgeAssets.set(ual, { content, metadata: {} });
    return ual;
  },

  async get(ual: string) {
    return this.knowledgeAssets.get(ual) || { content: {}, metadata: {} };
  },

  async update(ual: string, data: Record<string, unknown>) {
    const asset = this.knowledgeAssets.get(ual);
    if (asset) {
      asset.metadata = { ...asset.metadata, ...data };
    }
  },

  async query(_sparql: string) {
    return Array.from(this.knowledgeAssets.entries()).map(([ual, asset]) => ({
      '@id': ual,
      ...asset.content,
    }));
  },
};

async function runDemo() {
  console.log('='.repeat(60));
  console.log('KAMIYO Quality Marketplace Demo');
  console.log('='.repeat(60));

  // Initialize the quality oracle system
  const { stakingManager, oracleManager, provenanceTracker, disputeManager } =
    createQualityOracleSystem();

  // ============================================
  // Step 1: Publisher creates Knowledge Asset
  // ============================================
  console.log('\n--- Step 1: Publisher creates Knowledge Asset with quality stake ---');

  const publisher = Keypair.generate();
  const knowledgeContent = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Climate Change Impact on Ocean Temperatures',
    text: 'Global ocean temperatures have risen by 0.13°C per decade since 1901...',
    author: { '@type': 'Organization', name: 'Climate Research Institute' },
    datePublished: '2025-01-20',
    source: 'https://climate.gov/ocean-temps-2025',
  };

  // Publish to DKG
  const assetUal = await mockDkgClient.publish(knowledgeContent);
  console.log(`Published Knowledge Asset: ${assetUal}`);

  // Create quality stake
  const stake = await stakingManager.createQualityStake({
    assetUal,
    publisher: publisher.publicKey,
    stakeAmount: new BN(500_000_000), // 0.5 SOL
  });

  console.log(`Quality stake created:`);
  console.log(`  - Escrow PDA: ${stake.escrowPda.toBase58().slice(0, 20)}...`);
  console.log(`  - Stake amount: 0.5 SOL`);
  console.log(`  - Status: ${stake.status}`);
  console.log(`  - Verification deadline: ${new Date(stake.verificationDeadline * 1000).toISOString()}`);

  // ============================================
  // Step 2: Oracles assess quality
  // ============================================
  console.log('\n--- Step 2: Oracles assess quality (commit-reveal) ---');

  // Register 3 oracles
  const oracles = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const oracleAssessments: Array<{ oracle: Keypair; scores: QualityScores; salt: string }> = [];

  for (let i = 0; i < oracles.length; i++) {
    await oracleManager.registerOracle({
      oracleId: oracles[i].publicKey,
      stake: new BN(1_000_000_000_000), // 1000 SOL
    });

    // Each oracle assesses the asset
    const scores: QualityScores = {
      factualAccuracy: 85 + Math.floor(Math.random() * 10), // 85-94
      sourceQuality: 80 + Math.floor(Math.random() * 15),   // 80-94
      completeness: 75 + Math.floor(Math.random() * 15),    // 75-89
      consistency: 85 + Math.floor(Math.random() * 10),     // 85-94
    };

    const salt = oracleManager.generateSalt();
    oracleAssessments.push({ oracle: oracles[i], scores, salt });

    // Commit phase
    const overallScore = oracleManager.calculateOverallScore(scores);
    const commitment = oracleManager.computeCommitment(
      overallScore,
      salt,
      assetUal,
      oracles[i].publicKey
    );

    await oracleManager.submitCommitment({
      assetUal,
      oracleId: oracles[i].publicKey,
      commitment,
    });

    console.log(`Oracle ${i + 1} committed: ${commitment.slice(0, 16)}... (score: ${overallScore})`);
  }

  // Reveal phase
  console.log('\nReveal phase:');
  for (const { oracle, scores, salt } of oracleAssessments) {
    const assessment = await oracleManager.revealAssessment({
      assetUal,
      oracleId: oracle.publicKey,
      scores,
      salt,
    });
    console.log(`Oracle revealed: Overall ${assessment.overallScore}/100`);
  }

  // Finalize assessment
  const { medianScore, oracleCount, rewards } = await oracleManager.finalizeAssessment(assetUal);
  console.log(`\nConsensus result:`);
  console.log(`  - Median score: ${medianScore}/100`);
  console.log(`  - Oracle count: ${oracleCount}`);
  console.log(`  - Status: ${medianScore >= 80 ? 'VERIFIED' : medianScore < 50 ? 'DISPUTED' : 'CONTESTED'}`);

  // Resolve the quality stake
  const { metadata } = await stakingManager.resolveQualityAssessment({
    assetUal,
    medianScore,
    oracleCount,
  });

  // Update DKG asset with quality metadata
  await mockDkgClient.update(assetUal, stakingManager.buildQualityMetadataJsonLd(metadata));
  console.log(`Quality metadata added to DKG asset`);

  // ============================================
  // Step 3: AI Agent queries verified knowledge
  // ============================================
  console.log('\n--- Step 3: AI Agent queries verified knowledge ---');

  const dragClient = new DragQualityClient(mockDkgClient);

  const queryResults = await dragClient.queryWithQuality({
    sparql: 'SELECT ?asset WHERE { ?asset schema:about "climate change" }',
    qualityRequirements: {
      minOverallScore: 80,
      excludeDisputed: true,
    },
  });

  console.log(`Query results: ${queryResults.length} verified assets found`);

  // Build RAG context
  const contextBuilder = new QualityRAGContextBuilder(dragClient);
  const { context, sources } = await contextBuilder.buildContext({
    query: 'What is the impact of climate change on ocean temperatures?',
    sparql: 'SELECT ?asset WHERE { ?asset schema:about "climate" }',
    minQuality: 80,
    maxResults: 5,
  });

  console.log(`\nRAG context built with ${sources.length} quality-verified sources`);

  // ============================================
  // Step 4: Record inference provenance
  // ============================================
  console.log('\n--- Step 4: Record inference provenance ---');

  const agent = Keypair.generate();
  const inferenceId = provenanceTracker.startInference(agent.publicKey);

  // Record which assets were used
  for (const source of sources) {
    provenanceTracker.recordAssetUsage({
      inferenceId,
      assetUal: source.ual,
      qualityScore: source.score,
      publisherReputation: 85, // Would come from on-chain
    });
  }

  const confidence = provenanceTracker.calculateWeightedConfidence(inferenceId);
  provenanceTracker.finalizeInference({ inferenceId, confidence });

  const provenanceHash = provenanceTracker.generateProvenanceHash(inferenceId);
  const provenanceJsonLd = provenanceTracker.buildProvenanceJsonLd(inferenceId);

  console.log(`Inference provenance recorded:`);
  console.log(`  - Inference ID: ${inferenceId}`);
  console.log(`  - Sources used: ${sources.length}`);
  console.log(`  - Weighted confidence: ${confidence}%`);
  console.log(`  - Provenance hash: ${provenanceHash.slice(0, 32)}...`);

  // ============================================
  // Summary
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('Demo Complete');
  console.log('='.repeat(60));
  console.log(`
Key Outcomes:
  - Knowledge Asset published with 0.5 SOL quality stake
  - 3 oracles assessed quality via commit-reveal
  - Median quality score: ${medianScore}/100 (${stake.status})
  - Stake ${medianScore >= 80 ? 'returned to publisher' : 'slashed'}
  - AI agent queried with quality filters (min: 80)
  - Inference provenance recorded for accountability

Value Delivered:
  - PoK (OriginTrail): Proves data exists and who published it
  - PoQ (KAMIYO): Proves data is accurate with economic stakes
  - Together: Trustworthy AI Memory with accountability
`);
}

// Run if executed directly
runDemo().catch(console.error);

export { runDemo };
