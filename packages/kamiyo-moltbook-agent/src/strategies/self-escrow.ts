import * as anchor from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { Connection, Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Strategy, TransactionResult, StrategyConfig } from '../types.js';
import { MoltbookClient } from '../moltbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AMOUNT_SOL = 0.001;
const TIME_LOCK_SECONDS = 60;

export class SelfEscrowStrategy implements Strategy {
  name = 'self-escrow';
  priority = 4;
  activateAfterMs = 42 * 60 * 60 * 1000; // 42 hours

  private moltbook: MoltbookClient;
  private connection: Connection;
  private wallet: Keypair;
  private config: StrategyConfig;
  private status = 'idle';
  private completed = false;

  constructor(config: StrategyConfig) {
    this.config = config;
    this.moltbook = new MoltbookClient(config.moltbookApiKey);
    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.agentPrivateKey));
  }

  async canExecute(): Promise<boolean> {
    const idlPath = this.getIdlPath();
    if (!fs.existsSync(idlPath)) return false;

    const programId = new PublicKey(this.config.programId);
    const [protocolConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('protocol_config')],
      programId
    );
    try {
      const info = await this.connection.getAccountInfo(protocolConfig);
      return !!info;
    } catch {
      return false;
    }
  }

  async execute(): Promise<TransactionResult> {
    this.status = 'executing self-escrow';
    const transactionId = `mission-${Date.now()}`;

    try {
      const programId = new PublicKey(this.config.programId);
      const idlPath = this.getIdlPath();
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

      const walletAdapter = {
        publicKey: this.wallet.publicKey,
        signTransaction: async (tx: anchor.web3.Transaction) => {
          tx.sign(this.wallet);
          return tx;
        },
        signAllTransactions: async (txs: anchor.web3.Transaction[]) => {
          return txs.map(tx => { tx.sign(this.wallet); return tx; });
        },
      };

      const provider = new anchor.AnchorProvider(
        this.connection,
        walletAdapter as anchor.Wallet,
        { commitment: 'confirmed' }
      );

      const program = new anchor.Program(idl, provider);

      const [protocolConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('protocol_config')],
        programId
      );
      const [treasury] = PublicKey.findProgramAddressSync(
        [Buffer.from('treasury')],
        programId
      );
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('escrow'),
          this.wallet.publicKey.toBuffer(),
          Buffer.from(transactionId),
        ],
        programId
      );

      console.log(`[SelfEscrow] Creating escrow: ${escrowPda.toBase58()}`);
      this.status = 'creating escrow';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createTx = await (program.methods as any)
        .initializeEscrow(
          new BN(AMOUNT_SOL * LAMPORTS_PER_SOL),
          new BN(TIME_LOCK_SECONDS),
          transactionId,
          false
        )
        .accounts({
          protocolConfig,
          treasury,
          escrow: escrowPda,
          agent: this.wallet.publicKey,
          api: this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenMint: null,
          escrowTokenAccount: null,
          agentTokenAccount: null,
          tokenProgram: null,
          associatedTokenProgram: null,
        })
        .signers([this.wallet])
        .rpc();

      await this.connection.confirmTransaction(createTx, 'confirmed');
      console.log(`[SelfEscrow] Created: ${createTx}`);
      this.status = 'escrow created, releasing funds';

      await new Promise(r => setTimeout(r, 3000));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const releaseTx = await (program.methods as any)
        .releaseFunds()
        .accounts({
          protocolConfig,
          escrow: escrowPda,
          caller: this.wallet.publicKey,
          api: this.wallet.publicKey,
          systemProgram: SystemProgram.programId,
          escrowTokenAccount: null,
          apiTokenAccount: null,
          tokenProgram: null,
        })
        .signers([this.wallet])
        .rpc();

      await this.connection.confirmTransaction(releaseTx, 'confirmed');
      console.log(`[SelfEscrow] Released: ${releaseTx}`);
      this.status = 'funds released, posting to Moltbook';

      let moltbookPostId: string | undefined;
      try {
        const post = await this.moltbook.createPost({
          title: 'On-Chain Escrow Transaction Complete',
          body: `## KAMIYO Escrow — Self-Test Transaction\n\n` +
            `Verified on-chain escrow create + release on Solana mainnet.\n\n` +
            `**Transaction ID:** \`${transactionId}\`\n` +
            `**Amount:** ${AMOUNT_SOL} SOL\n` +
            `**Escrow PDA:** \`${escrowPda.toBase58()}\`\n` +
            `**Create TX:** \`${createTx}\`\n` +
            `**Release TX:** \`${releaseTx}\`\n\n` +
            `**Verify:**\n` +
            `- [Create](https://solscan.io/tx/${createTx})\n` +
            `- [Release](https://solscan.io/tx/${releaseTx})\n\n` +
            `This demonstrates the full escrow lifecycle: lock funds -> release funds.`,
          submolt: 'agents',
        });
        moltbookPostId = post.postId;
      } catch (err) {
        console.error('[SelfEscrow] Moltbook post failed:', err);
      }

      this.completed = true;
      this.status = 'completed';

      return {
        success: true,
        txHash: releaseTx,
        escrowAddress: escrowPda.toBase58(),
        counterpartyAgent: 'kamiyo',
        paymentType: 'anchor_escrow',
        amountSol: AMOUNT_SOL,
        moltbookPostId,
      };
    } catch (err) {
      console.error('[SelfEscrow] Failed:', err);
      this.status = `failed: ${err instanceof Error ? err.message : 'Unknown error'}`;

      return {
        success: false,
        paymentType: 'anchor_escrow',
        amountSol: AMOUNT_SOL,
        error: err instanceof Error ? err.message : 'Self-escrow failed',
      };
    }
  }

  async poll(): Promise<TransactionResult | null> {
    return null;
  }

  getStatus(): string {
    return this.status;
  }

  private getIdlPath(): string {
    const protocolRoot = path.resolve(__dirname, '../../../..');
    return path.join(protocolRoot, 'target/idl/kamiyo.json');
  }
}
