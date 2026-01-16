"use strict";
/*
 * ZK Proof Generation for Agent Collaboration
 *
 * Uses circomlibjs for Poseidon hash and snarkjs for Groth16 proofs.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MitamaProver = void 0;
exports.generateRandomSalt = generateRandomSalt;
exports.generateOwnerSecret = generateOwnerSecret;
exports.generateRegistrationSecret = generateRegistrationSecret;
exports.generateAgentId = generateAgentId;
const snarkjs = __importStar(require("snarkjs"));
const circomlibjs_1 = require("circomlibjs");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
// BN254 field modulus
const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
let poseidonInstance = null;
async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await (0, circomlibjs_1.buildPoseidon)();
    }
    return poseidonInstance;
}
/**
 * Poseidon hash implementation using circomlibjs.
 * Returns field element compatible with Circom circuits.
 */
async function poseidonHash(inputs) {
    const poseidon = await getPoseidon();
    const hash = poseidon(inputs.map(i => i % FIELD_MODULUS));
    return poseidon.F.toObject(hash);
}
/**
 * Convert bigint to 32-byte big-endian array.
 */
function bigintToBytes32(n) {
    const bytes = new Uint8Array(32);
    let temp = n;
    for (let i = 31; i >= 0; i--) {
        bytes[i] = Number(temp & BigInt(0xff));
        temp = temp >> BigInt(8);
    }
    return bytes;
}
/**
 * Convert byte array to bigint.
 */
