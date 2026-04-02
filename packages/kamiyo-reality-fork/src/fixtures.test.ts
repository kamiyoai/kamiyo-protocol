import { describe, expect, it } from 'vitest';
import { listFixtureScenarios, loadFixtureScenario } from './fixtures';

describe('fixture loading', () => {
  it('lists the generated launch scenarios', async () => {
    const scenarios = await listFixtureScenarios();
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
    expect(scenarios.some(scenario => scenario.slug === 'ship-or-delay')).toBe(true);
  });

  it('loads a fixture scenario by slug', async () => {
    const scenario = await loadFixtureScenario('incident-response');
    expect(scenario.title).toContain('Bridge outage');
    expect(scenario.branches.length).toBe(4);
  });
});
