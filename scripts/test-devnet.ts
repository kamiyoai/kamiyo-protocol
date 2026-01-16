const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, SystemProgram, Connection } = require('@solana/web3.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROGRAM_ID = new PublicKey('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26');

async function main() {
  // Load wallet
  const walletPath = path.join(os.homedir(), '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: 'confirmed' }
  );

  // Load IDL
  const idl = require('../target/idl/mitama.json');
  const program = new anchor.Program(idl, provider);

  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Program ID:', PROGRAM_ID.toBase58());

  // Derive registry PDA
  const [registryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('registry')],
    PROGRAM_ID
  );
  console.log('Registry PDA:', registryPDA.toBase58());

  // Check if registry exists
  try {
    const registry = await program.account.agentRegistry.fetch(registryPDA);
    console.log('\nRegistry already initialized:');
    console.log('  Authority:', registry.authority.toBase58());
    console.log('  Agent Count:', registry.agentCount);
    console.log('  Min Stake:', registry.minStake.toString(), 'lamports');
    console.log('  Min Confidence:', registry.minSignalConfidence);
    console.log('  Paused:', registry.paused);
  } catch (e) {
    console.log('\nRegistry not found, initializing...');

    const config = {
      minStake: new anchor.BN(1000000), // 0.001 SOL
      minSignalConfidence: 50,
    };

    const tx = await program.methods
      .initializeRegistry(config)
      .accounts({
        registry: registryPDA,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log('Initialize TX:', tx);

    // Fetch and display
    const registry = await program.account.agentRegistry.fetch(registryPDA);
    console.log('\nRegistry initialized:');
    console.log('  Authority:', registry.authority.toBase58());
    console.log('  Agent Count:', registry.agentCount);
    console.log('  Min Stake:', registry.minStake.toString(), 'lamports');
    console.log('  Min Confidence:', registry.minSignalConfidence);
    console.log('  Paused:', registry.paused);
  }

  console.log('\nDevnet test complete!');
}

main().catch(console.error);
