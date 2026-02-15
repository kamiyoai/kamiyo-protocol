type Release = () => void;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() ? Number.parseInt(value.trim(), 10) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

class Semaphore {
  private inUse = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('invalid semaphore capacity');
    }
  }

  get active(): number {
    return this.inUse;
  }

  async acquire(): Promise<Release> {
    if (this.inUse < this.capacity) {
      this.inUse++;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.inUse++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.inUse = Math.max(0, this.inUse - 1);
    if (this.inUse >= this.capacity) return;
    const next = this.waiters.shift();
    next?.();
  }
}

export type SwarmRuntimeConfig = {
  maxParallelPerRun: number;
  maxParallelPerTeam: number;
  maxParallelGlobal: number;
  nodeTimeoutMs: number;
  runTimeoutMs: number;
};

export const swarmRuntimeConfig: SwarmRuntimeConfig = {
  maxParallelPerRun: clampInt(process.env.SWARM_MAX_PARALLEL_RUN, 10, 1, 50),
  maxParallelPerTeam: clampInt(process.env.SWARM_MAX_PARALLEL_TEAM, 8, 1, 200),
  maxParallelGlobal: clampInt(process.env.SWARM_MAX_PARALLEL_GLOBAL, 32, 1, 2000),
  nodeTimeoutMs: clampInt(process.env.SWARM_NODE_TIMEOUT_MS, 180_000, 5_000, 10 * 60_000),
  runTimeoutMs: clampInt(process.env.SWARM_RUN_TIMEOUT_MS, 15 * 60_000, 5_000, 24 * 60 * 60_000),
};

const globalSemaphore = new Semaphore(swarmRuntimeConfig.maxParallelGlobal);
const teamSemaphores = new Map<string, Semaphore>();

function getTeamSemaphore(teamId: string): Semaphore {
  const existing = teamSemaphores.get(teamId);
  if (existing) return existing;
  const sem = new Semaphore(swarmRuntimeConfig.maxParallelPerTeam);
  teamSemaphores.set(teamId, sem);
  return sem;
}

export function clampMaxParallel(requested: number): number {
  const perRun = swarmRuntimeConfig.maxParallelPerRun;
  const n = Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1));
  return Math.min(n, perRun, swarmRuntimeConfig.maxParallelPerTeam, swarmRuntimeConfig.maxParallelGlobal);
}

export async function acquireSwarmNodeSlot(teamId: string): Promise<Release> {
  const releaseTeam = await getTeamSemaphore(teamId).acquire();
  const releaseGlobal = await globalSemaphore.acquire();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseGlobal();
    releaseTeam();
  };
}

export function getSwarmGlobalActiveNodes(): number {
  return globalSemaphore.active;
}

