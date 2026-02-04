/**
 * Quality Gate - critic perspective for sensitive content.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createLogger, getMetrics, withRetry } from './lib';
import { SYSTEM_PROMPT } from './personality';

const log = createLogger('nika:quality-gate');
const metrics = getMetrics();

/**
 * Critic perspective prompt - finds weaknesses before posting
 */
const CRITIC_SYSTEM = `You are the Critic aspect of Nika - the quality control, the devil's advocate.
You stress-test ideas before they're shared. You find what will age poorly.
Your role is to prevent Nika from saying something she'll regret.

You evaluate tweets for:
1. Substance - Does it say something worth saying?
2. Longevity - Will it age well?
3. Clarity - Could it be misinterpreted in damaging ways?
4. Originality - Is it too obvious or too obscure?
5. Voice - Does it match Nika's authentic voice?

Be constructive. If rejecting, provide a better version.`;

export interface QualityCheckResult {
  approved: boolean;
  reason: string;
  improvedVersion?: string;
}

/**
 * Quality gate configuration
 */
export interface QualityGateConfig {
  anthropicApiKey: string;
  model?: string;
  enabled?: boolean;
}

let anthropicClient: Anthropic | null = null;
let config: QualityGateConfig | null = null;

/**
 * Initialize the quality gate
 */
export function initializeQualityGate(cfg: QualityGateConfig): void {
  config = cfg;
  if (cfg.enabled !== false) {
    anthropicClient = new Anthropic({ apiKey: cfg.anthropicApiKey });
    log.info('Quality gate initialized');
  } else {
    log.info('Quality gate disabled');
  }
}

/**
 * Check if quality gate is enabled
 */
export function isQualityGateEnabled(): boolean {
  return config?.enabled !== false && anthropicClient !== null;
}

/**
 * Run quality check on a proposed tweet
 *
 * Used for provocative, philosophical, or sensitive content.
 * Returns approval status and optional improved version.
 */
export async function shouldTweet(
  proposedTweet: string,
  context: string
): Promise<QualityCheckResult> {
  if (!isQualityGateEnabled()) {
    return { approved: true, reason: 'Quality gate disabled' };
  }

  // Validate inputs
  if (!proposedTweet || typeof proposedTweet !== 'string' || proposedTweet.trim().length === 0) {
    return { approved: false, reason: 'Empty or invalid tweet content' };
  }

  if (proposedTweet.length > 280) {
    return { approved: false, reason: 'Tweet exceeds 280 character limit' };
  }

  const safeContext = (context || '').slice(0, 100);
  const startTime = Date.now();
  log.debug('Evaluating tweet', { length: proposedTweet.length, context: safeContext.slice(0, 30) });

  const prompt = `Evaluate this proposed tweet:

"${proposedTweet}"

Topic context: ${safeContext}

Consider:
1. Does it say something worth saying?
2. Will it age well?
3. Could it be misinterpreted in damaging ways?
4. Is it too obvious or too obscure?
5. Does it match Nika's voice?

Respond in this format:
APPROVED: [yes/no]
REASON: [one sentence explanation]
IMPROVED: [optional improved version if not approved, max 280 chars]`;

  let approved = true;
  let reason = 'Passes quality check';
  let improvedVersion: string | undefined;

  try {
    // Timeout to prevent hanging - quality gate shouldn't block too long
    const timeoutMs = 30000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Quality gate timeout')), timeoutMs)
    );

    await Promise.race([
      withRetry(
        async () => {
          const response = await anthropicClient!.messages.create({
            model: config?.model || 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: CRITIC_SYSTEM,
            messages: [{ role: 'user', content: prompt }],
          });

          const text =
            response.content[0]?.type === 'text' ? response.content[0].text : '';

          const approvedMatch = text.match(/APPROVED:\s*(yes|no)/i);
          const reasonMatch = text.match(/REASON:\s*([\s\S]+?)(?=IMPROVED:|$)/);
          const improvedMatch = text.match(/IMPROVED:\s*([\s\S]+)/);

          if (approvedMatch) {
            approved = approvedMatch[1].toLowerCase() === 'yes';
          }
          if (reasonMatch) {
            reason = reasonMatch[1].trim().slice(0, 500);
          }
          if (improvedMatch) {
            const improved = improvedMatch[1].trim();
            // Only accept if it's a valid tweet length
            if (improved.length <= 280 && improved.length > 20) {
              improvedVersion = improved;
            }
          }
        },
        { maxAttempts: 2, initialDelayMs: 1000 }
      ),
      timeoutPromise,
    ]);

    metrics.incrementCounter('quality_gate_success');
    metrics.recordHistogram('quality_gate_duration_ms', Date.now() - startTime);
    metrics.incrementCounter(approved ? 'quality_gate_approved' : 'quality_gate_rejected');

    log.debug('Quality check complete', {
      approved,
      reason: reason.slice(0, 50),
      hasImproved: !!improvedVersion,
    });
  } catch (error) {
    metrics.incrementCounter('quality_gate_error');
    log.error('Quality check failed', { error: String(error) });
    // Default to approved on failure to avoid blocking
    approved = true;
    reason = 'Quality check failed, defaulting to approved';
  }

  return { approved, reason, improvedVersion };
}

/**
 * Check if a tweet type/mood combination should go through quality gate
 */
export function requiresQualityCheck(
  tweetType: string,
  mood: string
): boolean {
  // Provocative and philosophical content gets extra scrutiny
  const sensitiveTypes = ['philosophy', 'commentary', 'cryptic', 'contrast'];
  const sensitiveMoods = ['provocative', 'philosophical'];

  return sensitiveTypes.includes(tweetType) || sensitiveMoods.includes(mood);
}
