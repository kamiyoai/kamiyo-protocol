/**
 * Parallel execution with concurrency limits and partial failure handling.
 */

export interface BatchConfig {
  maxBatchSize: number;
  maxConcurrency: number;
  batchDelayMs: number;
  continueOnError: boolean;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchSize: 100,
  maxConcurrency: 10,
  batchDelayMs: 50,
  continueOnError: true,
};

export interface BatchResult<T, R> {
  successful: Array<{ input: T; result: R }>;
  failed: Array<{ input: T; error: Error }>;
  totalMs: number;
}

export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  config: Partial<BatchConfig> = {}
): Promise<BatchResult<T, R>> {
  const cfg = { ...DEFAULT_BATCH_CONFIG, ...config };
  const startTime = Date.now();

  const successful: Array<{ input: T; result: R }> = [];
  const failed: Array<{ input: T; error: Error }> = [];

  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      try {
        const result = await fn(item);
        successful.push({ input: item, result });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        failed.push({ input: item, error });

        if (!cfg.continueOnError) {
          throw error;
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(cfg.maxConcurrency, items.length) }, () => worker());

  try {
    await Promise.all(workers);
  } catch {
    // If continueOnError is false and an error occurred
  }

  return {
    successful,
    failed,
    totalMs: Date.now() - startTime,
  };
}

// Request batcher - accumulates requests and executes in batches
export class RequestBatcher<T, R> {
  private queue: Array<{
    item: T;
    resolve: (result: R) => void;
    reject: (error: Error) => void;
  }> = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private config: BatchConfig;
  private executor: (items: T[]) => Promise<R[]>;

  constructor(
    executor: (items: T[]) => Promise<R[]>,
    config: Partial<BatchConfig> = {}
  ) {
    this.executor = executor;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });

      if (this.queue.length >= this.config.maxBatchSize) {
        this.flush();
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.config.batchDelayMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.config.maxBatchSize);
    const items = batch.map((b) => b.item);

    try {
      const results = await this.executor(items);

      for (let i = 0; i < batch.length; i++) {
        if (i < results.length) {
          batch[i].resolve(results[i]);
        } else {
          batch[i].reject(new Error('No result returned for batch item'));
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const { reject } of batch) {
        reject(error);
      }
    }

    // Continue flushing if there are more items
    if (this.queue.length > 0) {
      this.flush();
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}

// Chunk array into batches
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Process in sequential batches
export async function sequentialBatch<T, R>(
  items: T[],
  fn: (batch: T[]) => Promise<R[]>,
  batchSize: number,
  delayMs: number = 0
): Promise<R[]> {
  const chunks = chunk(items, batchSize);
  const results: R[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const batchResults = await fn(chunks[i]);
    results.push(...batchResults);

    if (delayMs > 0 && i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// Batch with progress callback
export async function batchWithProgress<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  config: Partial<BatchConfig> & {
    onProgress?: (completed: number, total: number, latestResult?: R) => void;
  } = {}
): Promise<BatchResult<T, R>> {
  const cfg = { ...DEFAULT_BATCH_CONFIG, ...config };
  const startTime = Date.now();

  const successful: Array<{ input: T; result: R }> = [];
  const failed: Array<{ input: T; error: Error }> = [];
  let completed = 0;
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      try {
        const result = await fn(item);
        successful.push({ input: item, result });
        completed++;
        config.onProgress?.(completed, items.length, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        failed.push({ input: item, error });
        completed++;
        config.onProgress?.(completed, items.length);

        if (!cfg.continueOnError) {
          throw error;
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(cfg.maxConcurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return {
    successful,
    failed,
    totalMs: Date.now() - startTime,
  };
}

// Aggregate results with reduce
export async function batchReduce<T, R, A>(
  items: T[],
  fn: (item: T) => Promise<R>,
  reducer: (acc: A, result: R, item: T) => A,
  initialValue: A,
  config: Partial<BatchConfig> = {}
): Promise<A> {
  const results = await batchExecute(items, fn, config);

  return results.successful.reduce(
    (acc, { input, result }) => reducer(acc, result, input),
    initialValue
  );
}

// Pipeline operations
type PipelineOp = (items: unknown[]) => Promise<unknown[]>;

export class BatchPipeline<T> {
  private operations: PipelineOp[] = [];

  map<R>(fn: (item: T) => Promise<R>): BatchPipeline<R> {
    this.operations.push(async (items) => {
      return parallelMap(items as T[], fn);
    });
    return this as unknown as BatchPipeline<R>;
  }

  filter(predicate: (item: T) => boolean | Promise<boolean>): BatchPipeline<T> {
    this.operations.push(async (items) => {
      const results = await Promise.all(
        (items as T[]).map(async (item) => ({
          item,
          keep: await predicate(item),
        }))
      );
      return results.filter((r) => r.keep).map((r) => r.item);
    });
    return this;
  }

  tap(fn: (items: T[]) => void | Promise<void>): BatchPipeline<T> {
    this.operations.push(async (items) => {
      await fn(items as T[]);
      return items;
    });
    return this;
  }

  async execute(items: T[]): Promise<T[]> {
    let current: unknown[] = items;
    for (const op of this.operations) {
      current = await op(current);
    }
    return current as T[];
  }
}

export function pipeline<T>(): BatchPipeline<T> {
  return new BatchPipeline<T>();
}
