import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { loadConfig } from './config.js';
import { loadKeypair } from './wallet.js';

function hashModelName(name: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(name).digest());
}

function log(message: string, ctx?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'protocol-tick-setup',
      message,
      ...ctx,
    })
  );
}

async function main() {
  const cfg = loadConfig();
  const keypair = loadKeypair(cfg);
  const connection = new Connection(cfg.SOLANA_RPC_URL, 'confirmed');

  const modelId = hashModelName(cfg.MODEL_NAME);
  const [modelPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('model'), Buffer.from(modelId)],
    new PublicKey(cfg.PROGRAM_ID)
  );

  log('checking model registration', {
    modelName: cfg.MODEL_NAME,
    modelPda: modelPda.toBase58(),
    owner: keypair.publicKey.toBase58(),
  });

  // Check if model already registered
  const existing = await connection.getAccountInfo(modelPda);
  if (existing) {
    log('model already registered', { modelPda: modelPda.toBase58(), size: existing.data.length });
    return;
  }

  if (cfg.DRY_RUN) {
    log('dry-run: would register model', { modelPda: modelPda.toBase58() });
    return;
  }

  // register_model discriminator: sha256("global:register_model")[0:8]
  const discriminator = Buffer.from([0x6f, 0xec, 0x5d, 0x1f, 0xc3, 0xd2, 0x8e, 0x7d]);
  const data = Buffer.alloc(8 + 32);
  discriminator.copy(data, 0);
  Buffer.from(modelId).copy(data, 8);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: modelPda, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: new PublicKey(cfg.PROGRAM_ID),
    data,
  });

  const tx = new Transaction().add(instruction);
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
  log('model registered', { modelPda: modelPda.toBase58(), signature });
}

main().catch(err => {
  console.error('setup failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
