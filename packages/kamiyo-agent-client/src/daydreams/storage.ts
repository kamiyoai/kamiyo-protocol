/**
 * Persistence Layer for Daydreams
 *
 * Pluggable storage backends for persisting agent state.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider } from './types';

export class MemoryStorage implements StorageProvider {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = Array.from(this.store.keys());
    return prefix ? all.filter((k) => k.startsWith(prefix)) : all;
  }
}

export class FileStorage implements StorageProvider {
  private basePath: string;
  private cache = new Map<string, unknown>();
  private dirty = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  private getFilePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.basePath, `${safe}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const filePath = this.getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const value = JSON.parse(data) as T;
      this.cache.set(key, value);
      return value;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    this.dirty.add(key);
    this.scheduleFlush();
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.dirty.delete(key);
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const keys = files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    } catch {
      return [];
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(console.error);
    }, 1000);
  }

  async flush(): Promise<void> {
    const toFlush = Array.from(this.dirty);
    this.dirty.clear();

    await Promise.all(
      toFlush.map(async (key) => {
        const value = this.cache.get(key);
        if (value !== undefined) {
          const filePath = this.getFilePath(key);
          await fs.writeFile(filePath, JSON.stringify(value, null, 2));
        }
      })
    );
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export function createMemoryStorage(): StorageProvider {
  return new MemoryStorage();
}

export async function createFileStorage(basePath: string): Promise<StorageProvider> {
  const storage = new FileStorage(basePath);
  await storage.init();
  return storage;
}
