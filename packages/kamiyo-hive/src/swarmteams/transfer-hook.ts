/**
 * KAMIYO Transfer Hook Client
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('4p9eHUGsx93XC5i6y9fL3cbTs5Zpfqidjjd1e41FQaU6');

export interface HookConfig {
  admin: PublicKey;
  enabled: boolean;
  cooldownSeconds: BN;
  rateLimitWindow: BN;
  maxTransfersPerWindow: number;
  maxVolumePerWindow: BN;
  burnEnabled: boolean;
  burnRateBps: BN;
  totalBurned: BN;
  bump: number;
}

export interface BurnExemptList {
  admin: PublicKey;
  exemptAddresses: PublicKey[];
  bump: number;
}

export interface PlatformWhitelist {
  admin: PublicKey;
  platforms: PublicKey[];
  bump: number;
}

export interface TransferState {
  owner: PublicKey;
  lastTransferTime: BN;
  lastTransferOutbound: boolean;
  lastTransferAmount: BN;
  transfersInWindow: number;
  volumeInWindow: BN;
  windowStart: BN;
  rapidReversals: number;
  isFlagged: boolean;
  bump: number;
}

export class TransferHookClient {
  private connection: Connection;
  private program: anchor.Program | null = null;
  private wallet: anchor.Wallet | null = null;

  constructor(connection: Connection, wallet?: anchor.Wallet) {
    this.connection = connection;
    this.wallet = wallet ?? null;
  }

  async initializeProgram(idl: any): Promise<void> {
    if (!this.wallet) throw new Error('Wallet required');
    const provider = new anchor.AnchorProvider(this.connection, this.wallet, { commitment: 'confirmed' });
    this.program = new anchor.Program(idl, provider);
  }

  // PDAs

  getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('hook_config')], TRANSFER_HOOK_PROGRAM_ID);
  }

  getWhitelistPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('whitelist')], TRANSFER_HOOK_PROGRAM_ID);
  }

  getBurnExemptPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('burn_exempt')], TRANSFER_HOOK_PROGRAM_ID);
  }

  getTransferStatePDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('transfer_state'), owner.toBuffer()], TRANSFER_HOOK_PROGRAM_ID);
  }

  // Read

  async getConfig(): Promise<HookConfig | null> {
    const [pda] = this.getConfigPDA();
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    return {
      admin: new PublicKey(data.slice(off, (off += 32))),
      enabled: data[off++] === 1,
      cooldownSeconds: new BN(data.slice(off, (off += 8)), 'le'),
      rateLimitWindow: new BN(data.slice(off, (off += 8)), 'le'),
      maxTransfersPerWindow: data.readUInt16LE(off),
      maxVolumePerWindow: new BN(data.slice((off += 2), (off += 8)), 'le'),
      burnEnabled: data[off++] === 1,
      burnRateBps: new BN(data.slice(off, (off += 8)), 'le'),
      totalBurned: new BN(data.slice(off, (off += 8)), 'le'),
      bump: data[off],
    };
  }

  async getBurnExemptList(): Promise<BurnExemptList | null> {
    const [pda] = this.getBurnExemptPDA();
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    const admin = new PublicKey(data.slice(off, off + 32)); off += 32;
    const count = data.readUInt32LE(off); off += 4;

    const exemptAddresses: PublicKey[] = [];
    for (let i = 0; i < count; i++) {
      exemptAddresses.push(new PublicKey(data.slice(off, off + 32)));
      off += 32;
    }

    return { admin, exemptAddresses, bump: data[off] };
  }

  async getWhitelist(): Promise<PlatformWhitelist | null> {
    const [pda] = this.getWhitelistPDA();
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    const admin = new PublicKey(data.slice(off, off + 32)); off += 32;
    const count = data.readUInt32LE(off); off += 4;

    const platforms: PublicKey[] = [];
    for (let i = 0; i < count; i++) {
      platforms.push(new PublicKey(data.slice(off, off + 32)));
      off += 32;
    }

    return { admin, platforms, bump: data[off] };
  }

  async getTransferState(owner: PublicKey): Promise<TransferState | null> {
    const [pda] = this.getTransferStatePDA(owner);
    const info = await this.connection.getAccountInfo(pda);
    if (!info) return null;

    const data = info.data;
    let off = 8;

    return {
      owner: new PublicKey(data.slice(off, (off += 32))),
      lastTransferTime: new BN(data.slice(off, (off += 8)), 'le'),
      lastTransferOutbound: data[off++] === 1,
      lastTransferAmount: new BN(data.slice(off, (off += 8)), 'le'),
      transfersInWindow: data.readUInt16LE(off),
      volumeInWindow: new BN(data.slice((off += 2), (off += 8)), 'le'),
      windowStart: new BN(data.slice(off, (off += 8)), 'le'),
      rapidReversals: data[off++],
      isFlagged: data[off++] === 1,
      bump: data[off],
    };
  }

  // Write (admin)

  async addBurnExempt(address: PublicKey): Promise<string> {
    this.requireProgram();
    const [pda] = this.getBurnExemptPDA();
    return this.program!.methods.addBurnExempt(address).accounts({ burnExempt: pda, admin: this.wallet!.publicKey }).rpc();
  }

  async removeBurnExempt(address: PublicKey): Promise<string> {
    this.requireProgram();
    const [pda] = this.getBurnExemptPDA();
    return this.program!.methods.removeBurnExempt(address).accounts({ burnExempt: pda, admin: this.wallet!.publicKey }).rpc();
  }

  async addPlatform(platform: PublicKey): Promise<string> {
    this.requireProgram();
    const [pda] = this.getWhitelistPDA();
    return this.program!.methods.addPlatform(platform).accounts({ whitelist: pda, admin: this.wallet!.publicKey }).rpc();
  }

  async removePlatform(platform: PublicKey): Promise<string> {
    this.requireProgram();
    const [pda] = this.getWhitelistPDA();
    return this.program!.methods.removePlatform(platform).accounts({ whitelist: pda, admin: this.wallet!.publicKey }).rpc();
  }

  async updateConfig(params: {
    cooldownSeconds?: BN;
    rateLimitWindow?: BN;
    maxTransfersPerWindow?: number;
    maxVolumePerWindow?: BN;
    burnRateBps?: BN;
  }): Promise<string> {
    this.requireProgram();
    const [pda] = this.getConfigPDA();
    return this.program!.methods
      .updateConfig(
        params.cooldownSeconds ?? null,
        params.rateLimitWindow ?? null,
        params.maxTransfersPerWindow ?? null,
        params.maxVolumePerWindow ?? null,
        params.burnRateBps ?? null
      )
      .accounts({ config: pda, admin: this.wallet!.publicKey })
      .rpc();
  }

  async enableHook(): Promise<string> {
    this.requireProgram();
    const [pda] = this.getConfigPDA();
    return this.program!.methods.enableHook().accounts({ config: pda, admin: this.wallet!.publicKey }).rpc();
  }

  async disableHook(): Promise<string> {
    this.requireProgram();
    const [pda] = this.getConfigPDA();
    return this.program!.methods.disableHook().accounts({ config: pda, admin: this.wallet!.publicKey }).rpc();
  }

  // Helpers

  private requireProgram(): void {
    if (!this.program || !this.wallet) throw new Error('Program not initialized');
  }

  async isBurnExempt(address: PublicKey): Promise<boolean> {
    const list = await this.getBurnExemptList();
    return list?.exemptAddresses.some(a => a.equals(address)) ?? false;
  }

  async isPlatformWhitelisted(platform: PublicKey): Promise<boolean> {
    const list = await this.getWhitelist();
    return list?.platforms.some(p => p.equals(platform)) ?? false;
  }

  async calculateBurnAmount(amount: BN): Promise<BN> {
    const config = await this.getConfig();
    if (!config?.burnEnabled) return new BN(0);
    if (amount.ltn(10_000_000)) return new BN(0); // min 10 KAMIYO
    return amount.mul(config.burnRateBps).divn(10000);
  }

  async getBurnStats(): Promise<{ totalBurned: BN; burnRateBps: BN; burnEnabled: boolean; exemptCount: number }> {
    const config = await this.getConfig();
    const exempt = await this.getBurnExemptList();
    return {
      totalBurned: config?.totalBurned ?? new BN(0),
      burnRateBps: config?.burnRateBps ?? new BN(0),
      burnEnabled: config?.burnEnabled ?? false,
      exemptCount: exempt?.exemptAddresses.length ?? 0,
    };
  }

  formatBurnRate(bps: BN): string {
    return `${bps.toNumber() / 100}%`;
  }
}
