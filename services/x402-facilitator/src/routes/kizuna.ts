import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  applyKizunaFundingEvent,
  applyKizunaCollateralEvent,
  applyKizunaRepayment,
  getKizunaCollateralPosition,
  getKizunaCollateralSummary,
  getKizunaAccount,
  getKizunaEnterpriseBalance,
  getKizunaLatestHealthSnapshot,
  getKizunaOutstandingMicro,
  getKizunaPool,
  listKizunaFundingEvents,
  listKizunaTransactions,
  listKizunaCollateralPositions,
  upsertKizunaAccount,
} from '../db/queries';
import { getConfig } from '../config';
import { debitKizunaCredits, getKizunaCreditsBalance } from '../services/kizuna-credits';
import { getKizunaMandateLimits, syncKizunaMandate } from '../services/kizuna-wallet-control-plane';
import { ingestKizunaKernelCollateral, ingestKizunaKernelRepayment } from '../services/kizuna-kernel';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveMicro(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return BigInt(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const parsed = BigInt(trimmed);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseLane(value: unknown): 'enterprise' | 'crypto-fast' | null {
  const lane = asString(value);
  if (!lane) return 'enterprise';
  if (lane === 'enterprise' || lane === 'crypto-fast') return lane;
  return null;
}

function resolvePoolId(
  lane: 'enterprise' | 'crypto-fast',
  requestedPoolId: unknown,
  config = getConfig()
): string {
  const override = asString(requestedPoolId);
  if (override) return override;
  return lane === 'crypto-fast' ? config.KIZUNA_FASTPATH_POOL_ID : config.KIZUNA_ENTERPRISE_POOL_ID;
}

function toApiAccount(account: Awaited<ReturnType<typeof getKizunaAccount>>) {
  if (!account) return null;
  return {
    id: account.id,
    agentId: account.agent_id,
    payerWallet: account.payer_wallet,
    repayWallet: account.repay_wallet,
    passportAddress: account.passport_address,
    networks: Array.isArray(account.networks) ? account.networks : [],
    status: account.status,
    mandate: {
      singleLimitMicro: account.mandate_single_limit_micro,
      dailyLimitMicro: account.mandate_daily_limit_micro,
      monthlyLimitMicro: account.mandate_monthly_limit_micro,
      humanApprovalMicro: account.mandate_human_approval_micro,
    },
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

export function createKizunaRouter(): Router {
  const router = Router();

  router.post('/accounts/onboard', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.body?.agentId);
    const payerWallet = asString(req.body?.payerWallet);
    const repayWallet = asString(req.body?.repayWallet);
    const passportAddress = asString(req.body?.passportAddress) || null;

    if (!agentId || !payerWallet || !repayWallet) {
      sendError(res, 400, 'agentId, payerWallet, and repayWallet are required');
      return;
    }

    const requestedNetworks = Array.isArray(req.body?.networks)
      ? req.body.networks
          .map((value: unknown) => asString(value))
          .filter((value: string) => value === 'solana' || value === 'base')
      : [];
    const networks = requestedNetworks.length > 0 ? requestedNetworks : ['solana', 'base'];

    try {
      await syncKizunaMandate({
        agentId,
        passportAddress,
        networks: networks as Array<'base' | 'solana'>,
      });

      const limits = await getKizunaMandateLimits(agentId);
      if (!limits) {
        sendError(res, 404, 'No active mandate limits found for agent');
        return;
      }

      const account = await upsertKizunaAccount({
        agentId,
        payerWallet,
        repayWallet,
        passportAddress: limits.passportAddress,
        networks,
        mandateSingleLimitMicro: limits.caps.singleMicro,
        mandateDailyLimitMicro: limits.caps.dailyMicro,
        mandateMonthlyLimitMicro: limits.caps.monthlyMicro,
        mandateHumanApprovalMicro: limits.caps.humanApprovalMicro,
      });

      const outstandingMicro = await getKizunaOutstandingMicro(agentId);

      res.status(201).json({
        account: toApiAccount(account),
        outstandingMicro: outstandingMicro.toString(10),
        mandate: limits,
      });
    } catch (err) {
      sendError(res, 502, err instanceof Error ? err.message : 'Kizuna onboarding failed');
    }
  });

  router.get('/accounts/:agentId', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    if (!agentId) {
      sendError(res, 400, 'agentId is required');
      return;
    }

    const account = await getKizunaAccount(agentId);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }

    const [outstandingMicro, enterpriseBalance] = await Promise.all([
      getKizunaOutstandingMicro(agentId),
      getKizunaEnterpriseBalance(agentId, config.KIZUNA_ENTERPRISE_POOL_ID),
    ]);

    let creditsBalanceMicro: string | null = null;
    try {
      creditsBalanceMicro = (await getKizunaCreditsBalance(account.repay_wallet)).toString(10);
    } catch {
      creditsBalanceMicro = null;
    }

    res.json({
      account: toApiAccount(account),
      outstandingMicro: outstandingMicro.toString(10),
      creditsBalanceMicro,
      enterpriseBalance,
    });
  });

  router.get('/accounts/:agentId/transactions', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    if (!agentId) {
      sendError(res, 400, 'agentId is required');
      return;
    }

    const limitRaw = parseInt(asString(req.query.limit), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

    const [account, transactions] = await Promise.all([
      getKizunaAccount(agentId),
      listKizunaTransactions(agentId, limit),
    ]);

    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }

    res.json({
      agentId,
      count: transactions.length,
      transactions,
    });
  });

  router.post('/accounts/:agentId/repay', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const source = asString(req.body?.source);
    const referenceId = asString(req.body?.referenceId);
    const requestedMicro = parsePositiveMicro(req.body?.amountMicro);
    const lane = parseLane(req.body?.lane);

    if (!lane) {
      sendError(res, 400, 'lane must be enterprise or crypto-fast');
      return;
    }

    if (!agentId || !referenceId || !requestedMicro) {
      sendError(res, 400, 'agentId, amountMicro, and referenceId are required');
      return;
    }

    if (source !== 'credits') {
      sendError(res, 400, 'Only source=credits is supported');
      return;
    }

    const account = await getKizunaAccount(agentId);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const outstandingMicro = await getKizunaOutstandingMicro(agentId, { lane, poolId });
    if (outstandingMicro <= 0n) {
      res.json({
        ok: true,
        idempotent: false,
        debitedMicro: '0',
        appliedMicro: '0',
        outstandingMicro: '0',
        referenceId,
      });
      return;
    }

    const debitMicro = requestedMicro < outstandingMicro ? requestedMicro : outstandingMicro;

    try {
      const debitResult = await debitKizunaCredits({
        wallet: account.repay_wallet,
        amountMicro: debitMicro.toString(10),
        referenceId,
      });

      const repayment = await applyKizunaRepayment({
        agentId,
        source: 'credits',
        amountMicro: debitResult.debitedMicro,
        referenceId,
        lane,
        poolId,
      });

      let kernelIngested = false;
      let kernelIngestError: string | null = null;
      try {
        await ingestKizunaKernelRepayment({
          agentId,
          lane,
          poolId,
          referenceId,
          amountMicro: debitResult.debitedMicro,
          appliedMicro: repayment.repayment.applied_micro,
        });
        kernelIngested = true;
      } catch (err) {
        kernelIngestError = err instanceof Error ? err.message : 'kernel_repayment_ingest_failed';
      }

      res.json({
        ok: true,
        idempotent: debitResult.idempotent || repayment.idempotent,
        debitedMicro: debitResult.debitedMicro,
        appliedMicro: repayment.repayment.applied_micro,
        outstandingMicro: repayment.outstandingMicro,
        balanceMicro: debitResult.balanceMicro,
        referenceId,
        lane,
        poolId,
        kernelIngested,
        kernelIngestError,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'repayment_failed';
      if (message.includes('INSUFFICIENT_BALANCE') || message.includes('insufficient')) {
        sendError(res, 409, message);
        return;
      }
      sendError(res, 502, message);
    }
  });

  router.post('/funding/:agentId/deposit-intent', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane) || 'enterprise';
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);
    if (!agentId || !amountMicro) {
      sendError(res, 400, 'agentId and amountMicro are required');
      return;
    }
    if (lane !== 'enterprise') {
      sendError(res, 400, 'Funding APIs are enterprise lane only');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool || pool.lane !== 'enterprise') {
      sendError(res, 404, 'Enterprise pool not found');
      return;
    }

    res.status(201).json({
      intentId: randomUUID(),
      agentId,
      lane,
      poolId,
      amountMicro: amountMicro.toString(10),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  });

  router.post('/funding/:agentId/confirm', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane) || 'enterprise';
    const referenceId = asString(req.body?.referenceId);
    const txHash = asString(req.body?.txHash) || null;
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);
    if (!agentId || !referenceId || !amountMicro) {
      sendError(res, 400, 'agentId, amountMicro, and referenceId are required');
      return;
    }
    if (lane !== 'enterprise') {
      sendError(res, 400, 'Funding APIs are enterprise lane only');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool || pool.lane !== 'enterprise') {
      sendError(res, 404, 'Enterprise pool not found');
      return;
    }

    try {
      const result = await applyKizunaFundingEvent({
        agentId,
        lane,
        poolId,
        referenceId,
        eventType: 'deposit',
        amountMicro: amountMicro.toString(10),
        txHash,
      });

      res.json({
        ok: true,
        idempotent: result.idempotent,
        lane,
        poolId,
        event: result.event,
        balance: result.balance,
      });
    } catch (err) {
      sendError(res, 409, err instanceof Error ? err.message : 'kizuna_funding_confirm_failed');
    }
  });

  router.get('/funding/:agentId', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    if (!agentId) {
      sendError(res, 400, 'agentId is required');
      return;
    }

    const lane = parseLane(req.query.lane) || 'enterprise';
    if (lane !== 'enterprise') {
      sendError(res, 400, 'Funding APIs are enterprise lane only');
      return;
    }

    const poolId = resolvePoolId(lane, req.query.poolId, config);
    const limitRaw = parseInt(asString(req.query.limit), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

    const [account, balance, events] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaEnterpriseBalance(agentId, poolId),
      listKizunaFundingEvents(agentId, limit, poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }

    res.json({
      agentId,
      lane,
      poolId,
      balance: balance || {
        agent_id: agentId,
        pool_id: poolId,
        available_micro: '0',
        reserved_micro: '0',
        spent_micro: '0',
        updated_at: new Date(0),
      },
      events,
      count: events.length,
    });
  });

  router.post('/funding/:agentId/withdraw', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane) || 'enterprise';
    const referenceId = asString(req.body?.referenceId);
    const txHash = asString(req.body?.txHash) || null;
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);
    if (!agentId || !referenceId || !amountMicro) {
      sendError(res, 400, 'agentId, amountMicro, and referenceId are required');
      return;
    }
    if (lane !== 'enterprise') {
      sendError(res, 400, 'Funding APIs are enterprise lane only');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool || pool.lane !== 'enterprise') {
      sendError(res, 404, 'Enterprise pool not found');
      return;
    }

    try {
      const result = await applyKizunaFundingEvent({
        agentId,
        lane,
        poolId,
        referenceId,
        eventType: 'withdraw',
        amountMicro: amountMicro.toString(10),
        txHash,
      });

      res.json({
        ok: true,
        idempotent: result.idempotent,
        lane,
        poolId,
        event: result.event,
        balance: result.balance,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'kizuna_funding_withdraw_failed';
      if (message.includes('insufficient')) {
        sendError(res, 409, message);
        return;
      }
      sendError(res, 409, message);
    }
  });

  router.post('/collateral/:agentId/deposit-intent', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane);
    if (!agentId || !lane) {
      sendError(res, 400, 'agentId and lane are required');
      return;
    }

    const collateralAccount = asString(req.body?.collateralAccount);
    const assetId = asString(req.body?.assetId) || 'usdc';
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);
    const poolId = resolvePoolId(lane, req.body?.poolId, config);

    if (config.KIZUNA_SECURED_ONLY && lane !== 'crypto-fast') {
      sendError(res, 403, 'Enterprise lane is disabled in secured-only mode');
      return;
    }
    if (assetId !== 'usdc') {
      sendError(res, 400, 'Only USDC collateral is supported');
      return;
    }

    if (!collateralAccount || !amountMicro) {
      sendError(res, 400, 'collateralAccount and amountMicro are required');
      return;
    }

    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool) {
      sendError(res, 404, 'Kizuna pool not found');
      return;
    }

    res.status(201).json({
      intentId: randomUUID(),
      agentId,
      lane,
      poolId,
      collateralAccount,
      assetId,
      amountMicro: amountMicro.toString(10),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  });

  router.post('/collateral/:agentId/confirm', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane);
    const collateralAccount = asString(req.body?.collateralAccount);
    const assetId = asString(req.body?.assetId) || 'usdc';
    const referenceId = asString(req.body?.referenceId);
    const txHash = asString(req.body?.txHash) || null;
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);
    if (!agentId || !lane || !collateralAccount || !referenceId || !amountMicro) {
      sendError(res, 400, 'agentId, lane, collateralAccount, amountMicro, and referenceId are required');
      return;
    }
    if (config.KIZUNA_SECURED_ONLY && lane !== 'crypto-fast') {
      sendError(res, 403, 'Enterprise lane is disabled in secured-only mode');
      return;
    }
    if (assetId !== 'usdc') {
      sendError(res, 400, 'Only USDC collateral is supported');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool) {
      sendError(res, 404, 'Kizuna pool not found');
      return;
    }

    try {
      const event = await applyKizunaCollateralEvent({
        agentId,
        lane,
        poolId,
        collateralAccount,
        assetId,
        amountMicro: amountMicro.toString(10),
        eventType: 'deposit',
        referenceId,
        txHash,
      });

      let kernelIngested = false;
      let kernelIngestError: string | null = null;
      try {
        await ingestKizunaKernelCollateral({
          agentId,
          lane,
          poolId,
          collateralAccount,
          assetId,
          amountMicro: amountMicro.toString(10),
          eventType: 'deposit',
          referenceId,
        });
        kernelIngested = true;
      } catch (err) {
        kernelIngestError = err instanceof Error ? err.message : 'kernel_collateral_ingest_failed';
      }

      res.json({
        ok: true,
        idempotent: event.idempotent,
        lane,
        poolId,
        position: event.position,
        poolReserve: event.poolReserve,
        health: {
          ltvBps: event.summary.ltvBps,
          healthFactor: event.summary.healthFactor,
          effectiveCollateralMicro: event.summary.effectiveCollateralMicro,
          outstandingMicro: event.summary.outstandingMicro,
        },
        referenceId,
        kernelIngested,
        kernelIngestError,
      });
    } catch (err) {
      sendError(res, 409, err instanceof Error ? err.message : 'kizuna_collateral_confirm_failed');
    }
  });

  router.get('/collateral/:agentId', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    if (!agentId) {
      sendError(res, 400, 'agentId is required');
      return;
    }

    const account = await getKizunaAccount(agentId);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }

    const poolId = asString(req.query.poolId);
    const positions = await listKizunaCollateralPositions(agentId, poolId || undefined);
    const summary = poolId ? await getKizunaCollateralSummary(agentId, poolId) : null;
    const latestHealth = poolId ? await getKizunaLatestHealthSnapshot(agentId, poolId) : null;

    res.json({
      agentId,
      poolId: poolId || null,
      positions,
      summary,
      latestHealth,
      count: positions.length,
    });
  });

  router.post('/collateral/:agentId/withdraw', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const agentId = asString(req.params.agentId);
    const lane = parseLane(req.body?.lane);
    const collateralAccount = asString(req.body?.collateralAccount);
    const assetId = asString(req.body?.assetId) || 'usdc';
    const referenceId = asString(req.body?.referenceId);
    const amountMicro = parsePositiveMicro(req.body?.amountMicro);

    if (!agentId || !lane || !collateralAccount || !referenceId || !amountMicro) {
      sendError(res, 400, 'agentId, lane, collateralAccount, amountMicro, and referenceId are required');
      return;
    }
    if (config.KIZUNA_SECURED_ONLY && lane !== 'crypto-fast') {
      sendError(res, 403, 'Enterprise lane is disabled in secured-only mode');
      return;
    }
    if (assetId !== 'usdc') {
      sendError(res, 400, 'Only USDC collateral is supported');
      return;
    }

    const poolId = resolvePoolId(lane, req.body?.poolId, config);
    const [account, pool] = await Promise.all([
      getKizunaAccount(agentId),
      getKizunaPool(poolId),
    ]);
    if (!account) {
      sendError(res, 404, 'Kizuna account not found');
      return;
    }
    if (!pool) {
      sendError(res, 404, 'Kizuna pool not found');
      return;
    }

    if (lane === 'crypto-fast') {
      const [summary, position] = await Promise.all([
        getKizunaCollateralSummary(agentId, poolId),
        getKizunaCollateralPosition({ agentId, poolId, collateralAccount }),
      ]);
      if (!summary || !position) {
        sendError(res, 409, 'kizuna_collateral_position_missing');
        return;
      }

      const asset = position.assets.find((entry) => entry.assetId === assetId);
      if (!asset) {
        sendError(res, 409, 'kizuna_collateral_asset_missing');
        return;
      }

      const assetAvailable = BigInt(asset.availableMicro);
      if (amountMicro > assetAvailable) {
        sendError(res, 409, 'kizuna_collateral_withdraw_insufficient_available');
        return;
      }

      const effectiveAvailable = BigInt(asset.effectiveCollateralMicro);
      const effectiveWithdraw =
        assetAvailable > 0n
          ? (amountMicro * effectiveAvailable) / assetAvailable
          : (amountMicro * BigInt(10_000 - config.KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS)) / 10_000n;
      const summaryEffective = BigInt(summary.effectiveCollateralMicro);
      const summaryOutstanding = BigInt(summary.outstandingMicro);
      const nextEffective = summaryEffective > effectiveWithdraw ? summaryEffective - effectiveWithdraw : 0n;
      const ltvCapBps = pool.ltvCapBps || config.KIZUNA_FASTPATH_LTV_CAP_BPS;
      const minHealthFactor = Number(pool.minHealthFactor || config.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR);
      const predictedHealth =
        summaryOutstanding > 0n
          ? (Number(nextEffective) * ltvCapBps) / (Number(summaryOutstanding) * 10_000)
          : 9999;

      if (predictedHealth < minHealthFactor) {
        sendError(res, 409, `kizuna_health_factor_unsafe:${predictedHealth.toFixed(4)}<${minHealthFactor}`);
        return;
      }
    }

    try {
      const event = await applyKizunaCollateralEvent({
        agentId,
        lane,
        poolId,
        collateralAccount,
        assetId,
        amountMicro: amountMicro.toString(10),
        eventType: 'withdraw',
        referenceId,
      });

      let kernelIngested = false;
      let kernelIngestError: string | null = null;
      try {
        await ingestKizunaKernelCollateral({
          agentId,
          lane,
          poolId,
          collateralAccount,
          assetId,
          amountMicro: amountMicro.toString(10),
          eventType: 'withdraw',
          referenceId,
        });
        kernelIngested = true;
      } catch (err) {
        kernelIngestError = err instanceof Error ? err.message : 'kernel_collateral_ingest_failed';
      }

      res.json({
        ok: true,
        idempotent: event.idempotent,
        lane,
        poolId,
        position: event.position,
        poolReserve: event.poolReserve,
        health: event.summary,
        referenceId,
        kernelIngested,
        kernelIngestError,
      });
    } catch (err) {
      sendError(res, 409, err instanceof Error ? err.message : 'kizuna_collateral_withdraw_failed');
    }
  });

  router.get('/pools/:poolId', async (req: Request, res: Response) => {
    const config = getConfig();
    if (!config.KIZUNA_ENABLED) {
      sendError(res, 404, 'Kizuna is disabled');
      return;
    }

    const poolId = asString(req.params.poolId);
    if (!poolId) {
      sendError(res, 400, 'poolId is required');
      return;
    }

    const pool = await getKizunaPool(poolId);
    if (!pool) {
      sendError(res, 404, 'Kizuna pool not found');
      return;
    }

    res.json({ pool });
  });

  return router;
}
