/**
 * `/kizuna/adapters/saep/*` routes — KAMIYO underwriting for SAEP task-market
 * activity. KAMIYO never signs SAEP transactions; this surface reads SAEP
 * state (via `@kamiyo/saep-adapter`) and runs the crypto-fast Kizuna lane.
 *
 * Sprint W3 surface:
 *   POST /kizuna/adapters/saep/underwrite
 *   GET  /kizuna/adapters/saep/reservations/:id
 *
 * Sprint W4 surface:
 *   POST /kizuna/adapters/saep/settlement-ingest
 *
 * Sprint W5 surface (operator views, internal-auth gated):
 *   GET  /kizuna/adapters/saep/health
 *   GET  /kizuna/adapters/saep/decisions/:reservationId
 *   GET  /kizuna/adapters/saep/snapshots/:taskPda
 *
 * As of W5 the underwrite decision row persists the SAEP `externalWorkRef`,
 * so settlement-ingest can resolve `taskPda` and `cluster` from
 * `reservationId` alone. The legacy explicit `taskPda` / `cluster` body params
 * still win when supplied.
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
  finalizeKizunaSettlement,
  getKizunaAccount,
  getKizunaBillableSettlementEvent,
  getKizunaDebtByReservationId,
  getKizunaDecisionByReservationId,
  getKizunaLatestHealthSnapshot,
  getKizunaOutstandingMicro,
  getKizunaReservationById,
  getKizunaReservationByNonce,
  insertKizunaUnderwriteDecision,
  insertSettlement,
  releaseKizunaReservation,
} from '../db/queries';
import { isTerminal, SaepTaskStatus } from '@kamiyo/saep-adapter';

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
  // Pluck reasonCodes off the extra payload so the route metric picks them up
  // automatically — handlers don't need to tag separately at every error site.
  if (extra && Array.isArray(extra.reasonCodes)) {
    tagSaepEvent(res, { reasonCodes: extra.reasonCodes as string[] });
  }
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
// Structured metrics — one ndjson line per request. Mirrors the autopilot
// `[autopilot-metric]` pattern so downstream log shippers can match on
// the prefix without a new logging dep.
// ---------------------------------------------------------------------------

interface SaepRouteMetricTags {
  reservationId?: string;
  agentId?: string;
  reasonCodes?: string[];
  cluster?: SolanaCluster;
}

/**
 * Stash metric tags on `res.locals` for the route metric to pick up at finish.
 * Tolerates missing `res.locals` (the test harness uses a bare mock).
 */
function tagSaepEvent(res: Response, tags: SaepRouteMetricTags): void {
  const bag =
    (res.locals as Record<string, unknown> | undefined) ??
    ((res as unknown as { locals: Record<string, unknown> }).locals = {});
  bag.saepRouteTags = { ...((bag.saepRouteTags as object) ?? {}), ...tags };
}

function emitSaepRouteMetric(
  route: string,
  status: number,
  durationMs: number,
  res: Response
): void {
  const tags =
    ((res.locals as Record<string, unknown> | undefined)?.saepRouteTags as SaepRouteMetricTags) ??
    {};
  const outcome = status < 400 ? 'ok' : status < 500 ? 'reject' : 'error';
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    route,
    status,
    durationMs,
    outcome,
  };
  if (tags.reservationId) payload.reservationId = tags.reservationId;
  if (tags.agentId) payload.agentId = tags.agentId;
  if (tags.reasonCodes && tags.reasonCodes.length > 0) payload.reasonCodes = tags.reasonCodes;
  if (tags.cluster) payload.cluster = tags.cluster;
  console.log(`[saep-route-metric] ${JSON.stringify(payload)}`);
}

function withSaepMetrics(
  route: string,
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response) => {
    const start = Date.now();
    try {
      await handler(req, res);
    } finally {
      emitSaepRouteMetric(route, res.statusCode || 200, Date.now() - start, res);
    }
  };
}

