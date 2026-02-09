export type ObservatoryConfig = {
  port: number;
  dbPath: string;
  webhookSecret?: string;
  adminSecret?: string;
  programId?: string;
  maxBodyBytes: number;
  heliusApiKey?: string;
  heliusCluster: 'mainnet-beta' | 'devnet';
};

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function envCluster(env: NodeJS.ProcessEnv): ObservatoryConfig['heliusCluster'] {
  const explicit = env.OBS_CLUSTER?.trim();
  if (explicit === 'devnet') return 'devnet';
  if (explicit === 'mainnet-beta') return 'mainnet-beta';

  const net = (env.KAMIYO_NETWORK ?? env.NETWORK ?? '').trim();
  if (net === 'devnet') return 'devnet';
  return 'mainnet-beta';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ObservatoryConfig {
  const port = envInt(env, 'PORT', 8787);
  const maxBodyBytes = envInt(env, 'MAX_BODY_BYTES', 5_000_000);
  const cluster = envCluster(env);
  const programId = env.OBS_PROGRAM_ID ?? env.ESCROW_PROGRAM_ID ?? undefined;

  return {
    port,
    maxBodyBytes,
    dbPath: env.OBS_DB_PATH ?? 'data/observatory/observatory.db',
    webhookSecret: env.HELIUS_WEBHOOK_SECRET ?? undefined,
    adminSecret: env.OBS_ADMIN_SECRET ?? undefined,
    programId,
    heliusApiKey: env.HELIUS_API_KEY ?? undefined,
    heliusCluster: cluster,
  };
}
