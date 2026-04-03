import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const ROOT_DIR = path.join(DATA_DIR, 'reality-fork');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extensionFor(params: { mimeType?: string | null; fileName?: string | null }): string {
  const byName = params.fileName ? path.extname(params.fileName) : '';
  if (byName) return byName.toLowerCase();

  switch (params.mimeType) {
    case 'application/json':
      return '.json';
    case 'text/markdown':
      return '.md';
    case 'text/plain':
      return '.txt';
    default:
      return '';
  }
}

export type StoredBlob = {
  id: string;
  sha256: string;
  storageKey: string;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number;
};

export class FileSystemBlobStore {
  constructor(private readonly rootDir = ROOT_DIR) {
    ensureDir(this.rootDir);
    ensureDir(path.join(this.rootDir, 'blobs'));
  }

  put(input: { data: Buffer; mimeType?: string | null; fileName?: string | null }): StoredBlob {
    const sha256 = createHash('sha256').update(input.data).digest('hex');
    const ext = extensionFor(input);
    const storageKey = path.join('blobs', sha256.slice(0, 2), `${sha256}${ext}`);
    const fullPath = path.join(this.rootDir, storageKey);
    ensureDir(path.dirname(fullPath));

    if (!fs.existsSync(fullPath)) {
      const tempPath = `${fullPath}.${randomUUID()}.tmp`;
      fs.writeFileSync(tempPath, input.data);
      fs.renameSync(tempPath, fullPath);
    }

    return {
      id: `rf_blob_${sha256.slice(0, 16)}`,
      sha256,
      storageKey,
      mimeType: input.mimeType ?? null,
      fileName: input.fileName ?? null,
      sizeBytes: input.data.byteLength,
    };
  }

  read(storageKey: string): Buffer {
    return fs.readFileSync(path.join(this.rootDir, storageKey));
  }

  readText(storageKey: string): string {
    return this.read(storageKey).toString('utf8');
  }

  delete(storageKey: string): void {
    const fullPath = path.join(this.rootDir, storageKey);
    fs.rmSync(fullPath, { force: true });
  }
}

export const realityForkBlobStore = new FileSystemBlobStore();
