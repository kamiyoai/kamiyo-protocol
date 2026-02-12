import crypto from 'crypto';

export interface MeishiZKProof {
  proof: string;
  publicInputs: string[];
  verificationKey: string;
}

export interface ComplianceProofInput {
  complianceScore: number;
  threshold: number;
  agentId: string;
  secret: string;
}

export interface SpendingProofInput {
  currentCumulative: number;
  transactionAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  mandateSecret: string;
}

export interface MandateProofInput {
  validFrom: number;
  validUntil: number;
  revoked: boolean;
  mandateSecret: string;
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getVerificationKey(): string {
  return sha256('meishi_zk_verifier_v1');
}

function ensurePlaceholderEnabled(): void {
  const allowInsecure = process.env.KAMIYO_ALLOW_INSECURE_ZK_PLACEHOLDER === 'true';
  if (!allowInsecure) {
    throw new Error(
      'Insecure ZK placeholder is disabled. Set KAMIYO_ALLOW_INSECURE_ZK_PLACEHOLDER=true only for non-production testing.'
    );
  }
}

export function proveComplianceThreshold(input: ComplianceProofInput): MeishiZKProof {
  ensurePlaceholderEnabled();
  if (input.complianceScore < input.threshold) {
    throw new Error('Score does not meet threshold — cannot generate valid proof');
  }

  const commitment = sha256(
    JSON.stringify({
      agentId: input.agentId,
      complianceScore: input.complianceScore,
      secret: input.secret,
    })
  );

  const proof = sha256(
    JSON.stringify({
      commitment,
      threshold: input.threshold,
      salt: crypto.randomBytes(16).toString('hex'),
    })
  );

  return {
    proof,
    publicInputs: [commitment, String(input.threshold)],
    verificationKey: getVerificationKey(),
  };
}

export function verifyComplianceThreshold(
  zkProof: MeishiZKProof,
  expectedThreshold: number
): boolean {
  ensurePlaceholderEnabled();
  if (zkProof.verificationKey !== getVerificationKey()) return false;
  if (zkProof.publicInputs.length !== 2) return false;
  if (!/^[a-f0-9]{64}$/.test(zkProof.publicInputs[0])) return false;
  if (parseInt(zkProof.publicInputs[1], 10) !== expectedThreshold) return false;
  return zkProof.proof.length === 64;
}

export function proveSpendingWithinLimits(input: SpendingProofInput): MeishiZKProof {
  ensurePlaceholderEnabled();
  const newTotal = input.currentCumulative + input.transactionAmount;
  if (newTotal > input.dailyLimit || newTotal > input.monthlyLimit) {
    throw new Error('Spending exceeds limits — cannot generate valid proof');
  }

  const mandateCommitment = sha256(
    JSON.stringify({
      dailyLimit: input.dailyLimit,
      monthlyLimit: input.monthlyLimit,
      secret: input.mandateSecret,
    })
  );

  const proof = sha256(
    JSON.stringify({
      mandateCommitment,
      transactionAmount: input.transactionAmount,
      salt: crypto.randomBytes(16).toString('hex'),
    })
  );

  return {
    proof,
    publicInputs: [String(input.transactionAmount), mandateCommitment],
    verificationKey: getVerificationKey(),
  };
}

export function verifySpendingWithinLimits(zkProof: MeishiZKProof): boolean {
  ensurePlaceholderEnabled();
  if (zkProof.verificationKey !== getVerificationKey()) return false;
  if (zkProof.publicInputs.length !== 2) return false;
  if (!/^[a-f0-9]{64}$/.test(zkProof.publicInputs[1])) return false;
  return zkProof.proof.length === 64;
}

export function proveMandateValidity(input: MandateProofInput): MeishiZKProof {
  ensurePlaceholderEnabled();
  const now = Math.floor(Date.now() / 1000);
  if (input.revoked || input.validFrom > now || input.validUntil <= now) {
    throw new Error('Mandate not valid — cannot generate proof');
  }

  const commitment = sha256(
    JSON.stringify({
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      secret: input.mandateSecret,
    })
  );

  const proof = sha256(
    JSON.stringify({
      commitment,
      currentTime: now,
      salt: crypto.randomBytes(16).toString('hex'),
    })
  );

  return {
    proof,
    publicInputs: [commitment],
    verificationKey: getVerificationKey(),
  };
}

export function verifyMandateValidity(zkProof: MeishiZKProof): boolean {
  ensurePlaceholderEnabled();
  if (zkProof.verificationKey !== getVerificationKey()) return false;
  if (zkProof.publicInputs.length !== 1) return false;
  if (!/^[a-f0-9]{64}$/.test(zkProof.publicInputs[0])) return false;
  return zkProof.proof.length === 64;
}

export function exportProofForSolana(zkProof: MeishiZKProof): Buffer {
  ensurePlaceholderEnabled();
  const proofBytes = Buffer.from(zkProof.proof, 'hex');
  const commitmentBytes = Buffer.from(zkProof.publicInputs[0], 'hex');
  const vkBytes = Buffer.from(zkProof.verificationKey, 'hex');

  return Buffer.concat([proofBytes, commitmentBytes, vkBytes]);
}
