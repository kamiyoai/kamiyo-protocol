import {
  type DKGClient,
  type ContextGraphConfig,
  type PublishResult,
  type ERC8004RegistrationFile,
  type FeedbackRecord,
  type ValidationRecord,
  type DecisionTrace,
  type VerifiableCredential,
  type AgentRelationship,
  type AgentContextResult,
  type ReputationQueryResult,
  type TrustModel,
  type ServiceEndpoint,
  GLOBAL_ID_REGEX,
  HASH_REGEX,
  ADDRESS_REGEX,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_URI_LENGTH,
} from './types.js';

import {
  buildAgentContextAsset,
  buildFeedbackAsset,
  buildValidationAsset,
  buildDecisionTraceAsset,
  buildCredentialAsset,
  buildRelationshipAsset,
} from './schemas.js';

import * as sparql from './sparql.js';

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) return 'Query timed out';
    if (error.message.includes('not found')) return 'Asset not found';
    if (error.message.includes('ECONNREFUSED')) return 'DKG connection refused';
    if (error.message.includes('ETIMEDOUT')) return 'DKG connection timeout';
    return 'DKG operation failed';
  }
  return 'Unknown error';
}

function isValidGlobalId(id: unknown): id is string {
  return typeof id === 'string' && GLOBAL_ID_REGEX.test(id);
}

function isValidHash(hash: unknown): hash is string {
  return typeof hash === 'string' && HASH_REGEX.test(hash);
}

function isValidAddress(addr: unknown): addr is string {
  return typeof addr === 'string' && ADDRESS_REGEX.test(addr);
}

function isValidString(val: unknown, maxLen: number): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLen;
}

