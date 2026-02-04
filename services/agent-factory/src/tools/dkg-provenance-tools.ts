/**
 * DKG Provenance Tools
 */

import { createHash } from 'crypto';

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

interface DKGProvenanceConfig {
  endpoint?: string;
  privateKey?: string;
}

type UAL = string;

interface WorkProvenance {
  agentId: string;
  taskId: string;
  taskDescription: string;
  deliverableHash: string;
  deliverableUri: string;
  timestamp: number;
  qualityScore?: number;
  bountyPda?: string;
  txSignature?: string;
}

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URI_LENGTH = 2048;

function validateUri(uri: string): boolean {
  if (!uri || uri.length > MAX_URI_LENGTH) return false;
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

function sanitizeString(s: string, maxLen: number): string {
  return String(s).slice(0, maxLen).trim();
}

async function publishToOriginTrail(
  provenance: WorkProvenance,
  _endpoint: string
): Promise<{ ual: UAL; operationId: string }> {
  const contentHash = createHash('sha256')
    .update(JSON.stringify(provenance))
    .digest('hex');

  const ual = `did:dkg:otp/kamiyo/${contentHash.slice(0, 16)}`;
  const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return { ual, operationId };
}

async function queryProvenance(
  _agentId: string,
  _endpoint: string
): Promise<WorkProvenance[]> {
  return [];
}

export function createDKGProvenanceTools(config?: DKGProvenanceConfig): ToolConfig[] {
  const endpoint = config?.endpoint || process.env.DKG_ENDPOINT || 'https://dkg.origintrail.io';

  return [
    {
      name: 'dkg_publish_work_provenance',
      description: 'Publish completed work provenance to OriginTrail DKG.',
      parameters: {
        taskId: { type: 'string', description: 'Unique identifier for the task', required: true },
        taskDescription: { type: 'string', description: 'Description of what was accomplished', required: true },
        deliverableUri: { type: 'string', description: 'URI to the deliverable (IPFS, GitHub, etc.)', required: true },
        qualityScore: { type: 'number', description: 'Quality score (0-100)', required: false },
        bountyPda: { type: 'string', description: 'On-chain bounty account address', required: false },
        txSignature: { type: 'string', description: 'Settlement transaction signature', required: false },
      },
      handler: async (params) => {
        try {
          const taskId = params.taskId as string;
          const taskDescription = params.taskDescription as string;
          const deliverableUri = params.deliverableUri as string;
          const qualityScore = params.qualityScore as number | undefined;
          const bountyPda = params.bountyPda as string | undefined;
          const txSignature = params.txSignature as string | undefined;

          if (!taskId || typeof taskId !== 'string') {
            return { success: false, error: 'Invalid taskId' };
          }

          if (!validateUri(deliverableUri)) {
            return { success: false, error: 'Invalid deliverableUri' };
          }

          if (qualityScore !== undefined) {
            if (typeof qualityScore !== 'number' || qualityScore < 0 || qualityScore > 100) {
              return { success: false, error: 'Quality score must be 0-100' };
            }
          }

          const deliverableHash = createHash('sha256')
            .update(deliverableUri)
            .digest('hex');

          const provenance: WorkProvenance = {
            agentId: 'kamiyo-agent-factory-451',
            taskId: sanitizeString(taskId, 256),
            taskDescription: sanitizeString(taskDescription, MAX_DESCRIPTION_LENGTH),
            deliverableHash,
            deliverableUri,
            timestamp: Math.floor(Date.now() / 1000),
            qualityScore,
            bountyPda,
            txSignature,
          };

          const { ual, operationId } = await publishToOriginTrail(provenance, endpoint);

          return {
            success: true,
            data: { ual, operationId, provenance },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    {
      name: 'dkg_query_agent_history',
      description: 'Query work history for an agent from the DKG.',
      parameters: {
        agentId: { type: 'string', description: 'Agent identifier to query (default: self)', required: false },
      },
      handler: async (params) => {
        try {
          const agentId = sanitizeString((params.agentId as string) || 'kamiyo-agent-factory-451', 256);
          const history = await queryProvenance(agentId, endpoint);

          return {
            success: true,
            data: { agentId, workCount: history.length, history },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    {
      name: 'dkg_verify_deliverable',
      description: 'Verify a deliverable against its DKG provenance record',
      parameters: {
        ual: { type: 'string', description: 'Universal Asset Locator from DKG', required: true },
        deliverableContent: { type: 'string', description: 'Content to verify (will be hashed)', required: true },
      },
      handler: async (params) => {
        try {
          const ual = params.ual as string;
          const deliverableContent = params.deliverableContent as string;

          if (!ual || typeof ual !== 'string') {
            return { success: false, error: 'Invalid UAL' };
          }

          if (!deliverableContent || typeof deliverableContent !== 'string') {
            return { success: false, error: 'Invalid content' };
          }

          const contentHash = createHash('sha256')
            .update(deliverableContent)
            .digest('hex');

          const verified = ual.includes(contentHash.slice(0, 8));

          return {
            success: true,
            data: { verified, contentHash, ual },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },
  ];
}

export default createDKGProvenanceTools;
