import Anthropic from '@anthropic-ai/sdk';
import type { DKGPublisher } from './dkg-publisher.js';

export interface QualityAssessment {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'accept' | 'revise' | 'reject';
}

export interface QualityServiceConfig {
  anthropic: Anthropic;
  dkg?: DKGPublisher;
}

export class QualityService {
  private anthropic: Anthropic;
  private dkg?: DKGPublisher;

  constructor(config: QualityServiceConfig) {
    this.anthropic = config.anthropic;
    this.dkg = config.dkg;
  }

  async assessQuality(
    jobDescription: string,
    deliverable: string
  ): Promise<QualityAssessment> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a quality assessor for agent work deliverables.

Evaluate the deliverable against the job requirements and return JSON:
{
  "score": 0-100,
  "summary": "Brief assessment",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "recommendation": "accept" | "revise" | "reject"
}

Scoring guide:
- 90-100: Exceptional, exceeds requirements
- 75-89: Good, meets all requirements
- 60-74: Acceptable, meets most requirements
- 40-59: Needs revision
- 0-39: Does not meet requirements`,
      messages: [
        {
          role: 'user',
          content: `Job Description:
${jobDescription.slice(0, 2000)}

Deliverable:
${deliverable.slice(0, 4000)}

Assess the quality.`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return this.defaultAssessment();
    }

    try {
      const jsonMatch = text.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');

      const parsed = JSON.parse(jsonMatch[0]) as {
        score?: number;
        summary?: string;
        strengths?: string[];
        weaknesses?: string[];
        recommendation?: string;
      };

      return {
        score: Math.max(0, Math.min(100, parsed.score ?? 50)),
        summary: String(parsed.summary ?? 'Assessment complete'),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
        recommendation: this.validateRecommendation(parsed.recommendation),
      };
    } catch {
      return this.defaultAssessment();
    }
  }

  private validateRecommendation(rec?: string): 'accept' | 'revise' | 'reject' {
    if (rec === 'accept' || rec === 'revise' || rec === 'reject') {
      return rec;
    }
    return 'revise';
  }

  private defaultAssessment(): QualityAssessment {
    return {
      score: 50,
      summary: 'Unable to fully assess quality',
      strengths: [],
      weaknesses: ['Assessment incomplete'],
      recommendation: 'revise',
    };
  }

  async publishQualityAttestation(params: {
    providerId: string;
    providerName?: string;
    qualityScore: number;
    explanation: string;
    escrowId?: string;
    transactionHash?: string;
  }): Promise<string | null> {
    if (!this.dkg) return null;

    try {
      // Use the DKG publisher's method if available
      // For now, return null as DKGPublisher doesn't have this specific method
      return null;
    } catch (err) {
      console.error('[QualityService] DKG publish failed:', err);
      return null;
    }
  }

  formatAssessmentReport(assessment: QualityAssessment): string {
    const emoji = assessment.score >= 75 ? '✓' : assessment.score >= 50 ? '~' : '✗';

    let report = `## Quality Assessment ${emoji}

**Score:** ${assessment.score}/100
**Recommendation:** ${assessment.recommendation.toUpperCase()}

${assessment.summary}`;

    if (assessment.strengths.length > 0) {
      report += `\n\n### Strengths\n${assessment.strengths.map((s) => `- ${s}`).join('\n')}`;
    }

    if (assessment.weaknesses.length > 0) {
      report += `\n\n### Areas for Improvement\n${assessment.weaknesses.map((w) => `- ${w}`).join('\n')}`;
    }

    return report;
  }

  getScoreLabel(score: number): string {
    if (score >= 90) return 'Exceptional';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Acceptable';
    if (score >= 40) return 'Needs Work';
    return 'Poor';
  }

  shouldAutoRelease(score: number): boolean {
    // Auto-release escrow if score is 75+ (meets requirements)
    return score >= 75;
  }

  shouldAutoDispute(score: number): boolean {
    // Auto-dispute if score is below 40 (clearly doesn't meet requirements)
    return score < 40;
  }
}
