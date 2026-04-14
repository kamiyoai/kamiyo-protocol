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
  private readonly storageRoot: string;
  private readonly blobsRoot: string;

  constructor(rootDir = ROOT_DIR) {
    this.storageRoot = path.resolve(rootDir);
    this.blobsRoot = path.join(this.storageRoot, 'blobs');
    ensureDir(this.storageRoot);
    ensureDir(this.blobsRoot);
  }

  private resolveStoragePath(storageKey: string): string {
    const normalizedKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    if (!normalizedKey || normalizedKey.startsWith('..') || path.isAbsolute(normalizedKey)) {
      throw new Error('invalid blob storage key');
    }

    const fullPath = path.resolve(this.storageRoot, normalizedKey);
    const rootPrefix = `${this.storageRoot}${path.sep}`;
    if (fullPath !== this.storageRoot && !fullPath.startsWith(rootPrefix)) {
      throw new Error('blob path escaped storage root');
    }
    if (fullPath !== this.blobsRoot && !fullPath.startsWith(`${this.blobsRoot}${path.sep}`)) {
      throw new Error('blob path must stay inside blobs root');
    }

    return fullPath;
  }

  private pruneEmptyParents(startPath: string): void {
    let current = path.dirname(startPath);
    while (current.startsWith(this.blobsRoot) && current !== this.blobsRoot) {
      try {
        if (fs.readdirSync(current).length > 0) break;
        fs.rmdirSync(current);
      } catch {
        break;
      }
      current = path.dirname(current);
    }
  }

  put(input: { data: Buffer; mimeType?: string | null; fileName?: string | null }): StoredBlob {
    const sha256 = createHash('sha256').update(input.data).digest('hex');
    const ext = extensionFor(input);
    const storageKey = path.join('blobs', sha256.slice(0, 2), `${sha256}${ext}`);
    const fullPath = this.resolveStoragePath(storageKey);
    ensureDir(path.dirname(fullPath));

    if (!fs.existsSync(fullPath)) {
      const tempPath = `${fullPath}.${randomUUID()}.tmp`;
      fs.writeFileSync(tempPath, input.data, { flag: 'wx', mode: 0o600 });
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
    return fs.readFileSync(this.resolveStoragePath(storageKey));
  }

  readText(storageKey: string): string {
    return this.read(storageKey).toString('utf8');
  }

  delete(storageKey: string): void {
    const fullPath = this.resolveStoragePath(storageKey);
    fs.rmSync(fullPath, { force: true });
    this.pruneEmptyParents(fullPath);
  }
}

export const realityForkBlobStore = new FileSystemBlobStore();