function bytesToBigint(arr) {
    let result = BigInt(0);
    for (let i = 0; i < arr.length; i++) {
        result = (result << BigInt(8)) | BigInt(arr[i]);
    }
    return result;
}
// Default circuits path (relative to package root)
const CIRCUITS_BUILD_PATH = path.resolve(__dirname, '../../../circuits/build/mitama');
class MitamaProver {
    constructor(circuitsBuildPath = CIRCUITS_BUILD_PATH) {
        this.wasmPaths = new Map();
        this.zkeyPaths = new Map();
        // Set up paths for each circuit
        const circuits = ['agent_identity', 'private_signal', 'swarm_vote'];
        for (const circuit of circuits) {
            this.wasmPaths.set(circuit, path.join(circuitsBuildPath, `${circuit}_js/${circuit}.wasm`));
            this.zkeyPaths.set(circuit, path.join(circuitsBuildPath, `${circuit}_final.zkey`));
        }
    }
    // ============================================================================
    // Commitment Generation
    // ============================================================================
    /**
     * Generate identity commitment from owner secret, agent ID, and registration secret.
     * commitment = poseidon(owner_secret, agent_id, registration_secret)
     */
    static async generateIdentityCommitment(ownerSecret, agentId, registrationSecret) {
        const hash = await poseidonHash([
            bytesToBigint(ownerSecret),
            bytesToBigint(agentId),
            bytesToBigint(registrationSecret),
        ]);
        return bigintToBytes32(hash);
    }
    /**
     * Generate nullifier for agent identity proof.
     * nullifier = poseidon(agent_id, registration_secret, epoch)
     */
    static async generateNullifier(agentId, registrationSecret, epoch) {
        const hash = await poseidonHash([
            bytesToBigint(agentId),
            bytesToBigint(registrationSecret),
            epoch,
        ]);
        return bigintToBytes32(hash);
    }
    /**
     * Generate vote nullifier for swarm vote.
     * vote_nullifier = poseidon(agent_id, registration_secret, action_hash)
     */
    static async generateVoteNullifier(agentId, registrationSecret, actionHash) {
        const hash = await poseidonHash([
            bytesToBigint(agentId),
            bytesToBigint(registrationSecret),
            bytesToBigint(actionHash),
        ]);
        return bigintToBytes32(hash);
    }
    /**
     * Generate vote commitment.
     * vote_commitment = poseidon(vote, vote_salt, action_hash)
     */
    static async generateVoteCommitment(vote, voteSalt, actionHash) {
        const hash = await poseidonHash([
            BigInt(vote ? 1 : 0),
            bytesToBigint(voteSalt),
            bytesToBigint(actionHash),
        ]);
        return bigintToBytes32(hash);
    }
    /**
     * Generate signal commitment for private_signal circuit.
     * signal_commitment = poseidon(signal_type, direction, confidence, magnitude, stake_amount, secret, agent_nullifier)
     */
    static async generateSignalCommitment(signalType, direction, confidence, magnitude, stakeAmount, secret, agentNullifier) {
        const hash = await poseidonHash([
            BigInt(signalType),
            BigInt(direction),
            BigInt(confidence),
            BigInt(magnitude),
            stakeAmount,
            bytesToBigint(secret),
            bytesToBigint(agentNullifier),
        ]);
        return bigintToBytes32(hash);
    }
    /**
     * Generate action hash for swarm coordination.
     * action_hash = poseidon(action_type, action_data_hash)
     */
    static async generateActionHash(actionType, actionData) {
        // First hash the action data to fit in a field element
        const dataHash = await poseidonHash([bytesToBigint(actionData.slice(0, 31))]);
        const hash = await poseidonHash([BigInt(actionType), dataHash]);
        return bigintToBytes32(hash);
    }
    // ============================================================================
    // Proof Generation
    // ============================================================================
    /**
     * Generate ZK proof of agent identity.
     */
    async proveAgentIdentity(inputs, agentsRoot, epoch) {
        const nullifier = await MitamaProver.generateNullifier(inputs.agentId, inputs.registrationSecret, epoch);
        // Build circuit inputs
        const circuitInputs = {
            // Public inputs
            agents_root: bytesToBigint(agentsRoot).toString(),
            nullifier: bytesToBigint(nullifier).toString(),
            epoch: epoch.toString(),
            // Private inputs
            owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
            agent_id: bytesToBigint(inputs.agentId).toString(),
            registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
            merkle_path: inputs.merkleProof.map(p => bytesToBigint(p).toString()),
            path_indices: inputs.merklePathIndices.map(i => i.toString()),
        };
        const wasmPath = this.wasmPaths.get('agent_identity');
        const zkeyPath = this.zkeyPaths.get('agent_identity');
        if (!wasmPath || !zkeyPath) {
            throw new Error('agent_identity circuit paths not configured');
        }
        const { proof } = await snarkjs.groth16.fullProve(circuitInputs, wasmPath, zkeyPath);
        return {
            proof: this.formatProofForSolana(proof),
            nullifier,
        };
    }
    /**
     * Generate ZK proof for submitting a private signal.
     */
    async provePrivateSignal(inputs, agentNullifier, minStake, minConfidence) {
        const signalCommitment = await MitamaProver.generateSignalCommitment(inputs.signalType, inputs.direction, inputs.confidence, inputs.magnitude, inputs.stakeAmount, inputs.secret, agentNullifier);
        // Build circuit inputs
        const circuitInputs = {
            // Public inputs
            signal_commitment: bytesToBigint(signalCommitment).toString(),
            min_stake: minStake.toString(),
            min_confidence: minConfidence.toString(),
            agent_nullifier: bytesToBigint(agentNullifier).toString(),
            // Private inputs
            signal_type: inputs.signalType.toString(),
            direction: inputs.direction.toString(),
            confidence: inputs.confidence.toString(),
            magnitude: inputs.magnitude.toString(),
            stake_amount: inputs.stakeAmount.toString(),
            secret: bytesToBigint(inputs.secret).toString(),
        };
        const wasmPath = this.wasmPaths.get('private_signal');
        const zkeyPath = this.zkeyPaths.get('private_signal');
        if (!wasmPath || !zkeyPath) {
            throw new Error('private_signal circuit paths not configured');
        }
        const { proof } = await snarkjs.groth16.fullProve(circuitInputs, wasmPath, zkeyPath);
        return {
            proof: this.formatProofForSolana(proof),
            signalCommitment,
        };
    }
    /**
     * Generate ZK proof for swarm vote.
     */
    async proveSwarmVote(inputs, agentsRoot, actionHash) {
        const voteNullifier = await MitamaProver.generateVoteNullifier(inputs.agentId, inputs.registrationSecret, actionHash);
        const voteCommitment = await MitamaProver.generateVoteCommitment(inputs.vote, inputs.voteSalt, actionHash);
        // Build circuit inputs
        const circuitInputs = {
            // Public inputs
            agents_root: bytesToBigint(agentsRoot).toString(),
            action_hash: bytesToBigint(actionHash).toString(),
            vote_nullifier: bytesToBigint(voteNullifier).toString(),
            vote_commitment: bytesToBigint(voteCommitment).toString(),
            // Private inputs
            owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
            agent_id: bytesToBigint(inputs.agentId).toString(),
            registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
            merkle_path: inputs.merkleProof.map(p => bytesToBigint(p).toString()),
            path_indices: inputs.merklePathIndices.map(i => i.toString()),
            vote: inputs.vote ? '1' : '0',
            vote_salt: bytesToBigint(inputs.voteSalt).toString(),
        };
        const wasmPath = this.wasmPaths.get('swarm_vote');
        const zkeyPath = this.zkeyPaths.get('swarm_vote');
        if (!wasmPath || !zkeyPath) {
            throw new Error('swarm_vote circuit paths not configured');
        }
        const { proof } = await snarkjs.groth16.fullProve(circuitInputs, wasmPath, zkeyPath);
        return {
            proof: this.formatProofForSolana(proof),
            voteNullifier,
            voteCommitment,
        };
    }
    /**
     * Format snarkjs proof for Solana verification.
     * Converts from snarkjs format to groth16-solana format.
     *
     * IMPORTANT: groth16-solana expects pi_a to be negated (Y coordinate negated).
     * This is required by the pairing equation: e(-A, B) * e(C, delta) * e(vk_x, gamma) * e(alpha, beta) = 1
     */
    formatProofForSolana(proof) {
        const aBytes = new Uint8Array(64);
        const bBytes = new Uint8Array(128);
        const cBytes = new Uint8Array(64);
        // pi_a: G1 point - must be NEGATED for groth16-solana
        // Negation in BN254: -P = (x, p - y) where p is the base field modulus
        const BN254_BASE_FIELD = BigInt('21888242871839275222246405745257275088696311157297823662689037894645226208583');
        const piAx = BigInt(proof.pi_a[0]);
        const piAy = BigInt(proof.pi_a[1]);
        const negPiAy = BN254_BASE_FIELD - piAy;
        writeFieldElement(aBytes, 0, piAx.toString());
        writeFieldElement(aBytes, 32, negPiAy.toString());
        // pi_b: G2 point (reversed order for groth16-solana)
        writeFieldElement(bBytes, 0, proof.pi_b[0][1]);
        writeFieldElement(bBytes, 32, proof.pi_b[0][0]);
        writeFieldElement(bBytes, 64, proof.pi_b[1][1]);
        writeFieldElement(bBytes, 96, proof.pi_b[1][0]);
        // pi_c: G1 point
        writeFieldElement(cBytes, 0, proof.pi_c[0]);
        writeFieldElement(cBytes, 32, proof.pi_c[1]);
        return { a: aBytes, b: bBytes, c: cBytes };
    }
}
exports.MitamaProver = MitamaProver;
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Write field element to buffer in big-endian format.
 * groth16-solana expects big-endian byte order for proof points.
 */
function writeFieldElement(buf, offset, value) {
    const n = BigInt(value);
    const hex = n.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        buf[offset + i] = parseInt(hex.substr(i * 2, 2), 16);
    }
}
/**
 * Generate random 32-byte salt for commitments.
 */
function generateRandomSalt() {
    return new Uint8Array((0, crypto_1.randomBytes)(32));
}
/**
 * Generate random 32-byte secret.
 */
function generateOwnerSecret() {
    return generateRandomSalt();
}
/**
 * Generate random registration secret.
 */
function generateRegistrationSecret() {
    return generateRandomSalt();
}
/**
 * Generate agent ID from owner pubkey and nonce.
 */
async function generateAgentId(ownerPubkey, nonce) {
    const hash = await poseidonHash([bytesToBigint(ownerPubkey), BigInt(nonce)]);
    return bigintToBytes32(hash);
}
//# sourceMappingURL=prover.js.map