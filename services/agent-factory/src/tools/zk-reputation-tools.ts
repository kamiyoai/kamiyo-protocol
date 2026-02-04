/**
 * ZK Reputation Tools
 */

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

interface ToolConfig {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
  }>;
  handler: ToolHandler;
}

interface ZKReputationConfig {
  artifactsPath?: string;
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;

let proverInstance: any = null;
let proverLoadError: Error | null = null;

async function getProver() {
  if (proverLoadError) throw proverLoadError;
  if (proverInstance) return proverInstance;

  // Dynamic imports with string variables to bypass compile-time module resolution
  const modules = ['@kamiyo/swarmteams', '@kamiyo/hive'];

  for (const moduleName of modules) {
    try {
      const mod = await import(moduleName);
      if (mod.DarkForestProver) {
        proverInstance = new mod.DarkForestProver();
        return proverInstance;
      }
    } catch {
      continue;
    }
  }

  proverLoadError = new Error('ZK prover not available: install @kamiyo/swarmteams or @kamiyo/hive');
  throw proverLoadError;
}

function validateScore(score: number): void {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new Error('Score must be a finite number');
  }
  if (score < SCORE_MIN || score > SCORE_MAX) {
    throw new Error(`Score must be between ${SCORE_MIN} and ${SCORE_MAX}`);
  }
}

export function createZKReputationTools(_config?: ZKReputationConfig): ToolConfig[] {
  return [
    {
      name: 'zk_generate_commitment',
      description: 'Generate a cryptographic commitment to a reputation score.',
      parameters: {
        score: { type: 'number', description: 'Reputation score (0-100)', required: true },
      },
      handler: async (params) => {
        try {
          const score = params.score as number;
          validateScore(score);
          const prover = await getProver();
          const commitment = await prover.generateCommitment(score);

          return {
            success: true,
            data: {
              hash: '0x' + commitment.value.toString(16).padStart(64, '0'),
              secret: commitment.secret.toString(),
            },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    {
      name: 'zk_prove_reputation_threshold',
      description: 'Generate a ZK proof that your reputation meets a threshold WITHOUT revealing your actual score.',
      parameters: {
        score: { type: 'number', description: 'Your actual reputation score (0-100)', required: true },
        secret: { type: 'string', description: 'The secret from your commitment', required: true },
        threshold: { type: 'number', description: 'Minimum score to prove', required: true },
      },
      handler: async (params) => {
        try {
          const score = params.score as number;
          const secret = params.secret as string;
          const threshold = params.threshold as number;

          validateScore(score);
          validateScore(threshold);

          if (score < threshold) {
            return { success: false, error: 'Score below threshold' };
          }

          if (!secret || typeof secret !== 'string') {
            return { success: false, error: 'Invalid secret' };
          }

          const prover = await getProver();
          const proof = await prover.generateProof({
            score,
            secret: BigInt(secret),
            threshold,
          });

          return {
            success: true,
            data: {
              commitment: proof.commitment,
              threshold,
              a: proof.a.map((x: bigint) => '0x' + x.toString(16).padStart(64, '0')),
              b: proof.b.map((row: bigint[]) =>
                row.map((x: bigint) => '0x' + x.toString(16).padStart(64, '0'))
              ),
              c: proof.c.map((x: bigint) => '0x' + x.toString(16).padStart(64, '0')),
              publicInputs: proof.publicInputs.map((x: bigint) => '0x' + x.toString(16).padStart(64, '0')),
            },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    {
      name: 'zk_verify_reputation_proof',
      description: 'Verify a ZK reputation proof from another agent.',
      parameters: {
        proofJson: { type: 'string', description: 'JSON-encoded proof object', required: true },
      },
      handler: async (params) => {
        try {
          const proofJson = params.proofJson as string;
          const proof = JSON.parse(proofJson);

          if (!proof || typeof proof !== 'object') {
            return { success: false, error: 'Invalid proof object' };
          }

          if (!proof.a || !proof.b || !proof.c || !proof.publicInputs) {
            return { success: false, error: 'Malformed proof' };
          }

          const prover = await getProver();

          const reconstructedProof = {
            commitment: proof.commitment,
            a: proof.a.map((x: string) => BigInt(x)),
            b: proof.b.map((row: string[]) => row.map((x: string) => BigInt(x))),
            c: proof.c.map((x: string) => BigInt(x)),
            publicInputs: proof.publicInputs.map((x: string) => BigInt(x)),
          };

          const result = await prover.verifyProof(reconstructedProof);

          return {
            success: true,
            data: {
              valid: result.valid,
              threshold: proof.threshold,
            },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    {
      name: 'zk_get_tier_info',
      description: 'Get information about reputation tiers and their thresholds',
      parameters: {},
      handler: async () => {
        return {
          success: true,
          data: {
            tiers: [
              { tier: 0, name: 'Unverified', threshold: 0 },
              { tier: 1, name: 'Verified', threshold: 25 },
              { tier: 2, name: 'Trusted', threshold: 50 },
              { tier: 3, name: 'Premium', threshold: 75 },
              { tier: 4, name: 'Elite', threshold: 90 },
            ],
          },
        };
      },
    },
  ];
}

export default createZKReputationTools;
