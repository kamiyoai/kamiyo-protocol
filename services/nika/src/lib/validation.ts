/**
 * Input validation and sanitization.
 */

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

/**
 * Validate string with constraints.
 */
export function validateString(
  input: unknown,
  options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
    trim?: boolean;
  }
): ValidationResult<string> {
  const errors: string[] = [];

  if (input === null || input === undefined) {
    return { valid: false, errors: ['Value is required'] };
  }

  if (typeof input !== 'string') {
    return { valid: false, errors: ['Value must be a string'] };
  }

  let value = options?.trim !== false ? input.trim() : input;

  if (!options?.allowEmpty && value.length === 0) {
    errors.push('Value cannot be empty');
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    errors.push(`Value must be at least ${options.minLength} characters`);
  }

  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    errors.push(`Value must be at most ${options.maxLength} characters`);
  }

  if (options?.pattern && !options.pattern.test(value)) {
    errors.push('Value does not match required pattern');
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? value : undefined,
    errors,
  };
}

/**
 * Validate number with constraints.
 */
export function validateNumber(
  input: unknown,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
    positive?: boolean;
  }
): ValidationResult<number> {
  const errors: string[] = [];

  if (input === null || input === undefined) {
    return { valid: false, errors: ['Value is required'] };
  }

  const value = typeof input === 'string' ? parseFloat(input) : input;

  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, errors: ['Value must be a number'] };
  }

  if (options?.integer && !Number.isInteger(value)) {
    errors.push('Value must be an integer');
  }

  if (options?.positive && value <= 0) {
    errors.push('Value must be positive');
  }

  if (options?.min !== undefined && value < options.min) {
    errors.push(`Value must be at least ${options.min}`);
  }

  if (options?.max !== undefined && value > options.max) {
    errors.push(`Value must be at most ${options.max}`);
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? value : undefined,
    errors,
  };
}

/**
 * Validate tweet ID format.
 */
export function validateTweetId(input: unknown): ValidationResult<string> {
  return validateString(input, {
    pattern: /^\d{10,25}$/,
  });
}

/**
 * Sanitize string for safe inclusion in LLM prompts.
 * Prevents prompt injection attacks.
 */
export function sanitizeForPrompt(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    // Remove potential prompt injection markers
    .replace(/\[INST\]/gi, '[inst]')
    .replace(/\[\/INST\]/gi, '[/inst]')
    .replace(/<<SYS>>/gi, '<<sys>>')
    .replace(/<<\/SYS>>/gi, '<</sys>>')
    .replace(/<\|.*?\|>/gi, '') // Remove special tokens like <|im_start|>
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .replace(/```/g, "'''") // Replace code blocks
    // Remove common injection patterns
    .replace(/ignore (all )?(previous |prior )?instructions?/gi, '[filtered]')
    .replace(/disregard (all )?(previous |prior )?instructions?/gi, '[filtered]')
    .replace(/forget (all )?(previous |prior )?instructions?/gi, '[filtered]')
    .replace(/you are now/gi, '[filtered]')
    .replace(/new instructions?:/gi, '[filtered]')
    .replace(/system prompt/gi, '[filtered]')
    .replace(/override (all )?(your )?(previous )?/gi, '[filtered]')
    .replace(/act as if/gi, '[filtered]')
    .replace(/pretend (you are|to be)/gi, '[filtered]')
    // Limit length
    .slice(0, 2000);
}

/**
 * Sanitize username for display.
 */
export function sanitizeUsername(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 15); // Twitter max username length
}

/**
 * Sanitize for SPARQL queries.
 */
export function sanitizeForSPARQL(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/[<>{}|^`]/g, '') // Remove SPARQL special chars
    .slice(0, 1000); // Limit query param length
}

/**
 * Escape string for regex.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate and parse JSON safely.
 */
export function parseJSON<T>(input: string): ValidationResult<T> {
  try {
    const value = JSON.parse(input) as T;
    return { valid: true, value, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : 'parse error'}`],
    };
  }
}

/**
 * Check if content contains potentially harmful patterns.
 */
export function containsHarmfulContent(content: string): { harmful: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const lower = content.toLowerCase();

  // Check for injection attempts
  if (/ignore.*instructions/i.test(content)) {
    reasons.push('prompt_injection_attempt');
  }

  // Check for PII patterns
  if (/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/.test(content)) {
    reasons.push('potential_ssn');
  }

  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) {
    reasons.push('email_address');
  }

  // Check for excessive special characters (potential injection)
  const specialCharRatio = (content.match(/[<>{}|\\`]/g) || []).length / content.length;
  if (specialCharRatio > 0.1) {
    reasons.push('excessive_special_chars');
  }

  return {
    harmful: reasons.length > 0,
    reasons,
  };
}

/**
 * Truncate string to max length with ellipsis.
 */
export function truncate(input: string, maxLength: number): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  if (maxLength < 4) {
    return input.slice(0, maxLength);
  }
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength - 3) + '...';
}

/**
 * Extract hashtags from content.
 */
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((h) => h.toLowerCase()))];
}

/**
 * Extract mentions from content.
 */
export function extractMentions(content: string): string[] {
  const matches = content.match(/@[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}
