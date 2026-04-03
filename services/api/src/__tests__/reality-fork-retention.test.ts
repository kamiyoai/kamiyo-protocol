import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('reality-fork retention helpers', () => {
  let tempDataDir = '';
  let closeDatabase: (() => void) | undefined;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-reality-fork-retention-'));
    process.env.DATA_DIR = tempDataDir;
  });

  afterEach(() => {
    closeDatabase?.();
    closeDatabase = undefined;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('summarizes and prunes orphan uploads and stale terminal events', async () => {
    const { default: db, closeDatabase: closeDb } = await import('../db');
    const { getRealityForkRetentionSummary, runRealityForkRetention } =
      await import('../reality-fork/retention');
    closeDatabase = closeDb;

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `
      INSERT INTO reality_fork_blobs (id, sha256, storage_key, mime_type, file_name, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'rf_blob_test',
      'a'.repeat(64),
      'blobs/aa/test.txt',
      'text/plain',
      'test.txt',
      128,
      now - 60 * 60 * 48
    );
    db.prepare(
      `
      INSERT INTO reality_fork_uploads (id, blob_id, file_name, mime_type, size_bytes, source_type, created_by_ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'rf_upload_old',
      'rf_blob_test',
      'test.txt',
      'text/plain',
      128,
      'text',
      '127.0.0.1',
      now - 60 * 60 * 48
    );
    db.prepare(
      `
      INSERT INTO reality_fork_projects (
        id, slug, title, prompt, claim, description, tags_json, simulation_config_json, warnings_json, decision_mode, created_by_ip, status, created_at, updated_at, published_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'rf_proj_old',
      'old-project',
      'Old project',
      'Old prompt',
      'Old prompt',
      null,
      '[]',
      '{}',
      '[]',
      'score_then_truth_court',
      '127.0.0.1',
      'published',
      now - 60 * 60 * 24 * 40,
      now - 60 * 60 * 24 * 40,
      now - 60 * 60 * 24 * 40
    );
    db.prepare(
      `
      INSERT INTO reality_fork_project_events (id, project_id, job_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run('rf_evt_old', 'rf_proj_old', null, 'job_completed', '{}', now - 60 * 60 * 24 * 20);

    const before = getRealityForkRetentionSummary({
      nowMs: now * 1000,
      config: {
        orphanUploadHours: 24,
        terminalProjectDays: 30,
        draftProjectDays: 7,
        projectEventDays: 14,
      },
    });
    expect(before.orphanUploads.count).toBe(1);
    expect(before.terminalProjects.count).toBe(1);
    expect(before.oldProjectEvents.count).toBe(1);

    const result = runRealityForkRetention({
      nowMs: now * 1000,
      config: {
        orphanUploadHours: 24,
        terminalProjectDays: 30,
        draftProjectDays: 7,
        projectEventDays: 14,
      },
    });
    expect(result.deletedUploads).toBe(1);
    expect(result.deletedProjectEvents).toBe(1);
    expect(result.summary.orphanUploads.count).toBe(0);
    expect(result.summary.oldProjectEvents.count).toBe(0);
  });
});
