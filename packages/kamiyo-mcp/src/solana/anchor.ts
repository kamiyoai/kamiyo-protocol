import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import BN from 'bn.js';
import { PDADeriver } from './pdas.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function convertDiscriminators(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertDiscriminators);
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'discriminator' && Array.isArray(value)) {
        result[key] = Buffer.from(value as number[]);
      } else {
        result[key] = convertDiscriminators(value);
      }
    }
    return result;
  }

  return obj;
}

let idl: any = null;
function getIdl(): any {
  if (idl) {
    return idl;
  }

  const idlPath = path.join(__dirname, '../idl/x402_escrow.json');
  try {
    const idlContent = fs.readFileSync(idlPath, 'utf-8');
    idl = convertDiscriminators(JSON.parse(idlContent));
    return idl;
  } catch {
    throw new Error(`IDL not found at ${idlPath}. Ensure kamiyo-mcp is built with IDL.`);
  }
}

const INSTRUCTIONS_SYSVAR = new PublicKey('Sysvar1nstructions1111111111111111111111111');

export type X402EscrowProgram = Program;

export interface EscrowAccount {
  agent: PublicKey;
  api: PublicKey;
  amount: bigint;
  status: { active: {} } | { released: {} } | { disputed: {} } | { resolved: {} };
  createdAt: bigint;
  expiresAt: bigint;
  transactionId: string;
  bump: number;
  qualityScore: number | null;
  refundPercentage: number | null;
}

export interface EntityReputationAccount {
  entity: PublicKey;
  entityType: { agent: {} } | { provider: {} };
  totalTransactions: bigint;
  disputesFiled: bigint;
  disputesWon: bigint;
  disputesPartial: bigint;
  disputesLost: bigint;
  averageQualityReceived: number;
  reputationScore: number;
  createdAt: bigint;
  lastUpdated: bigint;
  bump: number;
}

export class X402Program {
  public program: X402EscrowProgram;
  public pda: PDADeriver;

  private wallet: Keypair;
  private connection: Connection;

