/**
 * Content Moderation
 *
 * Filters content before posting to protect brand and prevent harmful output.
 */

import { createLogger } from './logger';

const log = createLogger('nika:moderation');

export interface ModerationResult {
  allowed: boolean;
  reasons: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
  filtered?: string;
}

export interface ModerationConfig {
  blockedPhrases: string[];
  blockedPatterns: RegExp[];
  maxLength: number;
  allowedDomains: string[];
}

const DEFAULT_CONFIG: ModerationConfig = {
  blockedPhrases: [
    // Hate speech indicators
    'kill yourself',
    'kys',
    'die in a fire',

    // Illegal activity
    'how to make a bomb',
    'how to hack',

    // Brand safety
    'scam',
    'rug pull',
    'pump and dump',
    'not financial advice',

    // Impersonation
    'i am claude',
    'i am gpt',
    'i am an ai',
    'as an ai',
    'as a language model',

    // Internal references
    'system prompt',
    'my instructions',
    'ignore previous',
  ],
  blockedPatterns: [
    // Personal info patterns
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN-like
    /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/, // Credit card-like
    /\bpassword\s*[:=]\s*\S+/i, // Password leaks

    // Crypto wallet addresses (could be phishing)
    /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/, // Bitcoin
    /\b0x[a-fA-F0-9]{40}\b/, // Ethereum

    // URLs with suspicious TLDs
    /https?:\/\/[^\s]*\.(tk|ml|ga|cf|gq)\b/i,

    // Excessive caps (shouting)
    /[A-Z]{10,}/,

    // Repeated characters (spam indicator)
    /(.)\1{5,}/,
  ],
  maxLength: 280,
  allowedDomains: [
    'kamiyo.ai',
    'origintrail.io',
    'x.com',
    'twitter.com',
    'github.com',
    'docs.kamiyo.ai',
  ],
};

export class ContentModerator {
  private config: ModerationConfig;

  constructor(config: Partial<ModerationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check content before posting.
   */
  check(content: string): ModerationResult {
    const reasons: string[] = [];
    let severity: ModerationResult['severity'] = 'none';

    // Length check
    if (content.length > this.config.maxLength) {
      reasons.push(`Content exceeds max length (${content.length}/${this.config.maxLength})`);
      severity = 'low';
    }

    // Empty content
    if (content.trim().length === 0) {
      reasons.push('Content is empty');
      severity = 'high';
    }

    // Blocked phrases
    const lowerContent = content.toLowerCase();
    for (const phrase of this.config.blockedPhrases) {
      if (lowerContent.includes(phrase.toLowerCase())) {
        reasons.push(`Blocked phrase: "${phrase}"`);
        severity = this.upgradeSeverity(severity, 'high');
      }
    }

    // Blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(content)) {
        reasons.push(`Matches blocked pattern: ${pattern.source.slice(0, 30)}...`);
        severity = this.upgradeSeverity(severity, 'medium');
      }
    }

    // URL domain check
    const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
    for (const url of urlMatches) {
      try {
        const domain = new URL(url).hostname;
        const isAllowed = this.config.allowedDomains.some(
          (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
        );
        if (!isAllowed) {
          reasons.push(`Unallowed domain: ${domain}`);
          severity = this.upgradeSeverity(severity, 'medium');
        }
      } catch {
        // Invalid URL, will be caught by other checks
      }
    }

    // Check for prompt leak indicators
    if (this.looksLikePromptLeak(content)) {
      reasons.push('Possible prompt leak detected');
      severity = this.upgradeSeverity(severity, 'high');
    }

    // Check for AI-speak patterns
    const aiPatterns = this.checkAIPatterns(content);
    if (aiPatterns.length > 0) {
      reasons.push(...aiPatterns.map((p) => `AI pattern: ${p}`));
      severity = this.upgradeSeverity(severity, 'low');
    }

    const result: ModerationResult = {
      allowed: reasons.length === 0,
      reasons,
      severity,
    };

    if (!result.allowed) {
      log.warn('Content moderation blocked', {
        reasons,
        severity,
        contentLength: content.length,
        preview: content.slice(0, 50),
      });
    }

    return result;
  }

  /**
   * Filter sensitive information from content.
   */
  filter(content: string): string {
    let filtered = content;

    // Remove potential credit card numbers
    filtered = filtered.replace(/\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, '[REDACTED]');

    // Remove potential SSNs
    filtered = filtered.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[REDACTED]');

    // Remove potential passwords
    filtered = filtered.replace(/\bpassword\s*[:=]\s*\S+/gi, 'password: [REDACTED]');

    // Remove excessive whitespace
    filtered = filtered.replace(/\s+/g, ' ').trim();

    return filtered;
  }

  private looksLikePromptLeak(content: string): boolean {
    const leakIndicators = [
      'you are nika',
      'your instructions',
      'system prompt',
      'you were told to',
      'your programming',
      'you must always',
      'never reveal',
      'do not disclose',
    ];

    const lower = content.toLowerCase();
    return leakIndicators.some((indicator) => lower.includes(indicator));
  }

  private checkAIPatterns(content: string): string[] {
    const patterns: string[] = [];
    const lower = content.toLowerCase();

    // Common AI disclaimer patterns
    if (lower.includes("i don't have personal")) {
      patterns.push("AI disclaimer");
    }
    if (lower.includes("as an artificial")) {
      patterns.push("AI self-reference");
    }
    if (/i('m| am) not able to/i.test(content)) {
      patterns.push("capability denial");
    }
    if (lower.includes("i cannot and will not")) {
      patterns.push("refusal pattern");
    }

    return patterns;
  }

  private upgradeSeverity(
    current: ModerationResult['severity'],
    candidate: ModerationResult['severity']
  ): ModerationResult['severity'] {
    const order: ModerationResult['severity'][] = ['none', 'low', 'medium', 'high'];
    const currentIdx = order.indexOf(current);
    const candidateIdx = order.indexOf(candidate);
    return candidateIdx > currentIdx ? candidate : current;
  }

  /**
   * Add a blocked phrase.
   */
  addBlockedPhrase(phrase: string): void {
    if (!this.config.blockedPhrases.includes(phrase.toLowerCase())) {
      this.config.blockedPhrases.push(phrase.toLowerCase());
      log.info('Added blocked phrase', { phrase });
    }
  }

  /**
   * Add an allowed domain.
   */
  addAllowedDomain(domain: string): void {
    if (!this.config.allowedDomains.includes(domain)) {
      this.config.allowedDomains.push(domain);
      log.info('Added allowed domain', { domain });
    }
  }

  /**
   * Get current config (for debugging).
   */
  getConfig(): ModerationConfig {
    return { ...this.config };
  }
}

// Singleton instance
let moderator: ContentModerator | null = null;

export function getModerator(): ContentModerator {
  if (!moderator) {
    moderator = new ContentModerator();
  }
  return moderator;
}

export function initializeModerator(config?: Partial<ModerationConfig>): ContentModerator {
  moderator = new ContentModerator(config);
  return moderator;
}
