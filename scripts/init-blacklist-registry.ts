import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function main() {
  const keyPath = process.env.SOLANA_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  const keypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf-8')))
  );

  console.log('Authority:', keypair.publicKey.toBase58());

  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('blacklist_registry')],
    PROGRAM_ID
  );
  console.log('Registry PDA:', registryPda.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  const idl = JSON.parse(fs.readFileSync('./target/idl/kamiyo.json', 'utf-8'));
  const program = new Program(idl, provider);

  const existing = await connection.getAccountInfo(registryPda);
  if (existing) {
    console.log('Registry already initialized');
    const root = Buffer.from(existing.data.slice(8 + 32, 8 + 32 + 32)).toString('hex');
    console.log('Root:', root);
    return;
  }

  console.log('Initializing blacklist registry...');

  const tx = await program.methods
    .initializeBlacklistRegistry()
    .accounts({
      registry: registryPda,
      authority: keypair.publicKey,
      systemProgram: new PublicKey('11111111111111111111111111111111'),
    })
    .signers([keypair])
    .rpc();

  console.log('Signature:', tx);
  console.log('Done. Set BLACKLIST_REGISTRY_PDA=' + registryPda.toBase58());
}

main().catch(console.error);
