export type MeishiModule = Record<string, unknown>;

const dynamicImport = new Function(
  'specifier',
  'return import(specifier);'
) as (specifier: string) => Promise<unknown>;

/**
 * Load @kamiyo/meishi lazily to avoid CJS -> ESM require() mismatch
 * when @kamiyo/sdk is consumed from CommonJS entry points.
 */
export async function loadMeishi(): Promise<MeishiModule> {
  return (await dynamicImport('@kamiyo/meishi')) as MeishiModule;
}
