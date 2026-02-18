import type { Wallet } from '@coral-xyz/anchor';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';

export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
      return tx;
    }

    tx.sign([this.payer]);
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map(tx => this.signTransaction(tx)));
  }
}
