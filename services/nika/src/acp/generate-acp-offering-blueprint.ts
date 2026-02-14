import { sanitizeForPrompt } from '../lib';
import { basicSafetyCheck, callNikaLlm, extractJson, LONGFORM_SYSTEM_PROMPT } from './utils';

const OFFERING_NAME_RE = /^[a-z][a-z0-9_]*$/;

function buildPrompt(input: {
  capability: string;
  context?: string;
  constraints?: string;
  issues?: string[];
}): string {
  const base = [
    'Design an Agent Commerce Protocol (ACP) job offering for the capability below.',
    '',
    `CAPABILITY: ${input.capability}`,
    input.context ? `CONTEXT: ${input.context}` : null,
    input.constraints ? `CONSTRAINTS: ${input.constraints}` : null,
    '',
    'Output requirements:',
    '- Return ONLY valid JSON (no markdown).',
    '- JSON keys: offeringName, offeringJson, handlersTs, notes',
    '- offeringName must match regex: ^[a-z][a-z0-9_]*$',
    '- offeringJson must be a full offering.json payload with:',
    '  - name, description, jobFee, jobFeeType, slaMinutes, requiredFunds, requirement',
    '- handlersTs must be a complete handlers.ts template that exports:',
    '  - executeJob(request)',
    '  - validateRequirements(request)',
    '  - requestPayment(request)',
    '- If offeringJson.requiredFunds is true, handlersTs must also export requestAdditionalFunds(request).',
    '',
    'Guidance:',
    '- Prefer fixed pricing unless funds custody is required.',
    '- Keep requirement schema minimal and typed.',
    '- Include safety validation (length limits, required fields).',
  ].filter(Boolean) as string[];

  if (!input.issues || input.issues.length === 0) return base.join('\n');

  return [
    ...base,
    '',
    'Fix these issues from the previous attempt:',
    ...input.issues.map((issue) => `- ${issue}`),
  ].join('\n');
}

function validateBlueprint(parsed: any): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  const offeringName = typeof parsed?.offeringName === 'string' ? parsed.offeringName.trim() : '';
  if (!offeringName) issues.push('offeringName:missing');
  if (offeringName && !OFFERING_NAME_RE.test(offeringName)) issues.push('offeringName:invalid');

  const offeringJson = parsed?.offeringJson;
  if (!offeringJson || typeof offeringJson !== 'object') {
    issues.push('offeringJson:missing');
  } else {
    if (String(offeringJson.name ?? '').trim() !== offeringName) issues.push('offeringJson.name:mismatch');
    if (!String(offeringJson.description ?? '').trim()) issues.push('offeringJson.description:missing');
    if (typeof offeringJson.jobFee !== 'number' || !(offeringJson.jobFee > 0)) issues.push('offeringJson.jobFee:invalid');
    if (offeringJson.jobFeeType !== 'fixed' && offeringJson.jobFeeType !== 'percentage') {
      issues.push('offeringJson.jobFeeType:invalid');
    }
    if (typeof offeringJson.slaMinutes !== 'number' || !(offeringJson.slaMinutes > 0)) issues.push('offeringJson.slaMinutes:invalid');
    if (typeof offeringJson.requiredFunds !== 'boolean') issues.push('offeringJson.requiredFunds:invalid');
    if (!offeringJson.requirement || typeof offeringJson.requirement !== 'object') issues.push('offeringJson.requirement:missing');
  }

  const handlersTs = typeof parsed?.handlersTs === 'string' ? parsed.handlersTs : '';
  if (!handlersTs.trim()) issues.push('handlersTs:missing');
  if (handlersTs && !/export\s+async\s+function\s+executeJob\s*\(/.test(handlersTs)) issues.push('handlersTs:missing_executeJob');
  if (handlersTs && !/export\s+function\s+validateRequirements\s*\(/.test(handlersTs)) issues.push('handlersTs:missing_validateRequirements');
  if (handlersTs && !/export\s+function\s+requestPayment\s*\(/.test(handlersTs)) issues.push('handlersTs:missing_requestPayment');

  const requiredFunds = !!offeringJson?.requiredFunds;
  if (requiredFunds && handlersTs && !/export\s+function\s+requestAdditionalFunds\s*\(/.test(handlersTs)) {
    issues.push('handlersTs:missing_requestAdditionalFunds');
  }

  const safety = basicSafetyCheck(JSON.stringify(parsed));
  if (!safety.ok) issues.push(`safety:${safety.reason || 'unknown'}`);

  return { ok: issues.length === 0, issues };
}

export async function generateAcpOfferingBlueprint(input: {
  capability: string;
  context?: string;
  constraints?: string;
}): Promise<{
  offeringName: string;
  offeringJson: Record<string, unknown>;
  handlersTs: string;
  notes?: unknown;
}> {
  const capability = sanitizeForPrompt(input.capability).trim();
  if (!capability) throw new Error('Missing capability');

  const context = input.context ? sanitizeForPrompt(input.context).trim() : undefined;
  const constraints = input.constraints ? sanitizeForPrompt(input.constraints).trim() : undefined;

  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildPrompt({
      capability,
      context,
      constraints,
      issues: attempt === 1 ? undefined : lastIssues,
    });

    const response = await callNikaLlm(prompt, {
      systemPrompt: LONGFORM_SYSTEM_PROMPT,
      maxTokens: 2000,
    });

    let parsed: any;
    try {
      parsed = extractJson(response);
    } catch (error) {
      lastIssues = [`json_parse_failed:${error instanceof Error ? error.message : String(error)}`];
      continue;
    }

    const check = validateBlueprint(parsed);
    if (!check.ok) {
      lastIssues = check.issues.slice(0, 16);
      continue;
    }

    return {
      offeringName: String(parsed.offeringName).trim(),
      offeringJson: parsed.offeringJson as Record<string, unknown>,
      handlersTs: String(parsed.handlersTs),
      notes: parsed.notes,
    };
  }

  throw new Error(`Failed to generate ACP blueprint: ${lastIssues.join('; ')}`);
}

