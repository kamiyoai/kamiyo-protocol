// Tier definitions
export const TIERS: Record<string, { threshold: number; name: string }> = {
  platinum: { threshold: 90, name: "Platinum" },
  gold: { threshold: 75, name: "Gold" },
  silver: { threshold: 50, name: "Silver" },
  bronze: { threshold: 25, name: "Bronze" },
  none: { threshold: 0, name: "None" },
};

export function getTierForScore(score: number): string {
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 50) return "silver";
  if (score >= 25) return "bronze";
  return "none";
}

// Generate random secret
function generateSecret(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

// Simplified Poseidon hash (for demo - real implementation uses circomlibjs)
async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  // In production, use circomlibjs buildPoseidon()
  // For demo, we use a deterministic hash based on inputs
  const encoder = new TextEncoder();
  const data = encoder.encode(inputs.map(i => i.toString()).join(","));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = "0x";
  for (const b of hashArray) {
    hex += b.toString(16).padStart(2, "0");
  }
  // Reduce to field element (BN254 scalar field)
  const p = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  return BigInt(hex) % p;
}

export interface ProofResult {
  proof: {
    threshold: number;
    proofBytes: Uint8Array;
    groth16Proof?: any;
    publicSignals?: string[];
  };
  commitment: string;
  secret: bigint;
}

export async function generateProof(
  score: number,
  threshold: number
): Promise<ProofResult> {
  if (score < 0 || score > 100) {
    throw new Error("Score must be between 0 and 100");
  }
  if (score < threshold) {
    throw new Error(`Score ${score} is below threshold ${threshold}`);
  }

  const secret = generateSecret();
  const commitmentBigInt = await poseidonHash([BigInt(score), secret]);
  const commitment = "0x" + commitmentBigInt.toString(16).padStart(64, "0");

  // Simulate proof generation (real implementation uses snarkjs)
  // This takes time to simulate the ZK proof computation
  await new Promise((r) => setTimeout(r, 2000));

  // Generate mock proof bytes (256 bytes for Groth16)
  const proofBytes = new Uint8Array(256);
  crypto.getRandomValues(proofBytes);

  // In production, this would call snarkjs.groth16.fullProve()
  // with the compiled circuit and proving key

  return {
    proof: {
      threshold,
      proofBytes,
      // groth16Proof would be the actual proof from snarkjs
      // publicSignals would be [threshold.toString(), commitmentBigInt.toString()]
    },
    commitment,
    secret,
  };
}

export async function verifyProof(_proof: ProofResult["proof"]): Promise<boolean> {
  // In production, this calls snarkjs.groth16.verify()
  // For demo, we return true
  return true;
}
