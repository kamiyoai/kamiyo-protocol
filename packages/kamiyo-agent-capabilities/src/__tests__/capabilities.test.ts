import { describe, expect, it, beforeAll } from 'vitest';
import { httpCapability } from '../http';
import { webCapability } from '../web';
import { emailCapability } from '../email';
import { filesCapability } from '../files';
import { codeCapability } from '../code';
import { calendarCapability } from '../calendar';
import { communicationCapability } from '../communication';
import { paymentsCapability } from '../payments';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), `kamiyo-cap-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'hello.txt'), 'Hello World');
  return () => rmSync(testDir, { recursive: true, force: true });
});

describe('httpCapability', () => {
  it('creates 4 tools', () => {
    const cap = httpCapability();
    expect(cap.name).toBe('http');
    expect(cap.tools).toHaveLength(4);
    expect(cap.tools.map(t => t.name)).toEqual([
      'http_get',
      'http_post',
      'http_put',
      'http_delete',
    ]);
  });

  it('host allowlist blocks unauthorized hosts', async () => {
    const cap = httpCapability({ allowedHosts: ['example.com'] });
    const get = cap.tools.find(t => t.name === 'http_get')!;
    await expect(get.handler({ url: 'https://evil.com/data' }, {} as any)).rejects.toThrow(
      'not in allowlist'
    );
  });
});

describe('webCapability', () => {
  it('creates 3 tools', () => {
    const cap = webCapability();
    expect(cap.name).toBe('web');
    expect(cap.tools).toHaveLength(3);
    expect(cap.tools.map(t => t.name)).toEqual(['web_browse', 'web_scrape', 'web_search']);
  });
});

describe('emailCapability', () => {
  it('creates 1 tool', () => {
    const cap = emailCapability({ transport: 'smtp', from: 'test@test.com' });
    expect(cap.name).toBe('email');
    expect(cap.tools).toHaveLength(1);
    expect(cap.tools[0].name).toBe('email_send');
    expect(cap.tools[0].requiresApproval).toBe(true);
  });
});

describe('filesCapability', () => {
  it('creates 4 tools', () => {
    const cap = filesCapability({ rootDir: testDir });
    expect(cap.name).toBe('files');
    expect(cap.tools).toHaveLength(4);
  });

  it('reads a file', async () => {
    const cap = filesCapability({ rootDir: testDir });
    const read = cap.tools.find(t => t.name === 'file_read')!;
    const result = await read.handler({ path: 'hello.txt' }, {} as any);
    expect(result).toBe('Hello World');
  });

  it('lists files', async () => {
    const cap = filesCapability({ rootDir: testDir });
    const list = cap.tools.find(t => t.name === 'file_list')!;
    const result = JSON.parse((await list.handler({}, {} as any)) as string);
    expect(result.some((f: any) => f.name === 'hello.txt')).toBe(true);
  });

  it('blocks path traversal', async () => {
    const cap = filesCapability({ rootDir: testDir });
    const read = cap.tools.find(t => t.name === 'file_read')!;
    await expect(read.handler({ path: '../../../etc/passwd' }, {} as any)).rejects.toThrow(
      'traversal'
    );
  });

  it('blocks writes when disabled', async () => {
    const cap = filesCapability({ rootDir: testDir });
    const write = cap.tools.find(t => t.name === 'file_write')!;
    await expect(write.handler({ path: 'x.txt', content: 'test' }, {} as any)).rejects.toThrow(
      'Write access not enabled'
    );
  });

  it('writes when enabled', async () => {
    const cap = filesCapability({ rootDir: testDir, allowWrite: true });
    const write = cap.tools.find(t => t.name === 'file_write')!;
    const result = JSON.parse(
      (await write.handler({ path: 'new.txt', content: 'created' }, {} as any)) as string
    );
    expect(result.written).toBe(true);
  });
});

describe('codeCapability', () => {
  it('creates 2 tools', () => {
    const cap = codeCapability();
    expect(cap.name).toBe('code');
    expect(cap.tools).toHaveLength(2);
  });

  it('executes code in sandbox', async () => {
    const cap = codeCapability();
    const exec = cap.tools.find(t => t.name === 'code_execute')!;
    const result = JSON.parse((await exec.handler({ code: 'return 2 + 2' }, {} as any)) as string);
    expect(result.success).toBe(true);
    expect(result.result).toBe(4);
  });

  it('evaluates expressions', async () => {
    const cap = codeCapability();
    const eval_ = cap.tools.find(t => t.name === 'code_eval')!;
    const result = JSON.parse(
      (await eval_.handler({ expression: 'Math.max(1,2,3)' }, {} as any)) as string
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it('catches errors in sandbox', async () => {
    const cap = codeCapability();
    const exec = cap.tools.find(t => t.name === 'code_execute')!;
    const result = JSON.parse(
      (await exec.handler({ code: 'throw new Error("boom")' }, {} as any)) as string
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('sandbox blocks process access', async () => {
    const cap = codeCapability();
    const exec = cap.tools.find(t => t.name === 'code_execute')!;
    const result = JSON.parse(
      (await exec.handler({ code: 'return typeof process' }, {} as any)) as string
    );
    expect(result.result).toBe('undefined');
  });
});

describe('calendarCapability', () => {
  it('creates 3 tools', () => {
    const cap = calendarCapability({ provider: 'google', authToken: 'test' });
    expect(cap.name).toBe('calendar');
    expect(cap.tools).toHaveLength(3);
    expect(cap.tools.find(t => t.name === 'calendar_create')!.requiresApproval).toBe(true);
  });
});

describe('communicationCapability', () => {
  it('creates tools only for configured platforms', () => {
    const slack = communicationCapability({ slack: { token: 'xoxb-test' } });
    expect(slack.tools).toHaveLength(1);
    expect(slack.tools[0].name).toBe('slack_send');

    const all = communicationCapability({
      slack: { token: 'a' },
      discord: { token: 'b' },
      telegram: { token: 'c' },
    });
    expect(all.tools).toHaveLength(3);
  });

  it('creates no tools when no platforms configured', () => {
    const cap = communicationCapability({});
    expect(cap.tools).toHaveLength(0);
  });
});

describe('paymentsCapability', () => {
  it('creates Stripe tools when configured', () => {
    const cap = paymentsCapability({ stripe: { secretKey: 'sk_test_xxx' } });
    expect(cap.name).toBe('payments');
    expect(cap.tools).toHaveLength(3);
    expect(cap.tools.every(t => t.category === 'payments')).toBe(true);
  });

  it('creates no tools without config', () => {
    const cap = paymentsCapability({});
    expect(cap.tools).toHaveLength(0);
  });
});
