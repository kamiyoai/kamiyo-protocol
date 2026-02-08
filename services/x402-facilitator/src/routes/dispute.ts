import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getConfig } from '../config';
import {
  getCommitPhaseEnd,
  getRevealPhaseEnd,
  isInCommitPhase,
  isReadyForFinalization,
  calculateConsensus,
  markDisputedOnChain,
  finalizeDisputeOnChain,
} from '../services/dispute';
import {
  getEscrowByAddress,
  getDisputeById,
  getDisputeByEscrow,
  insertDispute,
  updateEscrowDisputed,
  updateDisputeStatus,
  updateDisputeResolved,
  getRevealedVotes,
  insertFeeLedger,
  updateEscrowRelease,
} from '../db/queries';
import { DisputeOpenRequest } from '../types';

function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

export function createDisputeRouter(connection: Connection, operatorKeypair: Keypair): Router {
  const router = Router();

  router.post('/open', async (req: Request, res: Response) => {
    try {
      const { escrowAddress, reason } = req.body as DisputeOpenRequest;

      if (!escrowAddress || !reason) {
        res.status(400).json({ success: false, error: 'Missing escrowAddress or reason' });
        return;
      }

      try { new PublicKey(escrowAddress); } catch { res.status(400).json({ success: false, error: 'Invalid escrow address' }); return; }

      if (typeof reason !== 'string' || reason.length > 1000) {
        res.status(400).json({ success: false, error: 'Reason too long (max 1000 chars)' });
        return;
      }

      const escrow = await getEscrowByAddress(escrowAddress);
      if (!escrow) {
        res.status(404).json({ success: false, error: 'Escrow not found' });
        return;
      }

      if (escrow.status !== 'active') {
        res.status(400).json({ success: false, error: `Escrow is ${escrow.status}, not active` });
        return;
      }

      const callerWallet = (req as any).merchantWallet as string;
      if (callerWallet !== escrow.merchantWallet && callerWallet !== escrow.payerWallet) {
        res.status(403).json({ success: false, error: 'Not a party to this escrow' });
        return;
      }

      const existing = await getDisputeByEscrow(escrowAddress);
      if (existing) {
        res.status(409).json({ success: false, error: 'Dispute already open for this escrow' });
        return;
      }

      const config = getConfig();
      const programId = new PublicKey(config.ESCROW_PROGRAM_ID);

      try {
        await markDisputedOnChain(connection, operatorKeypair, new PublicKey(escrowAddress), programId);
      } catch (err: any) {
        res.status(500).json({ success: false, error: 'On-chain dispute failed' });
        return;
      }

      const commitPhaseEndsAt = getCommitPhaseEnd();
      const revealPhaseEndsAt = getRevealPhaseEnd();

      const dispute = await insertDispute(
        escrow.id,
        escrowAddress,
        callerWallet,
        reason,
        commitPhaseEndsAt,
        revealPhaseEndsAt
      );

      await updateEscrowDisputed(escrowAddress, dispute.id);

      res.json({
        success: true,
        disputeId: dispute.id,
        escrowAddress,
        commitPhaseEndsAt: commitPhaseEndsAt.getTime(),
        revealPhaseEndsAt: revealPhaseEndsAt.getTime(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to open dispute' });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid dispute ID' });
      return;
    }

    try {
      const dispute = await getDisputeById(req.params.id);
      if (!dispute) {
        res.status(404).json({ error: 'Dispute not found' });
        return;
      }

      const escrow = await getEscrowByAddress(dispute.escrowAddress);
      if (!escrow) {
        res.status(404).json({ error: 'Escrow not found' });
        return;
      }

      const callerWallet = (req as any).merchantWallet as string;
      if (callerWallet !== escrow.merchantWallet && callerWallet !== escrow.payerWallet) {
        res.status(403).json({ error: 'Not a party to this escrow' });
        return;
      }

      let phase = dispute.status;
      if (phase === 'commit_phase' && !isInCommitPhase(new Date(dispute.commitPhaseEndsAt))) {
        phase = 'reveal_phase';
      }
      if (phase === 'reveal_phase' && isReadyForFinalization(new Date(dispute.revealPhaseEndsAt))) {
        phase = 'finalizing';
      }

      res.json({
        ...dispute,
        currentPhase: phase,
        commitPhaseEndsAt: new Date(dispute.commitPhaseEndsAt).getTime(),
        revealPhaseEndsAt: new Date(dispute.revealPhaseEndsAt).getTime(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch dispute' });
    }
  });

  router.post('/:id/finalize', async (req: Request, res: Response) => {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) {
      res.status(400).json({ success: false, error: 'Invalid dispute ID' });
      return;
    }

    try {
      const dispute = await getDisputeById(req.params.id);
      if (!dispute) {
        res.status(404).json({ success: false, error: 'Dispute not found' });
        return;
      }

      if (dispute.status === 'resolved') {
        res.status(400).json({ success: false, error: 'Dispute already resolved' });
        return;
      }

      if (!isReadyForFinalization(new Date(dispute.revealPhaseEndsAt))) {
        res.status(400).json({ success: false, error: 'Reveal phase not ended yet' });
        return;
      }

      const escrow = await getEscrowByAddress(dispute.escrowAddress);
      if (!escrow) {
        res.status(404).json({ success: false, error: 'Escrow not found' });
        return;
      }

      const callerWallet = (req as any).merchantWallet as string;
      if (callerWallet !== escrow.merchantWallet && callerWallet !== escrow.payerWallet) {
        res.status(403).json({ success: false, error: 'Not a party to this escrow' });
        return;
      }

      const votes = await getRevealedVotes(dispute.id);
      if (votes.length < 3) {
        await updateDisputeStatus(dispute.id, 'timeout');
        res.status(400).json({ success: false, error: 'Not enough oracle votes for consensus' });
        return;
      }

      let consensusMedian: number;
      let refundPct: number;
      let outliers: string[];
      let validCount: number;
      try {
        const submissions = votes.map((v) => ({ oracle: v.oracle, qualityScore: v.quality_score }));
        const consensus = calculateConsensus(submissions);
        consensusMedian = consensus.medianScore;
        refundPct = consensus.refundPercentage;
        outliers = consensus.outliers;
        validCount = consensus.validCount;
      } catch (err: any) {
        res.status(400).json({ success: false, error: 'Invalid oracle votes' });
        return;
      }

      const config = getConfig();
      let programId: PublicKey;
      let treasuryWallet: PublicKey;
      try {
        programId = new PublicKey(config.ESCROW_PROGRAM_ID);
        treasuryWallet = new PublicKey(config.TREASURY_WALLET);
      } catch {
        res.status(500).json({ success: false, error: 'Invalid program or treasury configuration' });
        return;
      }

      let finalizeTx: string;
      try {
        finalizeTx = await finalizeDisputeOnChain(
          connection,
          operatorKeypair,
          new PublicKey(dispute.escrowAddress),
          new PublicKey(escrow.payerWallet),
          treasuryWallet,
          programId
        );
      } catch {
        res.status(500).json({ success: false, error: 'On-chain finalization failed' });
        return;
      }

      let resolution = 'partial';
      if (refundPct === 100) resolution = 'payer_wins';
      else if (refundPct === 0) resolution = 'merchant_wins';

      const merchantReceived = round6(escrow.amount * (1 - refundPct / 100));
      const payerRefunded = round6(escrow.amount * (refundPct / 100));

      await updateDisputeResolved(dispute.id, consensusMedian, refundPct, resolution, finalizeTx);
      await updateEscrowRelease(dispute.escrowAddress, consensusMedian, finalizeTx, 'released');

      const disputeFeeBps = config.DISPUTE_FEE_BPS;
      const disputeFee = Math.ceil(((escrow.amount * disputeFeeBps) / 10_000) * 1e6) / 1e6;
      await insertFeeLedger(null, escrow.id, 'dispute', disputeFee, finalizeTx);

      res.json({
        success: true,
        txHash: finalizeTx,
        medianScore: consensusMedian,
        refundPercentage: refundPct,
        merchantReceived,
        payerRefunded,
        outlierOracles: outliers,
        validVotes: validCount,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to finalize dispute' });
    }
  });

  return router;
}