  constructor(connection: Connection, wallet: Keypair, programId: PublicKey) {
    this.wallet = wallet;
    this.connection = connection;
    this.pda = new PDADeriver(programId);

    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => {
        if (typeof tx.sign === 'function') {
          tx.sign(wallet);
        } else if (typeof tx.partialSign === 'function') {
          tx.partialSign(wallet);
        }
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        for (const tx of txs) {
          if (typeof tx.sign === 'function') {
            tx.sign(wallet);
          } else if (typeof tx.partialSign === 'function') {
            tx.partialSign(wallet);
          }
        }
        return txs;
      },
      payer: wallet,
    } as any;

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: 'confirmed',
    });

    this.program = new Program(getIdl() as Idl, provider);
    Object.defineProperty(this.program, 'programId', {
      value: programId,
      writable: false,
    });
  }

  getWalletPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  private toCamelCase(value: string): string {
    return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  }

  private getInstruction(methodName: string): any | undefined {
    const instructions = (this.program.idl as any)?.instructions ?? [];
    return instructions.find((instruction: any) => {
      const name = instruction?.name;
      return name === methodName || this.toCamelCase(name) === methodName;
    });
  }

  private buildMethod(methodName: string, ...args: any[]): any {
    const method = (this.program.methods as any)[methodName];
    if (typeof method !== 'function') {
      const available = Object.keys(this.program.methods as any)
        .sort()
        .join(', ');
      throw new Error(`Instruction '${methodName}' not found. Available methods: ${available}`);
    }

    return method(...args);
  }

  private filterAccounts(
    methodName: string,
    accounts: Record<string, PublicKey | null>
  ): Record<string, PublicKey | null> {
    const instruction = this.getInstruction(methodName);
    if (!instruction || !Array.isArray(instruction.accounts)) {
      return accounts;
    }

    const accountNames = new Set(
      instruction.accounts
        .map((account: any) => this.toCamelCase(account.name))
        .filter((name: string) => name.length > 0)
    );

    const filtered: Record<string, PublicKey | null> = {};
    for (const [name, pubkey] of Object.entries(accounts)) {
      if (accountNames.has(name)) {
        filtered[name] = pubkey;
      }
    }

    return filtered;
  }

  private attachAccounts(
    builder: any,
    methodName: string,
    accounts: Record<string, PublicKey | null>
  ): any {
    const filtered = this.filterAccounts(methodName, accounts);
    if (typeof builder.accountsPartial === 'function') {
      return builder.accountsPartial(filtered);
    }
    return builder.accounts(filtered);
  }

  private accountNamespace(name: string): any {
    const accountNamespace = this.program.account as any;
    if (accountNamespace[name]) {
      return accountNamespace[name];
    }

    const pascal = name.charAt(0).toUpperCase() + name.slice(1);
    if (accountNamespace[pascal]) {
      return accountNamespace[pascal];
    }

    const camel = this.toCamelCase(name);
    if (accountNamespace[camel]) {
      return accountNamespace[camel];
    }

    for (const [key, value] of Object.entries(accountNamespace)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return value;
      }
    }

    throw new Error(`Account namespace '${name}' not found in loaded IDL`);
  }

  private isSeedsMismatch(error: unknown): boolean {
    const message = String((error as any)?.message || '').toLowerCase();
    return (
      message.includes('constraintseeds') ||
      message.includes('seeds constraint') ||
      message.includes('provided seeds do not result in a valid address')
    );
  }

  async resolveEscrowPDA(transactionId: string, agent?: PublicKey): Promise<PublicKey> {
    const candidates = this.pda.deriveEscrowPDAs(transactionId, agent ?? this.wallet.publicKey);

    for (const [candidate] of candidates) {
      const account = await this.connection.getAccountInfo(candidate, 'confirmed');
      if (account) {
        return candidate;
      }
    }

    return candidates[0][0];
  }

  async initializeEscrow(params: {
    api: PublicKey;
    amount: number;
    timeLock: number;
    transactionId: string;
  }): Promise<{ signature: string; escrowPDA: PublicKey }> {
    const instruction = this.getInstruction('initializeEscrow');
    const argsCount = instruction?.args?.length ?? 0;

    const args =
      argsCount >= 4
        ? [new BN(params.amount), new BN(params.timeLock), params.transactionId, false]
        : [new BN(params.amount), new BN(params.timeLock), params.transactionId];

    const [protocolConfig] = this.pda.deriveProtocolConfigPDA();
    const [treasury] = this.pda.deriveTreasuryPDA();
    const candidates = this.pda.deriveEscrowPDAs(params.transactionId, this.wallet.publicKey);

    let lastError: unknown;

    for (let index = 0; index < candidates.length; index += 1) {
      const [escrowPDA] = candidates[index];

      try {
        const signature = await this.attachAccounts(
          this.buildMethod('initializeEscrow', ...args),
          'initializeEscrow',
          {
            protocolConfig,
            treasury,
            escrow: escrowPDA,
            agent: this.wallet.publicKey,
            api: params.api,
            systemProgram: SystemProgram.programId,
            tokenMint: null,
            escrowTokenAccount: null,
            agentTokenAccount: null,
            tokenProgram: null,
            associatedTokenProgram: null,
          }
        )
          .rpc();

        return {
          signature,
          escrowPDA,
        };
      } catch (error) {
        lastError = error;
        const canRetry = index < candidates.length - 1 && this.isSeedsMismatch(error);
        if (!canRetry) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Failed to initialize escrow');
  }

  async releaseFunds(transactionId: string): Promise<string> {
    const escrowPDA = await this.resolveEscrowPDA(transactionId, this.wallet.publicKey);
    const escrow = await this.getEscrowAccount(escrowPDA);
    const [protocolConfig] = this.pda.deriveProtocolConfigPDA();

    return this.attachAccounts(this.buildMethod('releaseFunds'), 'releaseFunds', {
      protocolConfig,
      escrow: escrowPDA,
      caller: this.wallet.publicKey,
      agent: this.wallet.publicKey,
      api: escrow.api,
      systemProgram: SystemProgram.programId,
      escrowTokenAccount: null,
      apiTokenAccount: null,
      tokenProgram: null,
    })
      .rpc();
  }

  async markDisputed(transactionId: string): Promise<string> {
    const escrowPDA = await this.resolveEscrowPDA(transactionId, this.wallet.publicKey);
    const [reputationPDA] = this.pda.deriveReputationPDA(this.wallet.publicKey);
    const [protocolConfig] = this.pda.deriveProtocolConfigPDA();

    return this.attachAccounts(this.buildMethod('markDisputed'), 'markDisputed', {
      protocolConfig,
      escrow: escrowPDA,
      reputation: reputationPDA,
      agent: this.wallet.publicKey,
    })
      .rpc();
  }

  async resolveDispute(params: {
    transactionId: string;
    qualityScore: number;
    refundPercentage: number;
    signature: Buffer;
    verifier: PublicKey;
  }): Promise<string> {
    const escrowPDA = await this.resolveEscrowPDA(params.transactionId, this.wallet.publicKey);
    const escrow = await this.getEscrowAccount(escrowPDA);

    const [agentReputationPDA] = this.pda.deriveReputationPDA(escrow.agent);
    const [apiReputationPDA] = this.pda.deriveReputationPDA(escrow.api);
    const [protocolConfig] = this.pda.deriveProtocolConfigPDA();
    const [oracleRegistry] = this.pda.deriveOracleRegistryPDA();
    const signatureArray = Array.from(params.signature);

    return this.attachAccounts(
      this.buildMethod(
      'resolveDispute',
      params.qualityScore,
      params.refundPercentage,
      signatureArray as any
      ),
      'resolveDispute',
      {
        protocolConfig,
        escrow: escrowPDA,
        agent: escrow.agent,
        api: escrow.api,
        oracleRegistry,
        verifier: params.verifier,
        instructionsSysvar: INSTRUCTIONS_SYSVAR,
        agentReputation: agentReputationPDA,
        apiReputation: apiReputationPDA,
        systemProgram: SystemProgram.programId,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        apiTokenAccount: null,
        tokenProgram: null,
      }
    )
      .rpc();
  }

  async initReputation(entity?: PublicKey): Promise<{ signature: string; reputationPDA: PublicKey }> {
    const entityPubkey = entity ?? this.wallet.publicKey;
    const [reputationPDA] = this.pda.deriveReputationPDA(entityPubkey);

    const signature = await this.attachAccounts(this.buildMethod('initReputation'), 'initReputation', {
      reputation: reputationPDA,
      entity: entityPubkey,
      payer: this.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
      .rpc();

    return {
      signature,
      reputationPDA,
    };
  }

  async getEscrowAccount(escrowPDA: PublicKey): Promise<EscrowAccount> {
    const accountData = await this.accountNamespace('escrow').fetch(escrowPDA);
    return accountData as any;
  }

  async getReputationAccount(reputationPDA: PublicKey): Promise<EntityReputationAccount> {
    const accountData = await this.accountNamespace('entityReputation').fetch(reputationPDA);
    return accountData as any;
  }

  async escrowExists(transactionId: string): Promise<boolean> {
    const candidates = this.pda.deriveEscrowPDAs(transactionId, this.wallet.publicKey);
    for (const [candidate] of candidates) {
      const account = await this.connection.getAccountInfo(candidate, 'confirmed');
      if (account) {
        return true;
      }
    }
    return false;
  }

  async reputationExists(entity: PublicKey): Promise<boolean> {
    const [reputationPDA] = this.pda.deriveReputationPDA(entity);
    const account = await this.connection.getAccountInfo(reputationPDA, 'confirmed');
    return account !== null;
  }
}
