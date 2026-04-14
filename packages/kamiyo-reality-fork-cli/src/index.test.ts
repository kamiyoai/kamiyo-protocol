import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, DEFAULT_API_URL } from './config.js';
import { renderWorkflowStep, resolveEffectiveInvocation, tokenizeLine } from './index.js';

describe('tokenizeLine', () => {
  it('expands aliases before parsing the rest of the line', () => {
    expect(tokenizeLine('ls market-1', { ls: 'projects list' })).toEqual([
      'projects',
      'list',
      'market-1',
    ]);
  });
});

describe('renderWorkflowStep', () => {
  it('renders positional and profile placeholders', () => {
    expect(
      renderWorkflowStep('projects get {{1}} --profile {{profile}}', ['proj-1'], {
        profile: 'prod',
        apiUrl: 'http://127.0.0.1:3000',
      })
    ).toContain('prod');
  });
});

describe('resolveEffectiveInvocation', () => {
  it('falls back to the default profile config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-cli-'));
    const store = ConfigStore.load(tempDir);
    const invocation = resolveEffectiveInvocation(store, {}, {}, 'cli', 'doctor');

    expect(invocation.profile).toBeDefined();
    expect(invocation.apiUrl).toBe(DEFAULT_API_URL);
  });
});
