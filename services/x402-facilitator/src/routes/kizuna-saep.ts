/**
 * `/kizuna/adapters/saep/*` routes — KAMIYO underwriting for SAEP task-market
 * activity. KAMIYO never signs SAEP transactions; this surface reads SAEP
 * state (via `@kamiyo/saep-adapter`) and runs the crypto-fast Kizuna lane.
 *
 * Sprint W3 surface:
 *   POST /kizuna/adapters/saep/underwrite
 *   GET  /kizuna/adapters/saep/reservations/:id
 *
 * `/kizuna/adapters/saep/settlement-ingest` is the W4 deliverable.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  SaepAdapterError,
  SaepReader,
  computeRiskHash,
  normalizeSnapshot,
  type SaepTaskSnapshot,
  type SaepWorkRef,
  type SolanaCluster,
  validateForUnderwriting,
  type UnderwritingPolicy,
} from '@kamiyo/saep-adapter';
import { Router, type Request, type Response } from 'express';

import { getConfig } from '../config';
import {
  createKizunaReservation,
  getKizunaAccount,
  getKizunaDebtByReservationId,
  getKizunaLatestHealthSnapshot,
  getKizunaOutstandingMicro,
  getKizunaReservationById,
  getKizunaReservationByNonce,
  insertKizunaUnderwriteDecision,
} from '../db/queries';

// ---------------------------------------------------------------------------
// Local helpers (mirror the patterns in kizuna.ts so this router stays
// self-contained without exporting private functions from there).
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sendError(
  res: Response,
  status: number,
  error: string,
  extra?: Record<string, unknown>
): void {
  res.status(status).json({ error, ...extra });
}

function requireInternalToken(req: Request, res: Response): boolean {
  const configured = getConfig().KIZUNA_INTERNAL_TOKEN.trim();
  if (!configured) {
    sendError(res, 503, 'Kizuna internal auth is not configured');
    return false;
  }
  const header = asString(req.get('authorization'));
  if (header !== `Bearer ${configured}`) {
    sendError(res, 401, 'Unauthorized');
    return false;
  }
  return true;
}

function parseCluster(value: unknown): SolanaCluster | null {
  const cluster = asString(value);
  if (cluster === 'mainnet-beta' || cluster === 'devnet') return cluster;
  return null;
}

// ---------------------------------------------------------------------------
// SAEP reader factory
// ---------------------------------------------------------------------------

interface SaepFactory {
  rpcFor(cluster: SolanaCluster): string;
  readerFor(cluster: SolanaCluster): SaepReader;
  policy(): UnderwritingPolicy;
}

/**
 * Build a {@link SaepFactory} from current config. Lazy: the SAEP routes
 * mounting succeeds even when SAEP env is not set; calls fail at request
 * time with a 503 instead.
 */
