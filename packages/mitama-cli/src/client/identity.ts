import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateRandomBytes, bytesToHex, hexToBytes, bytesToBigint } from './crypto.js';

const MITAMA_DIR = path.join(os.homedir(), '.mitama');
const IDENTITY_FILE = path.join(MITAMA_DIR, 'identity.json');
const SIGNALS_FILE = path.join(MITAMA_DIR, 'signals.json');

export interface MitamaIdentity {
  ownerSecret: string; // hex
  registrationSecret: string; // hex
  agentId: string; // hex (derived from secrets)
  commitment: string; // hex
  pda: string;
  network: string;
  createdAt: string;
}

export interface StoredSignal {
  id: string;
  secret: string; // hex
  agentNullifier: string; // hex
  signalCommitment: string; // hex
  signalType: number;
  direction: number;
  confidence: number;
  magnitude: number;
  stakeAmount: string;
  createdAt: string;
  revealed: boolean;
}

interface SignalsStore {
  signals: StoredSignal[];
}

function ensureMitamaDir(): void {
  if (!fs.existsSync(MITAMA_DIR)) {
    fs.mkdirSync(MITAMA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadIdentity(network: string): MitamaIdentity | null {
  try {
    if (!fs.existsSync(IDENTITY_FILE)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
    if (data.network !== network) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: MitamaIdentity): void {
  ensureMitamaDir();
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
}

export function deleteIdentity(): void {
  if (fs.existsSync(IDENTITY_FILE)) {
    fs.unlinkSync(IDENTITY_FILE);
  }
}

export function createNewIdentity(
  commitment: Uint8Array,
  pda: string,
  network: string
): MitamaIdentity {
  const ownerSecret = generateRandomBytes(32);
  const registrationSecret = generateRandomBytes(32);

  // Agent ID is derived from ownerSecret + registrationSecret
  const agentIdBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    agentIdBytes[i] = ownerSecret[i] ^ registrationSecret[i];
  }

  const identity: MitamaIdentity = {
    ownerSecret: bytesToHex(ownerSecret),
    registrationSecret: bytesToHex(registrationSecret),
    agentId: bytesToHex(agentIdBytes),
    commitment: bytesToHex(commitment),
    pda,
    network,
    createdAt: new Date().toISOString(),
  };

  saveIdentity(identity);
  return identity;
}

export function getIdentitySecrets(identity: MitamaIdentity): {
  ownerSecret: bigint;
  registrationSecret: bigint;
  agentId: bigint;
} {
  return {
    ownerSecret: bytesToBigint(hexToBytes(identity.ownerSecret)),
    registrationSecret: bytesToBigint(hexToBytes(identity.registrationSecret)),
    agentId: bytesToBigint(hexToBytes(identity.agentId)),
  };
}

// Signal storage
function loadSignalsStore(): SignalsStore {
  try {
    if (!fs.existsSync(SIGNALS_FILE)) {
      return { signals: [] };
    }
    return JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf-8'));
  } catch {
    return { signals: [] };
  }
}

function saveSignalsStore(store: SignalsStore): void {
  ensureMitamaDir();
  fs.writeFileSync(SIGNALS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function storeSignal(signal: Omit<StoredSignal, 'id' | 'createdAt' | 'revealed'>): StoredSignal {
  const store = loadSignalsStore();
  const storedSignal: StoredSignal = {
    ...signal,
    id: bytesToHex(generateRandomBytes(16)),
    createdAt: new Date().toISOString(),
    revealed: false,
  };
  store.signals.push(storedSignal);
  saveSignalsStore(store);
  return storedSignal;
}

export function getUnrevealedSignals(): StoredSignal[] {
  const store = loadSignalsStore();
  return store.signals.filter((s) => !s.revealed);
}

export function getSignalById(id: string): StoredSignal | null {
  const store = loadSignalsStore();
  return store.signals.find((s) => s.id === id) || null;
}

export function getSignalByCommitment(commitment: string): StoredSignal | null {
  const store = loadSignalsStore();
  return store.signals.find((s) => s.signalCommitment === commitment) || null;
}

export function markSignalRevealed(id: string): void {
  const store = loadSignalsStore();
  const signal = store.signals.find((s) => s.id === id);
  if (signal) {
    signal.revealed = true;
    saveSignalsStore(store);
  }
}

export function getSignalSecrets(signal: StoredSignal): {
  secret: bigint;
  agentNullifier: bigint;
} {
  return {
    secret: bytesToBigint(hexToBytes(signal.secret)),
    agentNullifier: bytesToBigint(hexToBytes(signal.agentNullifier)),
  };
}
