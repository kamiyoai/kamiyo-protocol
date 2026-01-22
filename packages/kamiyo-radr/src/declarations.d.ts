/**
 * Type declarations for optional dependencies
 */

declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<PoseidonFunction>;

  interface FieldElement {
    toObject(val: unknown): bigint;
  }

  interface PoseidonFunction {
    (inputs: bigint[]): FieldElement;
    F: FieldElement;
  }
}

declare module '@kamiyo/solana-privacy' {
  import { Wallet } from '@coral-xyz/anchor';

  export interface ReputationProof {
    agentPk: string;
    commitment: string;
    threshold: number;
    proofBytes: Uint8Array;
    groth16Proof?: unknown;
    publicSignals?: string[];
  }

  export class PrivateInference {
    constructor(wallet: Wallet, config?: unknown);
    proveReputation(params: { score: number; threshold: number; secret?: bigint }): Promise<ReputationProof>;
    static encodeReputationProof(proof: ReputationProof): string;
  }

  export interface VerificationResult {
    valid: boolean;
    threshold?: number;
    error?: string;
  }

  export interface ReputationVerifyOptions {
    minThreshold: number;
    connection?: unknown;
    programId?: unknown;
    maxProofAge?: number;
    requireCrypto?: boolean;
    vkeyPath?: string;
  }

  export function verifyReputationProof(
    encodedProof: string,
    options: ReputationVerifyOptions
  ): Promise<VerificationResult>;
}

declare module '@langchain/core/tools' {
  import { z } from 'zod';

  export interface DynamicStructuredToolInput {
    name: string;
    description: string;
    schema: z.ZodObject<any>;
    func: (input: Record<string, any>) => Promise<string>;
  }

  export class DynamicStructuredTool {
    constructor(input: DynamicStructuredToolInput);
    name: string;
    description: string;
  }
}

// Handle missing zod gracefully
declare module 'zod' {
  export interface ZodType<T = any> {
    parse(data: unknown): T;
    safeParse(data: unknown): { success: boolean; data?: T; error?: unknown };
    optional(): ZodType<T | undefined>;
  }

  export interface ZodString extends ZodType<string> {
    describe(desc: string): ZodString;
  }

  export interface ZodNumber extends ZodType<number> {
    positive(): ZodNumber;
    min(min: number): ZodNumber;
    max(max: number): ZodNumber;
    default(val: number): ZodNumber;
    describe(desc: string): ZodNumber;
  }

  export interface ZodObject<T extends Record<string, ZodType>> extends ZodType<{ [K in keyof T]: T[K] extends ZodType<infer U> ? U : never }> {
    describe(desc: string): ZodObject<T>;
  }

  export interface ZodEnum<T extends [string, ...string[]]> extends ZodType<T[number]> {
    describe(desc: string): ZodEnum<T>;
  }

  export const z: {
    object<T extends Record<string, ZodType>>(shape: T): ZodObject<T>;
    string(): ZodString;
    number(): ZodNumber;
    enum<T extends [string, ...string[]]>(values: T): ZodEnum<T>;
  };
}
