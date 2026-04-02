import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRealityForkFixtureBundle } from './validate';
import type {
  RealityForkFixtureBundle,
  RealityForkScenario,
  RealityForkScenarioListItem,
} from './types';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(here, '../fixtures');

async function readFixtureBundle(filePath: string): Promise<RealityForkFixtureBundle> {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  assertRealityForkFixtureBundle(raw);
  return raw;
}

export async function listFixtureScenarios(): Promise<RealityForkScenarioListItem[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const bundles = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => readFixtureBundle(path.join(fixturesDir, entry.name)))
  );

  return bundles
    .map((bundle: RealityForkFixtureBundle) => ({
      id: bundle.scenario.id,
      slug: bundle.scenario.slug,
      title: bundle.scenario.title,
      tagline: bundle.scenario.tagline,
      summary: bundle.scenario.summary,
      tags: bundle.scenario.tags,
      sourceLabel: bundle.scenario.sourceLabel,
      winnerLabel: bundle.scenario.decision.winnerLabel,
      status: bundle.scenario.status,
    }))
    .sort((left: RealityForkScenarioListItem, right: RealityForkScenarioListItem) =>
      left.title.localeCompare(right.title)
    );
}

export async function loadFixtureScenario(id: string): Promise<RealityForkScenario> {
  const entries = await fs.readdir(fixturesDir);
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const bundle = await readFixtureBundle(path.join(fixturesDir, entry));
    if (bundle.scenario.id === id || bundle.scenario.slug === id || entry === `${id}.json`) {
      return bundle.scenario;
    }
  }
  throw new Error(`Fixture scenario not found: ${id}`);
}

export function fixtureDirectory(): string {
  return fixturesDir;
}