function isValidResponse(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

function isValidDecimals(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 18;
}

function isValidTimestamp(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

export class ContextGraph {
  private dkg: DKGClient;
  private epochs: number;

  constructor(config: ContextGraphConfig) {
    this.dkg = config.dkg;
    this.epochs = config.defaultEpochs ?? 12;
  }

  async publishAgentContext(
    globalId: string,
    registration: ERC8004RegistrationFile
  ): Promise<PublishResult> {
    if (!isValidGlobalId(globalId)) {
      return { success: false, error: 'Invalid global ID format' };
    }
    if (!isValidString(registration.name, MAX_NAME_LENGTH)) {
      return { success: false, error: 'Invalid or missing name' };
    }
    if (registration.description && !isValidString(registration.description, MAX_DESCRIPTION_LENGTH)) {
      return { success: false, error: 'Description too long' };
    }
    if (!Array.isArray(registration.services) || registration.services.length === 0) {
      return { success: false, error: 'Missing services array' };
    }
    if (!Array.isArray(registration.supportedTrust) || registration.supportedTrust.length === 0) {
      return { success: false, error: 'Missing supportedTrust array' };
    }
    for (const svc of registration.services) {
      if (!isValidString(svc.name, 64) || !isValidString(svc.endpoint, MAX_URI_LENGTH)) {
        return { success: false, error: 'Invalid service entry' };
      }
    }

    const asset = buildAgentContextAsset(globalId, registration);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async publishFeedback(feedback: FeedbackRecord): Promise<PublishResult> {
    if (!isValidString(feedback.agentId, 32)) {
      return { success: false, error: 'Invalid agentId' };
    }
    if (!isValidAddress(feedback.agentRegistry)) {
      return { success: false, error: 'Invalid agentRegistry address' };
    }
    if (!isValidAddress(feedback.clientAddress)) {
      return { success: false, error: 'Invalid clientAddress' };
    }
    if (!isValidHash(feedback.feedbackHash)) {
      return { success: false, error: 'Invalid feedbackHash' };
    }
    if (!isValidDecimals(feedback.valueDecimals)) {
      return { success: false, error: 'Invalid valueDecimals (must be 0-18)' };
    }
    if (!isValidTimestamp(feedback.timestamp)) {
      return { success: false, error: 'Invalid timestamp' };
    }
    if (feedback.feedbackURI && !isValidString(feedback.feedbackURI, MAX_URI_LENGTH)) {
      return { success: false, error: 'feedbackURI too long' };
    }
    if (feedback.endpoint && !isValidString(feedback.endpoint, MAX_URI_LENGTH)) {
      return { success: false, error: 'endpoint too long' };
    }

    const asset = buildFeedbackAsset(feedback);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async publishValidation(validation: ValidationRecord): Promise<PublishResult> {
    if (!isValidHash(validation.requestHash)) {
      return { success: false, error: 'Invalid requestHash' };
    }
    if (!isValidAddress(validation.validatorAddress)) {
      return { success: false, error: 'Invalid validatorAddress' };
    }
    if (!isValidString(validation.agentId, 32)) {
      return { success: false, error: 'Invalid agentId' };
    }
    if (!isValidAddress(validation.agentRegistry)) {
      return { success: false, error: 'Invalid agentRegistry address' };
    }
    if (!isValidTimestamp(validation.timestamp)) {
      return { success: false, error: 'Invalid timestamp' };
    }
    if (validation.response !== undefined && !isValidResponse(validation.response)) {
      return { success: false, error: 'Invalid response (must be 0-100)' };
    }
    if (validation.requestURI && !isValidString(validation.requestURI, MAX_URI_LENGTH)) {
      return { success: false, error: 'requestURI too long' };
    }
    if (validation.responseURI && !isValidString(validation.responseURI, MAX_URI_LENGTH)) {
      return { success: false, error: 'responseURI too long' };
    }
    if (validation.responseHash && !isValidHash(validation.responseHash)) {
      return { success: false, error: 'Invalid responseHash' };
    }

    const asset = buildValidationAsset(validation);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async logDecision(trace: DecisionTrace): Promise<PublishResult> {
    if (!isValidGlobalId(trace.agentGlobalId)) {
      return { success: false, error: 'Invalid agent global ID' };
    }
    if (!isValidString(trace.actionType, 128)) {
      return { success: false, error: 'Invalid actionType' };
    }
    if (!isValidString(trace.description, MAX_DESCRIPTION_LENGTH)) {
      return { success: false, error: 'Invalid or too long description' };
    }
    if (!isValidTimestamp(trace.timestamp)) {
      return { success: false, error: 'Invalid timestamp' };
    }
    if (trace.counterpartyId && !isValidGlobalId(trace.counterpartyId)) {
      return { success: false, error: 'Invalid counterpartyId' };
    }
    if (trace.reasoning && !isValidString(trace.reasoning, MAX_DESCRIPTION_LENGTH)) {
      return { success: false, error: 'reasoning too long' };
    }
    if (trace.evidenceUAL && !isValidString(trace.evidenceUAL, MAX_URI_LENGTH)) {
      return { success: false, error: 'evidenceUAL too long' };
    }
    if (trace.outcome && !['success', 'failure', 'pending'].includes(trace.outcome)) {
      return { success: false, error: 'Invalid outcome value' };
    }

    const asset = buildDecisionTraceAsset(trace);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async addCredential(
    agentGlobalId: string,
    credential: VerifiableCredential
  ): Promise<PublishResult> {
    if (!isValidGlobalId(agentGlobalId)) {
      return { success: false, error: 'Invalid agent global ID' };
    }
    if (!isValidString(credential.issuer, MAX_URI_LENGTH)) {
      return { success: false, error: 'Invalid issuer' };
    }
    if (!isValidTimestamp(credential.issuanceDate)) {
      return { success: false, error: 'Invalid issuanceDate' };
    }
    if (credential.expirationDate && !isValidTimestamp(credential.expirationDate)) {
      return { success: false, error: 'Invalid expirationDate' };
    }
    if (!credential.credentialSubject?.id) {
      return { success: false, error: 'Missing credentialSubject.id' };
    }
    if (!Array.isArray(credential['@context']) || credential['@context'].length === 0) {
      return { success: false, error: 'Missing @context array' };
    }
    if (!Array.isArray(credential.type) || credential.type.length === 0) {
      return { success: false, error: 'Missing type array' };
    }

    const asset = buildCredentialAsset(agentGlobalId, credential);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async addRelationship(relationship: AgentRelationship): Promise<PublishResult> {
    if (!isValidGlobalId(relationship.sourceGlobalId)) {
      return { success: false, error: 'Invalid sourceGlobalId' };
    }
    if (!isValidGlobalId(relationship.targetGlobalId)) {
      return { success: false, error: 'Invalid targetGlobalId' };
    }
    const validTypes = ['collaborator', 'delegator', 'endorser', 'trusts', 'employed_by'];
    if (!validTypes.includes(relationship.relationshipType)) {
      return { success: false, error: 'Invalid relationshipType' };
    }
    if (!isValidTimestamp(relationship.since)) {
      return { success: false, error: 'Invalid since timestamp' };
    }
    if (relationship.until && !isValidTimestamp(relationship.until)) {
      return { success: false, error: 'Invalid until timestamp' };
    }
    if (relationship.context && !isValidString(relationship.context, MAX_DESCRIPTION_LENGTH)) {
      return { success: false, error: 'context too long' };
    }
    if (relationship.evidenceUAL && !isValidString(relationship.evidenceUAL, MAX_URI_LENGTH)) {
      return { success: false, error: 'evidenceUAL too long' };
    }

    const asset = buildRelationshipAsset(relationship);

    try {
      const ual = await this.dkg.publish({ public: asset }, { epochs: this.epochs });
      return { success: true, ual };
    } catch (error) {
      return { success: false, error: sanitizeError(error) };
    }
  }

  async getAgentContext(globalId: string): Promise<AgentContextResult | null> {
    if (!isValidGlobalId(globalId)) return null;

    try {
      const query = sparql.queryAgentByGlobalId(globalId);
      const results = await this.dkg.query(query) as Array<Record<string, { value?: unknown }>>;

      if (!results.length) return null;

      const r = results[0];
      const counts = await this.getAgentAssetCounts(globalId);
      const services = await this.getAgentServices(globalId);

      return {
        globalId,
        ual: String(r.agent?.value || ''),
        name: String(r.name?.value || ''),
        description: r.description?.value ? String(r.description.value) : undefined,
        services,
        supportedTrust: [],
        active: r.active?.value === true,
        registrations: [],
        feedbackCount: counts.feedbackCount,
        validationCount: counts.validationCount,
        decisionCount: counts.decisionCount,
      };
    } catch {
      return null;
    }
  }

  async findAgentsByTrustModel(trustModel: TrustModel, limit = 20): Promise<string[]> {
    try {
      const query = sparql.queryAgentsByTrustModel(trustModel, limit);
      const results = await this.dkg.query(query) as Array<{ globalId?: { value?: string } }>;
      return results.map(r => r.globalId?.value).filter((v): v is string => !!v);
    } catch {
      return [];
    }
  }

  async findAgentsByService(serviceName: string, limit = 20): Promise<Array<{ globalId: string; endpoint: string }>> {
    try {
      const query = sparql.queryAgentsByService(serviceName, limit);
      const results = await this.dkg.query(query) as Array<{
        globalId?: { value?: string };
        endpoint?: { value?: string };
      }>;
      return results
        .filter(r => r.globalId?.value && r.endpoint?.value)
        .map(r => ({
          globalId: r.globalId!.value!,
          endpoint: r.endpoint!.value!,
        }));
    } catch {
      return [];
    }
  }

  async findX402Agents(limit = 20): Promise<string[]> {
    try {
      const query = sparql.queryX402Agents(limit);
      const results = await this.dkg.query(query) as Array<{ globalId?: { value?: string } }>;
      return results.map(r => r.globalId?.value).filter((v): v is string => !!v);
    } catch {
      return [];
    }
  }

  async findAgentsByReputation(minRating: number, limit = 20): Promise<ReputationQueryResult[]> {
    try {
      const query = sparql.queryAgentsByReputation(minRating, limit);
      const results = await this.dkg.query(query) as Array<{
        globalId?: { value?: string };
        avgRating?: { value?: number };
        feedbackCount?: { value?: number };
      }>;
      return results
        .filter(r => r.globalId?.value)
        .map(r => ({
          globalId: r.globalId!.value!,
          feedbackCount: r.feedbackCount?.value ?? 0,
          averageValue: r.avgRating?.value ?? 0,
        }));
    } catch {
      return [];
    }
  }

  async getAgentFeedbackSummary(
    globalId: string,
    tag1?: string,
    tag2?: string
  ): Promise<{ count: number; averageRating: number } | null> {
    if (!isValidGlobalId(globalId)) return null;

    try {
      const query = sparql.queryAgentFeedbackSummary(globalId, tag1, tag2);
      const results = await this.dkg.query(query) as Array<{
        count?: { value?: number };
        avgRating?: { value?: number };
      }>;

      if (!results.length) return { count: 0, averageRating: 0 };

      return {
        count: results[0].count?.value ?? 0,
        averageRating: results[0].avgRating?.value ?? 0,
      };
    } catch {
      return null;
    }
  }

  async getAgentValidationSummary(
    globalId: string,
    validatorAddress?: string,
    tag?: string
  ): Promise<{ count: number; averageResponse: number } | null> {
    if (!isValidGlobalId(globalId)) return null;

    try {
      const query = sparql.queryAgentValidationSummary(globalId, validatorAddress, tag);
      const results = await this.dkg.query(query) as Array<{
        count?: { value?: number };
        avgResponse?: { value?: number };
      }>;

      if (!results.length) return { count: 0, averageResponse: 0 };

      return {
        count: results[0].count?.value ?? 0,
        averageResponse: results[0].avgResponse?.value ?? 0,
      };
    } catch {
      return null;
    }
  }

  async getAgentDecisions(globalId: string, limit = 20): Promise<DecisionTrace[]> {
    if (!isValidGlobalId(globalId)) return [];

    try {
      const query = sparql.queryAgentDecisions(globalId, limit);
      const results = await this.dkg.query(query) as Array<Record<string, { value?: unknown }>>;

      return results.map(r => ({
        agentGlobalId: globalId,
        actionType: String(r.actionType?.value || ''),
        description: String(r.description?.value || ''),
        timestamp: String(r.timestamp?.value || ''),
        outcome: this.parseOutcome(r.status?.value),
        counterpartyId: r.counterparty?.value ? String(r.counterparty.value) : undefined,
        reasoning: r.reasoning?.value ? String(r.reasoning.value) : undefined,
      }));
    } catch {
      return [];
    }
  }

  async getAgentRelationships(globalId: string, limit = 20): Promise<AgentRelationship[]> {
    if (!isValidGlobalId(globalId)) return [];

    try {
      const query = sparql.queryAgentRelationships(globalId, limit);
      const results = await this.dkg.query(query) as Array<Record<string, { value?: unknown }>>;

      return results.map(r => ({
        sourceGlobalId: globalId,
        targetGlobalId: String(r.targetId?.value || '').replace('urn:erc8004:', ''),
        relationshipType: this.parseRelationshipType(r.role?.value),
        since: String(r.since?.value || ''),
        until: r.until?.value ? String(r.until.value) : undefined,
        context: r.description?.value ? String(r.description.value) : undefined,
      }));
    } catch {
      return [];
    }
  }

  private async getAgentAssetCounts(globalId: string): Promise<{
    feedbackCount: number;
    validationCount: number;
    decisionCount: number;
    relationshipCount: number;
  }> {
    try {
      const query = sparql.queryAgentAssetCounts(globalId);
      const results = await this.dkg.query(query) as Array<Record<string, { value?: number }>>;

      if (!results.length) {
        return { feedbackCount: 0, validationCount: 0, decisionCount: 0, relationshipCount: 0 };
      }

      const r = results[0];
      return {
        feedbackCount: r.feedbackCount?.value ?? 0,
        validationCount: r.validationCount?.value ?? 0,
        decisionCount: r.decisionCount?.value ?? 0,
        relationshipCount: r.relationshipCount?.value ?? 0,
      };
    } catch {
      return { feedbackCount: 0, validationCount: 0, decisionCount: 0, relationshipCount: 0 };
    }
  }

  private async getAgentServices(_globalId: string): Promise<ServiceEndpoint[]> {
    // TODO: implement service query
    return [];
  }

  private parseOutcome(status: unknown): 'success' | 'failure' | 'pending' | undefined {
    const s = String(status || '').toLowerCase();
    if (s.includes('completed')) return 'success';
    if (s.includes('failed')) return 'failure';
    if (s.includes('active') || s.includes('potential')) return 'pending';
    return undefined;
  }

  private parseRelationshipType(
    role: unknown
  ): 'collaborator' | 'delegator' | 'endorser' | 'trusts' | 'employed_by' {
    const r = String(role || '').toLowerCase();
    if (r === 'collaborator') return 'collaborator';
    if (r === 'delegator') return 'delegator';
    if (r === 'endorser') return 'endorser';
    if (r === 'trusts') return 'trusts';
    if (r === 'employed_by') return 'employed_by';
    return 'collaborator';
  }
}