/**
 * JSON-friendly view of a {@link SaepTaskSnapshot}. PublicKeys → base58, BN →
 * decimal string, Uint8Array → lowercase hex. Used by the operator
 * `/snapshots/:taskPda` route so callers can read the snapshot without
 * wrangling the binary types.
 */
function serializeSnapshot(snapshot: SaepTaskSnapshot): Record<string, unknown> {
  const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
  return {
    cluster: snapshot.cluster,
    slot: snapshot.slot,
    decodedAtMs: snapshot.decodedAtMs,
    taskPda: snapshot.taskPda.toBase58(),
    taskId: hex(snapshot.taskId),
    client: snapshot.client.toBase58(),
    agentDid: hex(snapshot.agentDid),
    assignedAgent: snapshot.assignedAgent ? snapshot.assignedAgent.toBase58() : null,
    paymentMint: snapshot.paymentMint.toBase58(),
    paymentAmount: snapshot.paymentAmount.toString(10),
    protocolFee: snapshot.protocolFee.toString(10),
    solrepFee: snapshot.solrepFee.toString(10),
    taskHash: hex(snapshot.taskHash),
    resultHash: hex(snapshot.resultHash),
    proofKey: hex(snapshot.proofKey),
    criteriaRoot: hex(snapshot.criteriaRoot),
    milestoneCount: snapshot.milestoneCount,
    milestonesComplete: snapshot.milestonesComplete,
    status: snapshot.status,
    createdAt: snapshot.createdAt,
    fundedAt: snapshot.fundedAt,
    deadline: snapshot.deadline,
    submittedAt: snapshot.submittedAt,
    disputeWindowEnd: snapshot.disputeWindowEnd,
    verified: snapshot.verified,
  };
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
  router.post(
    '/underwrite',
    withSaepMetrics('POST /underwrite', async (req: Request, res: Response) => {
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

      tagSaepEvent(res, { agentId, cluster });

      let taskPda: PublicKey;
      try {
        taskPda = new PublicKey(taskPdaStr);
      } catch {
        sendError(res, 400, 'taskPda is not a valid Solana address');
        return;
      }

      try {
        // 1. Idempotency: replay -> return the existing reservation. Shape
        //    matches the first-call response so callers can pipeline replays
        //    without branching on the `replay` flag.
        const replay = await getKizunaReservationByNonce(payerWallet, idempotencyKey);
        if (replay) {
          tagSaepEvent(res, { reservationId: replay.id });
          res.json({
            escrowRef: replay.id,
            decisionId: replay.decision.id,
            lane: replay.lane,
            poolId: replay.pool_id,
            amountMicro: replay.amount_micro,
            fundingMode: replay.funding_mode,
            status: replay.status,
            taskRef: replay.decision.external_work_ref,
            riskHash: replay.decision.decision_envelope_hash,
            collateralAccount,
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
          validateForUnderwriting(
            snapshot,
            { nowSec: Math.floor(Date.now() / 1000) },
            saep.policy()
          );
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
          externalWorkRef: workRef,
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

        tagSaepEvent(res, { reservationId: reservation.id });

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
    })
  );

  // --------------------------------------------------------------------
  // POST /settlement-ingest
  // --------------------------------------------------------------------
  // Finalize Kizuna settlement state from a SAEP release/proof reference.
  // KAMIYO never signs the release on-chain — this route ingests the
  // *result* of the SAEP-side release/expire and updates Kizuna's debt,
  // receipt, and billable-event state accordingly.
  //
  // Idempotent on (reservationId): a repeated call returns the original
  // settlement record without re-emitting debt or billable events.
  router.post(
    '/settlement-ingest',
    withSaepMetrics('POST /settlement-ingest', async (req: Request, res: Response) => {
      const config = getConfig();
      if (!config.KIZUNA_ENABLED) {
        sendError(res, 404, 'Kizuna is disabled');
        return;
      }
      if (!requireInternalToken(req, res)) return;

      const reservationId = asString(req.body?.reservationId);
      const taskPdaOverrideStr = asString(req.body?.taskPda); // optional override
      const clusterOverride = parseCluster(req.body?.cluster); // optional override
      const releaseSignature = asString(req.body?.releaseSignature);
      const merchantWalletOverride = asString(req.body?.merchantWallet); // optional

      if (!reservationId || !releaseSignature) {
        sendError(res, 400, 'reservationId and releaseSignature are required');
        return;
      }

      tagSaepEvent(res, {
        reservationId,
        ...(clusterOverride && { cluster: clusterOverride }),
      });

      try {
        // 1. Idempotency: existing settlement for this reservation -> return.
        const existingDebt = await getKizunaDebtByReservationId(reservationId);
        if (existingDebt?.settlement_id) {
          const existingBillable = await getKizunaBillableSettlementEvent(
            reservationId,
            existingDebt.settlement_id
          );
          res.json({
            settlementRef: existingDebt.settlement_id,
            debtId: existingDebt.id,
            billableEventId: existingBillable?.id ?? null,
            replay: true,
          });
          return;
        }

        // 2. Reservation must exist and be in `reserved` state.
        const reservation = await getKizunaReservationById(reservationId);
        if (!reservation) {
          sendError(res, 404, 'Reservation not found');
          return;
        }
        if (reservation.status !== 'reserved') {
          sendError(res, 409, `Reservation is ${reservation.status}`);
          return;
        }

        // 2b. Resolve taskPda + cluster. Preferred: read the persisted
        // externalWorkRef from the decision so callers don't have to repeat
        // SAEP coordinates. Explicit body params still win when supplied.
        const decision = await getKizunaDecisionByReservationId(reservationId);
        const persistedRef = decision?.external_work_ref ?? null;

        const taskPdaStr = taskPdaOverrideStr || asString(persistedRef?.taskPda);
        const cluster = clusterOverride || parseCluster(persistedRef?.cluster);

        if (!taskPdaStr || !cluster) {
          sendError(
            res,
            400,
            'taskPda and cluster could not be resolved from the decision; pass them explicitly',
            { reasonCodes: ['saep_external_work_ref_missing'] }
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

        // 3. Read the SAEP task. SAEP is the source of truth on terminal state.
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

        // 4. Reject if SAEP hasn't reached a terminal state.
        if (!isTerminal(snapshot.status)) {
          sendError(res, 409, 'SAEP task is not in a terminal state', {
            reasonCodes: ['saep_task_not_terminal'],
            status: snapshot.status,
          });
          return;
        }

        const workRef = normalizeSnapshot(snapshot);

        // 5. Branch on terminal kind.
        if (snapshot.status === SaepTaskStatus.Expired) {
          // Client refunded on chain; KAMIYO releases the reservation with
          // no debt and no billable event.
          await releaseKizunaReservation(reservationId, 'expired');
          res.json({
            settlementRef: null,
            debtId: null,
            billableEventId: null,
            terminalStatus: 'expired',
            taskRef: workRef,
          });
          return;
        }

        // Released or Resolved -> the agent earned the payout. Compute the
        // SAEP release math: agent_payout = payment_amount - protocol_fee - solrep_fee.
        const paymentAmount = BigInt(snapshot.paymentAmount.toString(10));
        const protocolFee = BigInt(snapshot.protocolFee.toString(10));
        const solrepFee = BigInt(snapshot.solrepFee.toString(10));
        const agentPayout = paymentAmount - protocolFee - solrepFee;
        if (agentPayout <= 0n) {
          sendError(res, 409, 'SAEP release math produced a non-positive payout', {
            reasonCodes: ['saep_release_math_invalid'],
          });
          return;
        }

        // 6. Resolve the merchant wallet — either explicit override or the
        //    SAEP `assigned_agent`. Without either we cannot record the
        //    settlement target.
        const merchantWallet =
          merchantWalletOverride ||
          (snapshot.assignedAgent ? snapshot.assignedAgent.toBase58() : '');
        if (!merchantWallet) {
          sendError(res, 400, 'merchantWallet is required when SAEP task has no assigned_agent', {
            reasonCodes: ['saep_no_assigned_agent'],
          });
          return;
        }

        // 7. Insert settlement + finalize Kizuna state.
        const settlement = await insertSettlement(
          merchantWallet,
          reservation.payer_wallet,
          Number(agentPayout),
          Number(protocolFee + solrepFee),
          workRef.paymentMint,
          releaseSignature,
          'confirmed',
          reservation.network
        );

        const settlementResult = await finalizeKizunaSettlement({
          reservationId,
          settlementId: settlement.id,
          txHash: releaseSignature,
          feeAmount: Number(protocolFee + solrepFee),
          feeTxHash: releaseSignature,
          lane: reservation.lane,
          poolId: reservation.pool_id,
          decisionEnvelopeHash: workRef.riskHash,
        });

        const billableEvent = await getKizunaBillableSettlementEvent(reservationId, settlement.id);

        res.json({
          settlementRef: settlement.id,
          debtId: settlementResult.debt?.id ?? null,
          billableEventId: billableEvent?.id ?? null,
          terminalStatus: workRef.status,
          agentPayoutMicro: agentPayout.toString(10),
          taskRef: workRef,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to ingest SAEP settlement';
        sendError(res, 500, message);
      }
    })
  );

  // --------------------------------------------------------------------
  // GET /reservations/:id
  // --------------------------------------------------------------------
  router.get(
    '/reservations/:id',
    withSaepMetrics('GET /reservations/:id', async (req: Request, res: Response) => {
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

      tagSaepEvent(res, { reservationId });

      try {
        const reservation = await getKizunaReservationById(reservationId);
        if (!reservation) {
          sendError(res, 404, 'Reservation not found');
          return;
        }

        const decision = await getKizunaDecisionByReservationId(reservationId);
        const debt = await getKizunaDebtByReservationId(reservationId);
        const health = await getKizunaLatestHealthSnapshot(
          reservation.agent_id,
          reservation.pool_id
        );

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
            id: decision?.id ?? null,
            envelopeHash: decision?.decision_envelope_hash ?? null,
          },
          taskRef: decision?.external_work_ref ?? null,
          debt: debt ?? null,
          health: health ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read reservation';
        sendError(res, 500, message);
      }
    })
  );

  // --------------------------------------------------------------------
  // GET /health — operator readiness probe (W5)
  // --------------------------------------------------------------------
  // Reports whether the SAEP routes are wired up: program id pinned, RPC
  // URLs configured per cluster, allowed payment mints set, and whether
  // the discriminator check is active. Does not call out to any RPC.
  router.get(
    '/health',
    withSaepMetrics('GET /health', async (req: Request, res: Response) => {
      if (!requireInternalToken(req, res)) return;
      const cfg = getConfig();
      const programIdConfigured = cfg.SAEP_TASK_MARKET_PROGRAM_ID.length > 0;
      res.json({
        kizunaEnabled: cfg.KIZUNA_ENABLED,
        programIdConfigured,
        programId: programIdConfigured ? cfg.SAEP_TASK_MARKET_PROGRAM_ID : null,
        discriminatorPinned: cfg.SAEP_TASK_DISCRIMINATOR_HEX.length > 0,
        allowedPaymentMints: cfg.SAEP_ALLOWED_PAYMENT_MINTS,
        clusters: {
          'mainnet-beta': { rpcConfigured: cfg.SOLANA_RPC_URL.length > 0 },
          devnet: { rpcConfigured: cfg.SAEP_RPC_URL_DEVNET.length > 0 },
        },
        // The route is "ready" when Kizuna is on AND the program id is pinned.
        // RPC reachability is not probed here; failures surface at request time
        // as `saep_rpc_unreachable`.
        ready: cfg.KIZUNA_ENABLED && programIdConfigured,
      });
    })
  );

  // --------------------------------------------------------------------
  // GET /decisions/:reservationId — operator decision-envelope inspection (W5)
  // --------------------------------------------------------------------
  // Returns the full underwrite decision row joined to the reservation by
  // reservation id. Internal use only — surfaces reason codes, score,
  // policy pack, envelope hash, and the persisted SAEP work-ref.
  router.get(
    '/decisions/:reservationId',
    withSaepMetrics('GET /decisions/:reservationId', async (req: Request, res: Response) => {
      const config = getConfig();
      if (!config.KIZUNA_ENABLED) {
        sendError(res, 404, 'Kizuna is disabled');
        return;
      }
      if (!requireInternalToken(req, res)) return;

      const reservationId = asString(req.params.reservationId);
      if (!reservationId) {
        sendError(res, 400, 'reservationId is required');
        return;
      }

      tagSaepEvent(res, { reservationId });

      try {
        const decision = await getKizunaDecisionByReservationId(reservationId);
        if (!decision) {
          sendError(res, 404, 'Decision not found for this reservation');
          return;
        }
        res.json({
          decision: {
            id: decision.id,
            agentId: decision.agent_id,
            payerWallet: decision.payer_wallet,
            repayWallet: decision.repay_wallet,
            requestNonce: decision.request_nonce,
            network: decision.network,
            lane: decision.lane,
            poolId: decision.pool_id,
            requestedMicro: decision.requested_micro,
            approved: decision.approved,
            approvedMicro: decision.approved_micro,
            availableMicro: decision.available_micro,
            outstandingMicro: decision.outstanding_micro,
            scoreRaw: decision.score_raw,
            reasonCodes: decision.reason_codes,
            tier: decision.tier,
            policyPackId: decision.policy_pack_id,
            policyPackVersion: decision.policy_pack_version,
            riskBand: decision.risk_band,
            riskAction: decision.risk_action,
            envelopeVersion: decision.envelope_version,
            envelopeHash: decision.decision_envelope_hash,
            createdAt: decision.created_at,
          },
          externalWorkRef: decision.external_work_ref,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read decision';
        sendError(res, 500, message);
      }
    })
  );

  // --------------------------------------------------------------------
  // GET /snapshots/:taskPda — raw decoded snapshot inspection (W5)
  // --------------------------------------------------------------------
  // Reads the SAEP `TaskContract` account and returns the decoded
  // snapshot + normalized work-ref + risk hash. Bypasses underwriting
  // validation — useful for ops debugging "why was this rejected".
  router.get(
    '/snapshots/:taskPda',
    withSaepMetrics('GET /snapshots/:taskPda', async (req: Request, res: Response) => {
      if (!requireInternalToken(req, res)) return;

      const taskPdaStr = asString(req.params.taskPda);
      const cluster = parseCluster(req.query.cluster) ?? 'mainnet-beta';

      if (!taskPdaStr) {
        sendError(res, 400, 'taskPda is required');
        return;
      }

      tagSaepEvent(res, { cluster });

      let taskPda: PublicKey;
      try {
        taskPda = new PublicKey(taskPdaStr);
      } catch {
        sendError(res, 400, 'taskPda is not a valid Solana address');
        return;
      }

      try {
        const reader = saep.readerFor(cluster);
        const snapshot = await reader.fetchTaskByPda(taskPda);
        const workRef = normalizeSnapshot(snapshot);
        res.json({
          cluster,
          taskPda: taskPda.toBase58(),
          snapshot: serializeSnapshot(snapshot),
          workRef,
          riskHash: workRef.riskHash,
        });
      } catch (err) {
        if (err instanceof SaepAdapterError) {
          const status = err.code === 'rpc_account_not_found' ? 404 : 503;
          sendError(res, status, err.message, {
            reasonCodes: reasonCodesForSaepError(err),
          });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to read SAEP snapshot';
        sendError(res, 500, message);
      }
    })
  );

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
