#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } = require('@solana/web3.js');
const BN = require('bn.js');
const { KamiyoClient, AgentType } = require('../dist');

const DEFAULT_RPC = 'https://api.devnet.solana.com';
const DEFAULT_PROGRAM_ID = '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';
const DEFAULT_MINIMUM_PAYER_SOL = 0.25;
const DEFAULT_WORKER_FUNDING_SOL = 0.2;
const DEFAULT_STAKE_LAMPORTS = 100_000_000;
const DEFAULT_AGREEMENT_LAMPORTS = 10_000_000;
const DEFAULT_BALANCE_BUFFER_SOL = 0.01;
const DEFAULT_RETRY_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 400;

function loadKeypairFromRaw(raw) {
  const value = raw.trim();

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
  } catch {
    // continue
  }

  try {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length >= 64) {
      return Keypair.fromSecretKey(Uint8Array.from(bytes.slice(0, 64)));
    }
  } catch {
    // continue
  }

  throw new Error('AGENT_PRIVATE_KEY must be a JSON array or base64-encoded secret key');
}

function loadKeypair(filePath) {
  const resolved = path.resolve(filePath);
  const secret = fs.readFileSync(resolved, 'utf8');
  return loadKeypairFromRaw(secret);
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

function isRateLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|too many requests|rate limit/i.test(message);
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

async function withRetry(operation, label, attempts = DEFAULT_RETRY_ATTEMPTS, delayMs = DEFAULT_RETRY_DELAY_MS) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === attempts) break;
      const backoff = delayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${message}`);
}

async function confirm(connection, signature) {
  const latest = await withRetry(() => connection.getLatestBlockhash('confirmed'), 'getLatestBlockhash');
  await withRetry(
    () =>
      connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed'
      ),
    'confirmTransaction'
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
  tx.recentBlockhash = (await withRetry(() => connection.getLatestBlockhash('confirmed'), 'getLatestBlockhash')).blockhash;
  tx.sign(payer);

  const signature = await withRetry(() => connection.sendRawTransaction(tx.serialize()), 'sendRawTransaction');
  await confirm(connection, signature);
  return signature;
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const programId = new PublicKey(process.env.KAMIYO_PROGRAM_ID || DEFAULT_PROGRAM_ID);
  const payerPath = process.env.AGENT_KEYPAIR_PATH || path.join(os.homedir(), '.config/solana/id.json');
  const inlinePrivateKey = process.env.AGENT_PRIVATE_KEY?.trim() || null;
  const minimumPayerSolRaw = process.env.KAMIYO_SDK_SMOKE_MIN_PAYER_SOL || `${DEFAULT_MINIMUM_PAYER_SOL}`;
  const minimumPayerSol = Number.parseFloat(minimumPayerSolRaw);
  const workerFundingSolRaw = process.env.KAMIYO_SDK_SMOKE_WORKER_FUNDING_SOL || `${DEFAULT_WORKER_FUNDING_SOL}`;
  const workerFundingSol = Number.parseFloat(workerFundingSolRaw);
  const stakeLamportsRaw = process.env.KAMIYO_SDK_SMOKE_STAKE_LAMPORTS || `${DEFAULT_STAKE_LAMPORTS}`;
  const stakeLamports = Number.parseInt(stakeLamportsRaw, 10);
  const agreementLamportsRaw = process.env.KAMIYO_SDK_SMOKE_AGREEMENT_LAMPORTS || `${DEFAULT_AGREEMENT_LAMPORTS}`;
  const agreementLamports = Number.parseInt(agreementLamportsRaw, 10);
  const balanceBufferSolRaw = process.env.KAMIYO_SDK_SMOKE_BALANCE_BUFFER_SOL || `${DEFAULT_BALANCE_BUFFER_SOL}`;
  const balanceBufferSol = Number.parseFloat(balanceBufferSolRaw);
  const failOnLowBalance = parseBoolean(process.env.KAMIYO_SDK_SMOKE_FAIL_ON_LOW_BALANCE, false);
  const retryAttempts = Number.parseInt(process.env.KAMIYO_SDK_SMOKE_RETRY_ATTEMPTS || `${DEFAULT_RETRY_ATTEMPTS}`, 10);
  const retryDelayMs = Number.parseInt(process.env.KAMIYO_SDK_SMOKE_RETRY_DELAY_MS || `${DEFAULT_RETRY_DELAY_MS}`, 10);

  if (!Number.isFinite(minimumPayerSol) || minimumPayerSol <= 0) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_MIN_PAYER_SOL value: ${minimumPayerSolRaw}`);
  }
  if (!Number.isFinite(workerFundingSol) || workerFundingSol <= 0) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_WORKER_FUNDING_SOL value: ${workerFundingSolRaw}`);
  }
  if (!Number.isInteger(stakeLamports) || stakeLamports <= 0) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_STAKE_LAMPORTS value: ${stakeLamportsRaw}`);
  }
  if (!Number.isInteger(agreementLamports) || agreementLamports <= 0) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_AGREEMENT_LAMPORTS value: ${agreementLamportsRaw}`);
  }
  if (!Number.isFinite(balanceBufferSol) || balanceBufferSol < 0) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_BALANCE_BUFFER_SOL value: ${balanceBufferSolRaw}`);
  }
  if (!Number.isInteger(retryAttempts) || retryAttempts < 1) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_RETRY_ATTEMPTS value: ${process.env.KAMIYO_SDK_SMOKE_RETRY_ATTEMPTS}`);
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 50) {
    throw new Error(`Invalid KAMIYO_SDK_SMOKE_RETRY_DELAY_MS value: ${process.env.KAMIYO_SDK_SMOKE_RETRY_DELAY_MS}`);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const call = (fn, label) => withRetry(fn, label, retryAttempts, retryDelayMs);
  const payer = inlinePrivateKey
    ? loadKeypairFromRaw(inlinePrivateKey)
    : (() => {
        if (!fs.existsSync(payerPath)) {
          throw new Error(
            `Missing keypair at ${payerPath}. Set AGENT_KEYPAIR_PATH or AGENT_PRIVATE_KEY to a funded devnet keypair.`
          );
        }
        return loadKeypair(payerPath);
      })();
  const payerBalance = await call(() => connection.getBalance(payer.publicKey, 'confirmed'), 'getBalance');
  const minimumLamports = Math.ceil(minimumPayerSol * LAMPORTS_PER_SOL);
  const workerFundingLamports = Math.ceil(workerFundingSol * LAMPORTS_PER_SOL);
  const balanceBufferLamports = Math.ceil(balanceBufferSol * LAMPORTS_PER_SOL);
  const requiredLamports = Math.max(minimumLamports, workerFundingLamports + stakeLamports + balanceBufferLamports);

  if (payerBalance < requiredLamports) {
    const reason = `Payer balance too low for full SDK smoke: ${payerBalance / LAMPORTS_PER_SOL} SOL (required ${requiredLamports / LAMPORTS_PER_SOL} SOL).`;
    if (failOnLowBalance) {
      throw new Error(reason);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason,
          payer: payer.publicKey.toBase58(),
          minPayerSol: minimumPayerSol,
          workerFundingSol,
          stakeLamports,
          agreementLamports,
        },
        null,
        2
      )
    );
    return;
  }

  const worker = Keypair.generate();
  const workerFundingSig = await fundWorker(connection, payer, worker, workerFundingLamports);
  const workerWallet = createWallet(worker);
  const client = new KamiyoClient({ connection, wallet: workerWallet, programId });

  const agentName = nextId('smoke').slice(0, 28);
  const createAgentSig = await call(
    () =>
      client.createAgent({
        name: agentName,
        agentType: AgentType.Service,
        stakeAmount: new BN(stakeLamports),
      }),
    'createAgent'
  );
  const initReputationSig = await call(() => client.initReputation(worker.publicKey), 'initReputation');

  const [agentPda] = client.getAgentPDA(worker.publicKey);
  const agent = await call(() => client.getAgent(agentPda), 'getAgent');
  if (!agent) {
    throw new Error('Agent was not readable after createAgent.');
  }

  const provider = Keypair.generate().publicKey;
  const transactionId = nextId('esc').slice(0, 30);
  const createAgreementSig = await call(
    () =>
      client.createAgreement({
        provider,
        amount: new BN(agreementLamports),
        timeLockSeconds: new BN(3600),
        transactionId,
      }),
    'createAgreement'
  );

  const [agreementPda] = client.getAgreementPDA(worker.publicKey, transactionId);
  const agreement = await call(() => client.getAgreement(agreementPda), 'getAgreement');
  if (!agreement) {
    throw new Error('Agreement was not readable after createAgreement.');
  }

  const markDisputedSig = await call(() => client.markDisputed(transactionId), 'markDisputed');
  const disputed = await call(() => client.getAgreement(agreementPda), 'getAgreement(disputed)');

  const output = {
    ok: true,
    rpcUrl,
    programId: programId.toBase58(),
    signerSource: inlinePrivateKey ? 'AGENT_PRIVATE_KEY' : 'AGENT_KEYPAIR_PATH',
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
