import {
  COMPANY_UNIT_IDS,
  ensureCompanyDefaults,
  runCompanyHeartbeat,
  type CompanyUnitId,
} from '../src/company';

function parseUnits(argv: string[]): CompanyUnitId[] {
  const requested = argv
    .map((value) => value.trim())
    .filter((value): value is CompanyUnitId => COMPANY_UNIT_IDS.includes(value as CompanyUnitId));

  if (requested.length > 0) return requested;
  return ['delivery', 'payments', 'treasury'];
}

function remoteBaseUrl(): string {
  return (
    process.env.COMPANY_REMOTE_BASE_URL?.trim() ||
    process.env.COMPANION_INTERNAL_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
}

function internalToken(): string {
  return (
    process.env.COMPANY_INTERNAL_TOKEN?.trim() ||
    process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
    ''
  );
}

async function runRemoteHeartbeat(params: {
  unitId: CompanyUnitId;
  dryRun: boolean;
  idempotencyKey: string;
}) {
  const baseUrl = remoteBaseUrl();
  const token = internalToken();
  if (!baseUrl || !token) {
    throw new Error('remote_heartbeat_unconfigured');
  }

  const response = await fetch(`${baseUrl}/api/internal/company/heartbeats/${params.unitId}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      dryRun: params.dryRun,
      idempotencyKey: params.idempotencyKey,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string'
        ? (body as { error: string }).error
        : `company_http_${response.status}`;
    throw new Error(error);
  }

  return body;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const units = parseUnits(process.argv.slice(2).filter((value) => value !== '--dry-run'));
  const useRemote = remoteBaseUrl() !== '' && internalToken() !== '';
  if (!useRemote) {
    ensureCompanyDefaults();
  }

  const runs = await Promise.all(
    units.map((unitId) => {
      const idempotencyKey = `script:${unitId}:${new Date().toISOString().slice(0, 16)}`;
      if (useRemote) {
        return runRemoteHeartbeat({ unitId, dryRun, idempotencyKey });
      }
      return Promise.resolve(
        runCompanyHeartbeat(unitId, {
          dryRun,
          idempotencyKey,
        })
      );
    })
  );

  process.stdout.write(
    `${JSON.stringify({ ok: true, mode: useRemote ? 'remote' : 'local', dryRun, units, runs }, null, 2)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error instanceof Error ? error.message : error)}\n`);
  process.exit(1);
});
