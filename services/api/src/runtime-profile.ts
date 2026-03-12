export type CompanionRuntimeProfile = 'kizuna-core' | 'full';
export type CompanionRouteSurface = 'kizuna-core' | 'full';
export type CompanionRuntimeOwnership = 'kizuna-core' | 'module' | 'legacy';
export type CompanionRouteOwnership = 'protected' | 'kizuna-core' | 'module' | 'legacy';

export interface CompanionRuntimeState {
  profile: CompanionRuntimeProfile;
  routeSurface: CompanionRouteSurface;
  backgroundOwnerships: CompanionRuntimeOwnership[];
  routeOwnerships: CompanionRouteOwnership[];
  moduleBackgroundsEnabled: boolean;
  legacyBackgroundsEnabled: boolean;
  moduleRoutesEnabled: boolean;
  legacyRoutesEnabled: boolean;
}

const DEFAULT_PROFILE: CompanionRuntimeProfile = 'kizuna-core';

export function resolveCompanionRuntimeProfile(
  value: string | undefined
): CompanionRuntimeProfile {
  return value === 'full' ? 'full' : DEFAULT_PROFILE;
}

export function resolveCompanionRouteSurface(
  value: string | undefined,
  profile: CompanionRuntimeProfile
): CompanionRouteSurface {
  if (profile !== 'full') {
    return DEFAULT_PROFILE;
  }

  return value === 'kizuna-core' ? 'kizuna-core' : 'full';
}

function getRouteOwnerships(routeSurface: CompanionRouteSurface): CompanionRouteOwnership[] {
  if (routeSurface === 'full') {
    return ['protected', 'kizuna-core', 'module', 'legacy'];
  }

  return ['protected', 'kizuna-core'];
}

export function getCompanionRuntimeState(
  env: NodeJS.ProcessEnv = process.env
): CompanionRuntimeState {
  const profile = resolveCompanionRuntimeProfile(env.COMPANION_RUNTIME_PROFILE);
  const routeSurface = resolveCompanionRouteSurface(env.COMPANION_ROUTE_SURFACE, profile);

  if (profile === 'full') {
    return {
      profile,
      routeSurface,
      backgroundOwnerships: ['kizuna-core', 'module', 'legacy'],
      routeOwnerships: getRouteOwnerships(routeSurface),
      moduleBackgroundsEnabled: true,
      legacyBackgroundsEnabled: true,
      moduleRoutesEnabled: routeSurface === 'full',
      legacyRoutesEnabled: routeSurface === 'full',
    };
  }

  return {
    profile,
    routeSurface,
    backgroundOwnerships: ['kizuna-core'],
    routeOwnerships: getRouteOwnerships(routeSurface),
    moduleBackgroundsEnabled: false,
    legacyBackgroundsEnabled: false,
    moduleRoutesEnabled: false,
    legacyRoutesEnabled: false,
  };
}