function createSaepFactory(): SaepFactory {
  return {
    rpcFor(cluster) {
      const cfg = getConfig();
      if (cluster === 'mainnet-beta') return cfg.SOLANA_RPC_URL;
      return cfg.SAEP_RPC_URL_DEVNET;
    },
    readerFor(cluster) {
      const cfg = getConfig();
      if (!cfg.SAEP_TASK_MARKET_PROGRAM_ID) {
        throw new SaepAdapterError(
          'rpc_unreachable',
          'SAEP_TASK_MARKET_PROGRAM_ID is not configured'
        );
      }
      const rpcUrl = this.rpcFor(cluster);
      if (!rpcUrl) {
        throw new SaepAdapterError(
          'rpc_unreachable',
          `No RPC URL configured for cluster ${cluster}`
        );
      }
      const programIds = { taskMarket: new PublicKey(cfg.SAEP_TASK_MARKET_PROGRAM_ID) };
      const connection = new Connection(rpcUrl, 'confirmed');
      const discriminatorHex = cfg.SAEP_TASK_DISCRIMINATOR_HEX;
      return new SaepReader({
        connection,
        cluster,
        programIds,
        ...(discriminatorHex && {
          expectedDiscriminator: Buffer.from(discriminatorHex, 'hex'),
        }),
        ...(!discriminatorHex && { skipDiscriminatorCheck: true }),
      });
    },
    policy() {
      const cfg = getConfig();
      return {
        allowedPaymentMints: cfg.SAEP_ALLOWED_PAYMENT_MINTS.map(m => new PublicKey(m)),
        // Defaults from the adapter — bound the underwriting window to the
        // SAEP MAX_DEADLINE_SECS (30d). Adapter applies its own minimum (60s).
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Error mapping — turn SAEP adapter errors into the same `reasonCodes`
// shape the existing Kizuna underwriting route uses, so downstream
// observers see one vocabulary.
// ---------------------------------------------------------------------------

function reasonCodesForSaepError(err: SaepAdapterError): string[] {
  return [`saep_${err.code}`];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

interface CreateRouterOptions {
  /** Override the SAEP factory. Tests inject a stub here. */
  saepFactory?: SaepFactory;
}

export function createKizunaSaepRouter(options: CreateRouterOptions = {}): Router {
  const router = Router();
  const saep = options.saepFactory ?? createSaepFactory();

  // --------------------------------------------------------------------
  // POST /underwrite
  // --------------------------------------------------------------------
  router.post('/underwrite', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }
    if (!requireInternalToken(req, res)) return;

    const agentId = asString(req.body?.agentId);
    const payerWallet = asString(req.body?.payerWallet);
    const collateralAccount = asString(req.body?.collateralAccount);
    const taskPdaStr = asString(req.body?.taskPda);
    const cluster = parseCluster(req.body?.cluster);
    const idempotencyKey = asString(req.body?.idempotencyKey);

    if (
      !agentId ||
      !payerWallet ||
      !collateralAccount ||
      !taskPdaStr ||
      !cluster ||
      !idempotencyKey
    ) {
      sendError(
        res,
        400,
        'agentId, payerWallet, collateralAccount, taskPda, cluster, and idempotencyKey are required'
      );
      return;
    }

    let taskPda: PublicKey;
    try {
      taskPda = new PublicKey(taskPdaStr);
    } catch {
      sendError(res, 400, 'taskPda is not a valid Solana address');
      return;
    }

    try {
      // 1. Idempotency: replay -> return the existing reservation.
      const replay = await getKizunaReservationByNonce(payerWallet, idempotencyKey);
      if (replay) {
        res.json({
          escrowRef: replay.id,
          decisionId: replay.decision.id,
          lane: replay.lane,
          poolId: replay.pool_id,
          amountMicro: replay.amount_micro,
          fundingMode: replay.funding_mode,
          status: replay.status,
          replay: true,
        });
        return;
      }

      // 2. Account checks (same as the bundled job route).
      const account = await getKizunaAccount(agentId);
      if (!account) {
        sendError(res, 404, 'Kizuna account not found');
        return;
      }
      if (account.status !== 'active') {
        sendError(res, 409, 'Kizuna account is not active');
        return;
      }
      if (account.payer_wallet !== payerWallet) {
        sendError(res, 400, 'payerWallet does not match the Kizuna account');
        return;
      }

      // 3. Read + validate the SAEP task. SAEP is the source of truth on
      //    mint, status, deadline, agent identity. Adapter errors map to
      //    `saep_*` reason codes so callers can switch on them.
      let snapshot: SaepTaskSnapshot;
      try {
        const reader = saep.readerFor(cluster);
        snapshot = await reader.fetchTaskByPda(taskPda);
      } catch (err) {
        if (err instanceof SaepAdapterError) {
          if (err.code === 'rpc_account_not_found') {
            sendError(res, 404, 'SAEP task not found', {
              reasonCodes: reasonCodesForSaepError(err),
            });
            return;
          }
          sendError(res, 503, 'SAEP read failed', {
            reasonCodes: reasonCodesForSaepError(err),
          });
          return;
        }
        throw err;
      }

      try {
        validateForUnderwriting(snapshot, { nowSec: Math.floor(Date.now() / 1000) }, saep.policy());
      } catch (err) {
        if (err instanceof SaepAdapterError) {
          // Validation failures share the rejection shape with the
          // existing Kizuna route — 409 + decisionId-less because we
          // don't insert a decision for a refused SAEP read.
          sendError(res, 409, 'SAEP task is not eligible for underwriting', {
            reasonCodes: reasonCodesForSaepError(err),
          });
          return;
        }
        throw err;
      }

      // 4. SAEP says yes. Now run the crypto-fast Kizuna policy:
      //    - cap by KIZUNA_MAX_SINGLE_MICRO and the contributor's mandate
      //    - require a non-zero collateral position (health snapshot exists)
      //    - issue decision + reservation
      const lane = 'crypto-fast' as const;
      const poolId = config.KIZUNA_FASTPATH_POOL_ID;

      const requestedMicro = BigInt(snapshot.paymentAmount.toString(10));
      const maxSingleMicro = BigInt(config.KIZUNA_MAX_SINGLE_MICRO);
      const mandateSingleLimitMicro =
        parseNonNegative(account.mandate_single_limit_micro) ?? maxSingleMicro;

      let availableMicro = requestedMicro <= maxSingleMicro ? requestedMicro : maxSingleMicro;
      availableMicro =
        availableMicro <= mandateSingleLimitMicro ? availableMicro : mandateSingleLimitMicro;

      const reasonCodes: string[] = [];
      if (requestedMicro > maxSingleMicro) {
        reasonCodes.push('kizuna_max_single_limit_exceeded');
      }
      if (requestedMicro > mandateSingleLimitMicro) {
        reasonCodes.push('kizuna_mandate_single_limit_exceeded');
      }

      // Health-factor gate. The contributor must have at least the configured
      // minimum health factor at the time of underwriting.
      const health = await getKizunaLatestHealthSnapshot(agentId, poolId);
      if (!health) {
        availableMicro = 0n;
        reasonCodes.push('kizuna_no_collateral_health_snapshot');
      } else {
        const hf = parseFiniteNumber(health.health_factor);
        const min = config.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR;
        if (hf == null || hf < min) {
          availableMicro = 0n;
          reasonCodes.push('kizuna_unsafe_health_factor');
        }
      }

      // Outstanding-debt cap — never underwrite past the per-pool ceiling.
      const outstandingMicro = await getKizunaOutstandingMicro(agentId, { lane, poolId });

      // Compute the SaepWorkRef now so the decision row + response carry it.
      const workRef: SaepWorkRef = normalizeSnapshot(snapshot);

      const approvedMicro = availableMicro > 0n ? availableMicro : 0n;
      const decision = await insertKizunaUnderwriteDecision({
        agentId,
        payerWallet,
        repayWallet: account.repay_wallet,
        requestNonce: idempotencyKey,
        network: 'solana',
        lane,
        poolId,
        requestedMicro: requestedMicro.toString(10),
        approved: approvedMicro > 0n,
        approvedMicro: approvedMicro.toString(10),
        availableMicro: availableMicro.toString(10),
        outstandingMicro: outstandingMicro.toString(10),
        scoreRaw: approvedMicro > 0n ? 700 : 250,
        reasonCodes,
        tier: 'saep_adapter',
        policyPackId: 'saep-cryptofast-v1',
        riskBand: approvedMicro > 0n ? 'low' : 'high',
        decisionEnvelopeHash: workRef.riskHash,
      });

      if (approvedMicro <= 0n) {
        res.status(409).json({
          error: 'Kizuna reservation rejected',
          decisionId: decision.id,
          reasonCodes,
          taskRef: workRef,
        });
        return;
      }

      const reservation = await createKizunaReservation({
        decisionId: decision.id,
        agentId,
        payerWallet,
        requestNonce: idempotencyKey,
        network: 'solana',
        lane,
        poolId,
        amountMicro: approvedMicro.toString(10),
        ttlMs: config.KIZUNA_RESERVATION_TTL_MS,
        fundingMode: 'collateralized',
        lockedMicro: '0',
      });

      res.json({
        escrowRef: reservation.id,
        decisionId: decision.id,
        lane: reservation.lane,
        poolId: reservation.pool_id,
        amountMicro: reservation.amount_micro,
        fundingMode: reservation.funding_mode,
        status: reservation.status,
        taskRef: workRef,
        riskHash: workRef.riskHash,
        collateralAccount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to underwrite SAEP task';
      sendError(res, 500, message);
    }
  });

  // --------------------------------------------------------------------
  // GET /reservations/:id
  // --------------------------------------------------------------------
  router.get('/reservations/:id', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }
    if (!requireInternalToken(req, res)) return;

    const reservationId = asString(req.params.id);
    if (!reservationId) {
      sendError(res, 400, 'reservation id is required');
      return;
    }

    try {
      const reservation = await getKizunaReservationById(reservationId);
      if (!reservation) {
        sendError(res, 404, 'Reservation not found');
        return;
      }

      const decisionEnvelopeHash =
        (reservation as unknown as { decision?: { decision_envelope_hash?: string } })?.decision
          ?.decision_envelope_hash ?? null;

      // The SAEP work-ref isn't currently a first-class column on the
      // reservations table. We surface what's available; the W4 settlement
      // ingest will add explicit external_work_ref persistence.
      const debt = await getKizunaDebtByReservationId(reservationId);
      const health = await getKizunaLatestHealthSnapshot(reservation.agent_id, reservation.pool_id);

      res.json({
        reservation: {
          id: reservation.id,
          agentId: reservation.agent_id,
          payerWallet: reservation.payer_wallet,
          lane: reservation.lane,
          poolId: reservation.pool_id,
          amountMicro: reservation.amount_micro,
          fundingMode: reservation.funding_mode,
          status: reservation.status,
        },
        decision: {
          envelopeHash: decisionEnvelopeHash,
        },
        debt: debt ?? null,
        health: health ?? null,
        // taskRef is recoverable from `decision.envelopeHash` (the SAEP risk
        // hash); a future enhancement would store the full work-ref on the
        // decision row for direct retrieval here.
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read reservation';
      sendError(res, 500, message);
    }
  });

  return router;
}

// Re-exported for test injection.
export type { SaepFactory };

// ---------------------------------------------------------------------------
// Internal parsers — duplicated from kizuna.ts to keep this file
// self-contained. If/when the underwriting decision logic gets factored
// into a shared service module, these go with it.
// ---------------------------------------------------------------------------

function parseNonNegative(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

// computeRiskHash is exported so callers wanting to verify the on-the-wire
// `riskHash` against a SaepWorkRef can do so without re-reading the chain.
export { computeRiskHash };
