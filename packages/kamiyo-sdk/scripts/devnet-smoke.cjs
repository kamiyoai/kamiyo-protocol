#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } = require('@solana/web3.js');
const BN = require('bn.js');
const { KamiyoClient, AgentType } = require('../dist');

const DEFAULT_RPC = 'https://api.devnet.solana.com';
const DEFAULT_PROGRAM_ID = '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';

function loadKeypair(filePath) {
  const resolved = path.resolve(filePath);
  const secret = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function createWallet(keypair) {
  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: async (tx) => {
      if (typeof tx.partialSign === 'function') {
        tx.partialSign(keypair);
      } else if (typeof tx.sign === 'function') {
        tx.sign(keypair);
      }
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        if (typeof tx.partialSign === 'function') {
          tx.partialSign(keypair);
        } else if (typeof tx.sign === 'function') {
          tx.sign(keypair);
        }
      }
      return txs;
    },
  };
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function confirm(connection, signature) {
  const latest = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed'
  );
}

async function fundWorker(connection, payer, worker, lamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: worker.publicKey,
      lamports,
    })
  );

  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(payer);

  const signature = await connection.sendRawTransaction(tx.serialize());
  await confirm(connection, signature);
  return signature;
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const programId = new PublicKey(process.env.KAMIYO_PROGRAM_ID || DEFAULT_PROGRAM_ID);
  const payerPath = process.env.AGENT_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');

  if (!fs.existsSync(payerPath)) {
    throw new Error(`Missing keypair at ${payerPath}. Set AGENT_KEYPAIR_PATH to a funded devnet keypair.`);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const payer = loadKeypair(payerPath);
  const payerBalance = await connection.getBalance(payer.publicKey, 'confirmed');

  if (payerBalance < 0.3 * LAMPORTS_PER_SOL) {
    throw new Error(`Payer balance too low: ${payerBalance / LAMPORTS_PER_SOL} SOL (min 0.3 SOL).`);
  }

  const worker = Keypair.generate();
  const workerFundingSig = await fundWorker(connection, payer, worker, 0.2 * LAMPORTS_PER_SOL);
  const workerWallet = createWallet(worker);
  const client = new KamiyoClient({ connection, wallet: workerWallet, programId });

  const agentName = nextId('smoke').slice(0, 28);
  const createAgentSig = await client.createAgent({
    name: agentName,
    agentType: AgentType.Service,
    stakeAmount: new BN(100_000_000),
  });
  const initReputationSig = await client.initReputation(worker.publicKey);

  const [agentPda] = client.getAgentPDA(worker.publicKey);
  const agent = await client.getAgent(agentPda);
  if (!agent) {
    throw new Error('Agent was not readable after createAgent.');
  }

  const provider = Keypair.generate().publicKey;
  const transactionId = nextId('esc').slice(0, 30);
  const createAgreementSig = await client.createAgreement({
    provider,
    amount: new BN(10_000_000),
    timeLockSeconds: new BN(3600),
    transactionId,
  });

  const [agreementPda] = client.getAgreementPDA(worker.publicKey, transactionId);
  const agreement = await client.getAgreement(agreementPda);
  if (!agreement) {
    throw new Error('Agreement was not readable after createAgreement.');
  }

  const markDisputedSig = await client.markDisputed(transactionId);
  const disputed = await client.getAgreement(agreementPda);

  const output = {
    ok: true,
    rpcUrl,
    programId: programId.toBase58(),
    payer: payer.publicKey.toBase58(),
    worker: worker.publicKey.toBase58(),
    fundingSignature: workerFundingSig,
    createAgentSignature: createAgentSig,
    initReputationSignature: initReputationSig,
    createAgreementSignature: createAgreementSig,
    markDisputedSignature: markDisputedSig,
    agentPda: agentPda.toBase58(),
    agreementPda: agreementPda.toBase58(),
    agreementStatus: disputed?.status ?? agreement.status,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});
