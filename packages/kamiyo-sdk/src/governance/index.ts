import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getGovernanceProgramVersion,
  getRealm,
  getTokenOwnerRecordAddress,
  getTokenOwnerRecord,
  withDepositGoverningTokens,
  withWithdrawGoverningTokens,
  withCreateProposal,
  withSignOffProposal,
  withCastVote,
  Vote,
  VoteType,
  getProposal,
  ProposalState,
} from '@solana/spl-governance';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';

const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

export interface GovernanceConfig {
  connection: Connection;
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
    signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
  };
  realmAddress: PublicKey;
}

export interface ProposalParams {
  title: string;
  description: string;
  governanceAddress: PublicKey;
}

export interface ParameterChangeParams extends ProposalParams {
  parameter: string;
  newValue: number | string;
}

export interface TreasuryTransferParams extends ProposalParams {
  recipient: PublicKey;
  amount: number;
  mint?: PublicKey;
}

export class KamiyoGovernance {
  private connection: Connection;
  private wallet: GovernanceConfig['wallet'];
  private realmAddress: PublicKey;
  private programVersion: number = 3;

  constructor(config: GovernanceConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.realmAddress = config.realmAddress;
  }

  async init(): Promise<void> {
    try {
      this.programVersion = await getGovernanceProgramVersion(
        this.connection,
        GOVERNANCE_PROGRAM_ID
      );
    } catch {
      this.programVersion = 3;
    }
  }

  async getRealm() {
    return getRealm(this.connection, this.realmAddress);
  }

  async getTokenOwnerRecord() {
    const realm = await this.getRealm();
    const torAddress = await getTokenOwnerRecordAddress(
      GOVERNANCE_PROGRAM_ID,
      this.realmAddress,
      realm.account.communityMint,
      this.wallet.publicKey
    );
    try {
      return await getTokenOwnerRecord(this.connection, torAddress);
    } catch {
      return null;
    }
  }

  async depositTokens(amount: number): Promise<string> {
    const realm = await this.getRealm();
    const instructions: TransactionInstruction[] = [];

    const ata = await getAssociatedTokenAddress(
      realm.account.communityMint,
      this.wallet.publicKey
    );

    await withDepositGoverningTokens(
      instructions,
      GOVERNANCE_PROGRAM_ID,
      this.programVersion,
      this.realmAddress,
      ata,
      realm.account.communityMint,
      this.wallet.publicKey,
      this.wallet.publicKey,
      this.wallet.publicKey,
      new BN(amount)
    );

    return this.sendTransaction(instructions);
  }

  async withdrawTokens(amount: number): Promise<string> {
    const realm = await this.getRealm();
    const instructions: TransactionInstruction[] = [];

    const ata = await getAssociatedTokenAddress(
      realm.account.communityMint,
      this.wallet.publicKey
    );

    await withWithdrawGoverningTokens(
      instructions,
      GOVERNANCE_PROGRAM_ID,
      this.programVersion,
      this.realmAddress,
      ata,
      realm.account.communityMint,
      this.wallet.publicKey
    );

    return this.sendTransaction(instructions);
  }

  async createProposal(params: ProposalParams): Promise<{ signature: string; proposalAddress: PublicKey }> {
    const realm = await this.getRealm();
    const instructions: TransactionInstruction[] = [];

    const torAddress = await getTokenOwnerRecordAddress(
      GOVERNANCE_PROGRAM_ID,
      this.realmAddress,
      realm.account.communityMint,
      this.wallet.publicKey
    );

    const proposalAddress = await withCreateProposal(
      instructions,
      GOVERNANCE_PROGRAM_ID,
      this.programVersion,
      this.realmAddress,
      params.governanceAddress,
      torAddress,
      params.title,
      params.description,
      realm.account.communityMint,
      this.wallet.publicKey,
      0, // proposal index
      VoteType.SINGLE_CHOICE,
      ['Approve'],
      true, // use deny option
      this.wallet.publicKey
    );

    await withSignOffProposal(
      instructions,
      GOVERNANCE_PROGRAM_ID,
      this.programVersion,
      this.realmAddress,
      params.governanceAddress,
      proposalAddress,
      this.wallet.publicKey,
      undefined,
      torAddress
    );

    const signature = await this.sendTransaction(instructions);
    return { signature, proposalAddress };
  }

  async vote(proposalAddress: PublicKey, choice: 'approve' | 'deny' | 'abstain'): Promise<string> {
    const proposal = await getProposal(this.connection, proposalAddress);
    const realm = await this.getRealm();
    const instructions: TransactionInstruction[] = [];

    const torAddress = await getTokenOwnerRecordAddress(
      GOVERNANCE_PROGRAM_ID,
      this.realmAddress,
      realm.account.communityMint,
      this.wallet.publicKey
    );

    let vote: Vote;
    switch (choice) {
      case 'approve':
        vote = Vote.fromYesNoVote(1); // Yes
        break;
      case 'deny':
        vote = Vote.fromYesNoVote(0); // No
        break;
      case 'abstain':
        vote = new Vote({
          voteType: 0,
          approveChoices: undefined,
          deny: undefined,
          veto: undefined,
        });
        break;
    }

    await withCastVote(
      instructions,
      GOVERNANCE_PROGRAM_ID,
      this.programVersion,
      this.realmAddress,
      proposal.account.governance,
      proposalAddress,
      proposal.account.tokenOwnerRecord,
      torAddress,
      this.wallet.publicKey,
      realm.account.communityMint,
      vote,
      this.wallet.publicKey
    );

    return this.sendTransaction(instructions);
  }

  async getProposalState(proposalAddress: PublicKey): Promise<ProposalState> {
    const proposal = await getProposal(this.connection, proposalAddress);
    return proposal.account.state;
  }

  private async sendTransaction(instructions: TransactionInstruction[]): Promise<string> {
    const tx = new Transaction().add(...instructions);
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet.publicKey;

    const signed = await this.wallet.signTransaction(tx);
    const sig = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }
}

export { GOVERNANCE_PROGRAM_ID, KAMIYO_MINT };
