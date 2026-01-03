// Production oracle test - full dispute resolution flow on Solana devnet

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as nacl from 'tweetnacl';

const PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const RPC_URL = 'https://api.devnet.solana.com';

// Load IDL
const idlPath = './packages/mitama-sdk/types/mitama_escrow.json';
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

// Deterministic oracle keypair
const ORACLE_SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) {
    ORACLE_SEED[i] = i + 100;
}
const oracleKeypair = Keypair.fromSeed(ORACLE_SEED);

async function main() {
    console.log('Production Oracle Test\n');

    const connection = new Connection(RPC_URL, 'confirmed');
    let agentKeypair: Keypair;
    const keypairPath = './test-agent-keypair.json';

    if (fs.existsSync(keypairPath)) {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        agentKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        console.log('Loaded existing agent keypair');
    } else {
        agentKeypair = Keypair.generate();
        fs.writeFileSync(keypairPath, JSON.stringify(Array.from(agentKeypair.secretKey)));
        console.log('Generated new agent keypair');
    }

    console.log(`Agent: ${agentKeypair.publicKey.toString()}`);
    console.log(`Oracle: ${oracleKeypair.publicKey.toString()}\n`);

    // Check balances
    const agentBalance = await connection.getBalance(agentKeypair.publicKey);
    console.log(`Agent balance: ${agentBalance / LAMPORTS_PER_SOL} SOL`);

    if (agentBalance < 0.1 * LAMPORTS_PER_SOL) {
        console.log('\nLow balance! Requesting airdrop...');
        try {
            const airdropSig = await connection.requestAirdrop(
                agentKeypair.publicKey,
                1 * LAMPORTS_PER_SOL
            );
            await connection.confirmTransaction(airdropSig);
            console.log('Airdrop successful');
        } catch (e) {
            console.error('Airdrop failed:', e.message);
            console.log('Please manually fund the agent wallet with devnet SOL');
            return;
        }
    }

    // Setup Anchor
    const wallet = new anchor.Wallet(agentKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: 'confirmed'
    });
    const program = new anchor.Program(idl, PROGRAM_ID, provider);

    console.log('\nRunning Production Test Flow\n');

    // Step 1: Initialize reputation accounts
    console.log('Initializing reputation accounts...');

    try {
        await initReputation(program, agentKeypair.publicKey, agentKeypair);
        console.log('  Agent reputation initialized');
    } catch (e) {
        console.log('  Agent reputation exists or error:', e.message);
    }

    try {
        await initReputation(program, oracleKeypair.publicKey, agentKeypair);
        console.log('  API reputation initialized');
    } catch (e) {
        console.log('  API reputation exists or error:', e.message);
    }

    // Step 2: Create escrow
    const transactionId = `test_${Date.now()}`;
    const amount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);
    const timeLock = new anchor.BN(86400); // 24 hours

    console.log('\nCreating escrow...');
    console.log(`  Transaction ID: ${transactionId}`);
    console.log(`  Amount: 0.01 SOL`);

    try {
        const escrowSig = await createEscrow(
            program,
            agentKeypair,
            oracleKeypair.publicKey,
            amount,
            timeLock,
            transactionId
        );
        console.log(`  Escrow created: ${escrowSig}`);
        console.log(`  https://explorer.solana.com/tx/${escrowSig}?cluster=devnet`);
    } catch (e) {
        console.error('  Failed to create escrow:', e);
        return;
    }

    // Step 3: Generate oracle assessment
    console.log('\nGenerating oracle assessment...');

    const qualityScore = 65 + Math.floor(Math.random() * 15);
    const refundPercentage = qualityScore < 50 ? 100 : qualityScore < 80 ? Math.round((80 - qualityScore) / 80 * 100) : 0;

    const message = `${transactionId}:${qualityScore}`;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, oracleKeypair.secretKey);

    console.log(`  Quality Score: ${qualityScore}/100`);
    console.log(`  Refund: ${refundPercentage}%`);

    // Step 4: Resolve dispute
    console.log('\nResolving dispute on-chain...');

    try {
        const resolveSig = await resolveDispute(
            program,
            agentKeypair,
            oracleKeypair.publicKey,
            transactionId,
            qualityScore,
            refundPercentage,
            Array.from(signature)
        );
        console.log(`  Dispute resolved: ${resolveSig}`);
        console.log(`  https://explorer.solana.com/tx/${resolveSig}?cluster=devnet`);

        const refundAmount = (0.01 * refundPercentage / 100).toFixed(4);
        console.log(`\nSuccess! Agent received ${refundAmount} SOL refund`);
    } catch (e) {
        console.error('  Failed to resolve dispute:', e);
        if (e.logs) {
            console.log('\nProgram logs:');
            e.logs.forEach(log => console.log('  ', log));
        }
        return;
    }

    console.log('\nProduction test completed successfully!\n');
}

