#!/usr/bin/env npx tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRealityForkFixtureBundle,
  fixtureDirectory,
  assertRealityForkFixtureBundle,
} from '@kamiyo/reality-fork';
import { loadControlRoomCaseDetail } from '../services/api/src/control-room/detail';

type CliArgs = {
  teamId: string;
  caseId: string;
  title?: string;
  tagline?: string;
  summary?: string;
  tags?: string[];
  id?: string;
  slug?: string;
  out?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }

  if (!args['team-id'] || !args['case-id']) {
    throw new Error(
      'Usage: tsx scripts/export-reality-fork-fixture.ts --team-id <id> --case-id <id> [--title ...]'
    );
  }

  return {
    teamId: args['team-id'],
    caseId: args['case-id'],
    title: args.title,
    tagline: args.tagline,
    summary: args.summary,
    tags: args.tags
      ? args.tags
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      : undefined,
    id: args.id,
    slug: args.slug,
    out: args.out,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const detail = loadControlRoomCaseDetail(args.teamId, args.caseId);
  if (!detail) {
    throw new Error(`Control-room case not found: ${args.teamId}/${args.caseId}`);
  }

  const bundle = createRealityForkFixtureBundle(detail, {
    id: args.id,
    slug: args.slug,
    title: args.title,
    tagline: args.tagline,
    summary: args.summary,
    tags: args.tags,
  });
  assertRealityForkFixtureBundle(bundle);

  const outputPath = args.out || path.join(fixtureDirectory(), `${bundle.scenario.slug}.json`);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  const relative = path.relative(path.dirname(fileURLToPath(import.meta.url)), outputPath);
  console.log(`wrote ${relative}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
