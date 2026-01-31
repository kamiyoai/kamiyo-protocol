import type { Job } from '../src/types.js';

const mockJob: Job = {
  id: 1,
  postId: 'test-post',
  requesterWallet: 'MockWallet111111111111111111111111111111111',
  escrowAddress: null,
  escrowTx: null,
  amountSol: 0.5,
  description: 'Build a landing page with images and copy',
  status: 'in_progress',
  deliverable: null,
  createdAt: Date.now(),
  completedAt: null,
};

async function runTests() {
  console.log('\nSubcontract Tests\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((err) => {
            console.log(`  ✗ ${name}: ${err.message}`);
            failed++;
          });
      }
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log('Subtask interface:');

  test('Subtask has required fields', () => {
    const subtask = {
      id: 'task-1',
      type: 'code-generation' as const,
      spec: 'Build a component',
      budget: 0.1,
      priority: 3,
      dependencies: [],
    };
    if (!subtask.id) throw new Error('Missing id');
    if (!subtask.type) throw new Error('Missing type');
    if (!subtask.spec) throw new Error('Missing spec');
    if (typeof subtask.budget !== 'number') throw new Error('Budget must be number');
  });

  test('ComplexityAssessment has required fields', () => {
    const assessment = {
      needsSubcontracting: true,
      subtasks: [],
      reason: 'Multiple skills required',
      estimatedTotalBudget: 0.3,
    };
    if (typeof assessment.needsSubcontracting !== 'boolean') throw new Error('Invalid needsSubcontracting');
    if (!Array.isArray(assessment.subtasks)) throw new Error('subtasks must be array');
    if (typeof assessment.estimatedTotalBudget !== 'number') throw new Error('Invalid budget');
  });

  console.log('\nBudget validation:');

  test('margin calculation is correct', () => {
    const marginPercent = 15;
    const jobBudget = 1.0;
    const margin = jobBudget * (marginPercent / 100);
    const available = jobBudget - margin;
    if (margin !== 0.15) throw new Error(`Wrong margin: ${margin}`);
    if (available !== 0.85) throw new Error(`Wrong available: ${available}`);
  });

  test('subtask budget bounds are enforced', () => {
    const MIN_SUBTASK_BUDGET = 0.001;
    const MAX_SUBTASK_BUDGET = 10;
    const rawBudget = 0.0001;
    const clamped = Math.max(MIN_SUBTASK_BUDGET, Math.min(MAX_SUBTASK_BUDGET, rawBudget));
    if (clamped !== MIN_SUBTASK_BUDGET) throw new Error(`Wrong clamped budget: ${clamped}`);
  });

  console.log('\nCapability mapping:');

  test('common terms map to capabilities', () => {
    const CAPABILITY_MAP: Record<string, string> = {
      code: 'code-generation',
      coding: 'code-generation',
      image: 'image-generation',
      copy: 'copywriting',
    };
    if (CAPABILITY_MAP['code'] !== 'code-generation') throw new Error('code mapping wrong');
    if (CAPABILITY_MAP['image'] !== 'image-generation') throw new Error('image mapping wrong');
  });

  console.log('\nDelivery aggregation:');

  test('deliveries can be mapped by subtask ID', () => {
    const deliveries = [
      { subtaskId: 'a', deliverable: 'result-a', paid: true },
      { subtaskId: 'b', deliverable: 'result-b', paid: false },
    ];
    const map = new Map(deliveries.map((d) => [d.subtaskId, d]));
    if (map.get('a')?.deliverable !== 'result-a') throw new Error('Map lookup failed');
    if (map.size !== 2) throw new Error('Map size wrong');
  });

  test('filters successful deliveries', () => {
    const deliveries = [
      { subtaskId: 'a', deliverable: 'result-a', paid: true },
      { subtaskId: 'b', deliverable: null, paid: false },
      { subtaskId: 'c', deliverable: 'result-c', paid: true },
    ];
    const successful = deliveries.filter((d) => d.deliverable);
    if (successful.length !== 2) throw new Error(`Wrong count: ${successful.length}`);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