async function initReputation(
    program: anchor.Program,
    entity: PublicKey,
    payer: Keypair
): Promise<string> {
    const [reputationPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), entity.toBuffer()],
        program.programId
    );

    return await program.methods
        .initReputation()
        .accounts({
            reputation: reputationPda,
            entity: entity,
            payer: payer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
}

async function createEscrow(
    program: anchor.Program,
    agent: Keypair,
    api: PublicKey,
    amount: anchor.BN,
    timeLock: anchor.BN,
    transactionId: string
): Promise<string> {
    const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(transactionId)],
        program.programId
    );

    return await program.methods
        .initializeEscrow(amount, timeLock, transactionId)
        .accounts({
            escrow: escrowPda,
            agent: agent.publicKey,
            api: api,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();
}

async function resolveDispute(
    program: anchor.Program,
    agent: Keypair,
    verifier: PublicKey,
    transactionId: string,
    qualityScore: number,
    refundPercentage: number,
    signature: number[]
): Promise<string> {
    const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), Buffer.from(transactionId)],
        program.programId
    );

    // Fetch escrow to get agent and API addresses
    const escrowAccount = await program.account.escrow.fetch(escrowPda);

    const [agentReputation] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), escrowAccount.agent.toBuffer()],
        program.programId
    );

    const [apiReputation] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), escrowAccount.api.toBuffer()],
        program.programId
    );

    // Create Ed25519 verification instruction
    const message = `${transactionId}:${qualityScore}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(signature);
    const publicKeyBytes = verifier.toBytes();

    const ed25519Ix = createEd25519Instruction(signatureBytes, publicKeyBytes, messageBytes);

    // Build transaction with Ed25519 ix first
    const tx = await program.methods
        .resolveDispute(qualityScore, refundPercentage, signature)
        .accounts({
            escrow: escrowPda,
            agent: escrowAccount.agent,
            api: escrowAccount.api,
            verifier: verifier,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            agentReputation: agentReputation,
            apiReputation: apiReputation,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .preInstructions([ed25519Ix])
        .rpc();

    return tx;
}

function createEd25519Instruction(signature: Uint8Array, publicKey: Uint8Array, message: Uint8Array) {
    const dataLayout = new Uint8Array(1 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 64 + 32 + message.length);
    let offset = 0;

    dataLayout[offset] = 1; offset += 1; // num_signatures
    dataLayout[offset] = 0; offset += 1; // padding

    const sigOffset = 16;
    dataLayout[offset] = sigOffset & 0xFF; dataLayout[offset + 1] = (sigOffset >> 8) & 0xFF; offset += 2;
    dataLayout[offset] = 0xFF; dataLayout[offset + 1] = 0xFF; offset += 2;

    const pubkeyOffset = sigOffset + 64;
    dataLayout[offset] = pubkeyOffset & 0xFF; dataLayout[offset + 1] = (pubkeyOffset >> 8) & 0xFF; offset += 2;
    dataLayout[offset] = 0xFF; dataLayout[offset + 1] = 0xFF; offset += 2;

    const messageOffset = pubkeyOffset + 32;
    dataLayout[offset] = messageOffset & 0xFF; dataLayout[offset + 1] = (messageOffset >> 8) & 0xFF; offset += 2;
    dataLayout[offset] = message.length & 0xFF; dataLayout[offset + 1] = (message.length >> 8) & 0xFF; offset += 2;
    dataLayout[offset] = 0xFF; dataLayout[offset + 1] = 0xFF; offset += 2;

    dataLayout.set(signature, sigOffset);
    dataLayout.set(publicKey, pubkeyOffset);
    dataLayout.set(message, messageOffset);

    return new anchor.web3.TransactionInstruction({
        keys: [],
        programId: anchor.web3.Ed25519Program.programId,
        data: Buffer.from(dataLayout)
    });
}

main().catch(console.error);
