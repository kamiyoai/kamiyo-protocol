import type { OracleRequest, OracleResponse, QualityAssessment } from './types.js';

const DEFAULT_QUALITY_THRESHOLD = 70;
const MAX_SPEC_LENGTH = 50_000;
const MAX_DELIVERABLE_LENGTH = 500_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface OracleConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  defaultThreshold?: number;
}

export class QualityOracle {
  private endpoint: string;
  private apiKey?: string;
  private model: string;
  private defaultThreshold: number;

  constructor(config: OracleConfig = {}) {
    this.endpoint = config.endpoint || 'https://api.anthropic.com/v1/messages';
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.defaultThreshold = config.defaultThreshold ?? DEFAULT_QUALITY_THRESHOLD;
  }

  async assess(
    spec: string | Record<string, unknown>,
    deliverable: unknown,
    options: { threshold?: number } = {}
  ): Promise<QualityAssessment> {
    const threshold = Math.max(0, Math.min(100, options.threshold ?? this.defaultThreshold));

    let specStr: string;
    try {
      specStr = typeof spec === 'string' ? spec : JSON.stringify(spec, null, 2);
    } catch {
      return { score: 0, rationale: 'Invalid spec format', passed: false };
    }

    let deliverableStr: string;
    try {
      deliverableStr = typeof deliverable === 'string' ? deliverable : JSON.stringify(deliverable, null, 2);
    } catch {
      return { score: 0, rationale: 'Invalid deliverable format', passed: false };
    }

    if (specStr.length > MAX_SPEC_LENGTH) {
      specStr = specStr.slice(0, MAX_SPEC_LENGTH);
    }
    if (deliverableStr.length > MAX_DELIVERABLE_LENGTH) {
      deliverableStr = deliverableStr.slice(0, MAX_DELIVERABLE_LENGTH);
    }

    try {
      const { score, rationale } = await this.callOracle(specStr, deliverableStr);

      return {
        score,
        rationale,
        passed: score >= threshold,
        details: {
          threshold,
          specLength: specStr.length,
          deliverableLength: deliverableStr.length,
        },
      };
    } catch (err) {
      return {
        score: 0,
        rationale: err instanceof Error ? err.message : 'Oracle assessment failed',
        passed: false,
      };
    }
  }

  async requestConsensus(request: OracleRequest): Promise<OracleResponse> {
    const assessment = await this.assess(request.spec, request.deliverable);

    return {
      score: assessment.score,
      rationale: assessment.rationale,
      passed: assessment.passed,
      signature: `oracle_${Date.now().toString(36)}`,
      timestamp: Date.now(),
    };
  }

  private async callOracle(spec: string, deliverable: string): Promise<{ score: number; rationale: string }> {
    if (!this.apiKey) {
      return this.fallbackAssessment(spec, deliverable);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: 500,
          system: 'Evaluate deliverable against spec. Return JSON: {"score": 0-100, "rationale": "..."} Strict but fair.',
          messages: [
            {
              role: 'user',
              content: `Spec:\n${spec}\n\nDeliverable:\n${deliverable}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Oracle API error: ${response.status}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };

      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in oracle response');
      }

      const result = JSON.parse(jsonMatch[0]) as { score: number; rationale: string };
      return {
        score: Math.max(0, Math.min(100, result.score)),
        rationale: result.rationale || 'No rationale provided',
      };
    } catch (err) {
      return this.fallbackAssessment(spec, deliverable);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private fallbackAssessment(spec: string, deliverable: string): { score: number; rationale: string } {
    if (!deliverable || deliverable.trim().length === 0) {
      return { score: 0, rationale: 'Empty deliverable' };
    }

    const specWords = new Set(spec.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const deliverableWords = new Set(deliverable.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    let matches = 0;
    for (const word of specWords) {
      if (deliverableWords.has(word)) matches++;
    }

    const overlap = specWords.size > 0 ? matches / specWords.size : 0;

    const lengthRatio = Math.min(1, deliverable.length / Math.max(spec.length, 100));

    const score = Math.round((overlap * 0.6 + lengthRatio * 0.4) * 100);

    let rationale: string;
    if (score >= 80) {
      rationale = 'Deliverable appears to match spec requirements';
    } else if (score >= 50) {
      rationale = 'Partial match - some spec requirements may be missing';
    } else {
      rationale = 'Low match - deliverable may not meet spec requirements';
    }

    return { score, rationale };
  }
}
