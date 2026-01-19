/**
 * Test KAMIYO Staking on Mainnet
 */

import { config } from 'dotenv';
config({ path: '.env' });

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import BN from 'bn.js';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const STAKING_PROGRAM_ID = new PublicKey('9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

// Anchor discriminators
const STAKE_DISCRIMINATOR = Buffer.from([206, 176, 202, 18, 200, 209, 179, 108]); // sha256("global:stake")[0:8]

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    process.exit(1);
  }

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('=== KAMIYO Staking Mainnet Test ===\n');
  console.log('User:', keypair.publicKey.toBase58());

  const connection = new Connection(rpcUrl, 'confirmed');

  // Derive PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync([Buffer.from('pool')], STAKING_PROGRAM_ID);
  const [tokenVault] = PublicKey.findProgramAddressSync([Buffer.from('vault')], STAKING_PROGRAM_ID);
  const [rewardsVault] = PublicKey.findProgramAddressSync([Buffer.from('rewards')], STAKING_PROGRAM_ID);
  const [positionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), keypair.publicKey.toBuffer()],
    STAKING_PROGRAM_ID
  );

  console.log('\nPDAs:');
  console.log('  Pool:', poolPDA.toBase58());
  console.log('  Token Vault:', tokenVault.toBase58());
  console.log('  Rewards Vault:', rewardsVault.toBase58());
  console.log('  Position:', positionPDA.toBase58());

  // Check pool state
  const poolInfo = await connection.getAccountInfo(poolPDA);
  if (!poolInfo) {
    console.error('\nPool not initialized!');
    process.exit(1);
  }

  console.log('\nPool State:');
  const poolData = poolInfo.data;
  let offset = 8; // discriminator

  const admin = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const tokenMint = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolTokenVault = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const poolRewardsVault = new PublicKey(poolData.slice(offset, offset + 32));
  offset += 32;
  const totalStaked = new BN(poolData.slice(offset, offset + 8), 'le');
  offset += 8;
  const totalWeightedStake = new BN(poolData.slice(offset, offset + 8), 'le');
  offset += 8;

  console.log('  Admin:', admin.toBase58());
  console.log('  Token Mint:', tokenMint.toBase58());
  console.log('  Total Staked:', totalStaked.div(new BN(1_000_000)).toString(), 'KAMIYO');
  console.log('  Total Weighted Stake:', totalWeightedStake.div(new BN(1_000_000)).toString());

  // Check user token balance
  const userTokenAccount = getAssociatedTokenAddressSync(
    KAMIYO_MINT,
    keypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
  if (!tokenAccountInfo) {
    console.error('\nUser has no KAMIYO token account');
    process.exit(1);
  }

  // Parse token balance (Token-2022 account layout)
  const tokenData = tokenAccountInfo.data;
  const balance = new BN(tokenData.slice(64, 72), 'le');
  console.log('\nUser KAMIYO Balance:', balance.div(new BN(1_000_000)).toString(), 'KAMIYO');

  // Check if user already has a position
  const positionInfo = await connection.getAccountInfo(positionPDA);
  if (positionInfo) {
    console.log('\nExisting Position Found:');
    const posData = positionInfo.data;
    let pOffset = 8;
    const owner = new PublicKey(posData.slice(pOffset, pOffset + 32));
    pOffset += 32;
    const stakedAmount = new BN(posData.slice(pOffset, pOffset + 8), 'le');
    pOffset += 8;
    const stakeStartTime = new BN(posData.slice(pOffset, pOffset + 8), 'le');
    pOffset += 8;
    const lastClaimTime = new BN(posData.slice(pOffset, pOffset + 8), 'le');

    console.log('  Owner:', owner.toBase58());
    console.log('  Staked Amount:', stakedAmount.div(new BN(1_000_000)).toString(), 'KAMIYO');
    console.log('  Stake Start:', new Date(stakeStartTime.toNumber() * 1000).toISOString());
    console.log('  Last Claim:', new Date(lastClaimTime.toNumber() * 1000).toISOString());
  } else {
    console.log('\nNo existing position');
  }

  // Stake 1,000,000 KAMIYO (minimum required by program)
  const stakeAmount = new BN(1_000_000).mul(new BN(1_000_000)); // 1,000,000 KAMIYO
  console.log('\n--- Staking', stakeAmount.div(new BN(1_000_000)).toString(), 'KAMIYO ---');

  if (balance.lt(stakeAmount)) {
    console.error('Insufficient balance to stake');
    process.exit(1);
  }

  // Build stake instruction
  const stakeData = Buffer.concat([
    STAKE_DISCRIMINATOR,
    stakeAmount.toArrayLike(Buffer, 'le', 8),
  ]);

  const stakeInstruction = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: positionPDA, isSigner: false, isWritable: true },
      { pubkey: tokenVault, isSigner: false, isWritable: true },
      { pubkey: rewardsVault, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: stakeData,
  });

  const transaction = new Transaction();
  transaction.add(stakeInstruction);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = keypair.publicKey;
  transaction.sign(keypair);

  try {
    const txSig = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    console.log('Tx sent:', txSig);

    await connection.confirmTransaction(txSig, 'confirmed');
    console.log('\nSUCCESS! Staked', stakeAmount.div(new BN(1_000_000)).toString(), 'KAMIYO');
    console.log('Explorer: https://solscan.io/tx/' + txSig);

    // Verify position
    const newPositionInfo = await connection.getAccountInfo(positionPDA);
    if (newPositionInfo) {
      const posData = newPositionInfo.data;
      let pOffset = 8 + 32;
      const stakedAmount = new BN(posData.slice(pOffset, pOffset + 8), 'le');
      console.log('\nNew staked amount:', stakedAmount.div(new BN(1_000_000)).toString(), 'KAMIYO');
    }
  } catch (err: any) {
    console.error('\nFAILED:', err.message || err);
    if (err.logs) {
      console.log('\nProgram logs:');
      for (const log of err.logs) {
        console.log(' ', log);
      }
    }
  }
}

main().catch(console.error);
