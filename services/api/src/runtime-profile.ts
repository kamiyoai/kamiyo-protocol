export type CompanionRuntimeProfile = 'kizuna-core' | 'full';
export type CompanionRuntimeOwnership = 'kizuna-core' | 'module' | 'legacy';

export interface CompanionRuntimeState {
  profile: CompanionRuntimeProfile;
  backgroundOwnerships: CompanionRuntimeOwnership[];
  moduleBackgroundsEnabled: boolean;
  legacyBackgroundsEnabled: boolean;
}

const DEFAULT_PROFILE: CompanionRuntimeProfile = 'kizuna-core';

export function resolveCompanionRuntimeProfile(
  value: string | undefined
): CompanionRuntimeProfile {
  return value === 'full' ? 'full' : DEFAULT_PROFILE;
}

export function getCompanionRuntimeState(
  env: NodeJS.ProcessEnv = process.env
): CompanionRuntimeState {
  const profile = resolveCompanionRuntimeProfile(env.COMPANION_RUNTIME_PROFILE);

  if (profile === 'full') {
    return {
      profile,
      backgroundOwnerships: ['kizuna-core', 'module', 'legacy'],
      moduleBackgroundsEnabled: true,
      legacyBackgroundsEnabled: true,
    };
  }

  return {
    profile,
    backgroundOwnerships: ['kizuna-core'],
    moduleBackgroundsEnabled: false,
    legacyBackgroundsEnabled: false,
  };
}
