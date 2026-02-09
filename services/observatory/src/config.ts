export type ObservatoryConfig = {
  port: number;
  dbPath: string;
  webhookSecret?: string;
  programId?: string;
  maxBodyBytes: number;
};

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ObservatoryConfig {
  const port = envInt(env, 'PORT', 8787);
  const maxBodyBytes = envInt(env, 'MAX_BODY_BYTES', 5_000_000);

  return {
    port,
    maxBodyBytes,
    dbPath: env.OBS_DB_PATH ?? 'data/observatory/observatory.db',
    webhookSecret: env.HELIUS_WEBHOOK_SECRET ?? env.WEBHOOK_SECRET ?? undefined,
    programId: env.OBS_PROGRAM_ID ?? undefined,
  };
}

