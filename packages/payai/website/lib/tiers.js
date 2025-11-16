/**
 * Subscription Tier Utilities for Kamiyo
 *
 * Provides consistent tier checking and comparison functions
 * to ensure proper access control across the application.
 */

/**
 * Tier names enum
 */
export const TierName = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  ENTERPRISE: 'enterprise'
};

/**
 * Tier hierarchy (higher number = higher tier)
 */
const TIER_HIERARCHY = {
  [TierName.FREE]: 0,
  [TierName.PRO]: 1,
  [TierName.TEAM]: 2,
  [TierName.ENTERPRISE]: 3
};

/**
 * Tier feature limits
 */
export const TIER_LIMITS = {
  [TierName.FREE]: {
    webhooks: 0,
    seats: 1,
    apiRequestsPerDay: 100,
    historicalDataDays: 7,
    realTimeAlerts: false
  },
  [TierName.PRO]: {
    webhooks: 0,
    seats: 1,
    apiRequestsPerDay: 50000,
    historicalDataDays: 90,
    realTimeAlerts: true
  },
  [TierName.TEAM]: {
    webhooks: 5,
    seats: 5,
    apiRequestsPerDay: 200000,
    historicalDataDays: 365,
    realTimeAlerts: true
  },
  [TierName.ENTERPRISE]: {
    webhooks: 50,
    seats: 999,
    apiRequestsPerDay: 999999,
    historicalDataDays: 36500,
    realTimeAlerts: true
  }
};

/**
 * Check if a user has at least the minimum required tier
 *
 * @param {string} userTier - User's current tier
 * @param {string} requiredTier - Minimum tier required
 * @returns {boolean} True if user has sufficient tier
 *
 * @example
 * hasMinimumTier('enterprise', 'team') // true (enterprise >= team)
 * hasMinimumTier('free', 'pro') // false (free < pro)
 */
export function hasMinimumTier(userTier, requiredTier) {
  if (!userTier || !requiredTier) {
    return false;
  }

  const userLevel = TIER_HIERARCHY[userTier.toLowerCase()];
  const requiredLevel = TIER_HIERARCHY[requiredTier.toLowerCase()];

  // If tier not found, default to requiring upgrade
  if (userLevel === undefined || requiredLevel === undefined) {
    return false;
  }

  return userLevel >= requiredLevel;
}

/**
 * Compare two tiers
 *
 * @param {string} tierA - First tier
 * @param {string} tierB - Second tier
 * @returns {number} -1 if tierA < tierB, 0 if equal, 1 if tierA > tierB
 */
export function compareTiers(tierA, tierB) {
  const levelA = TIER_HIERARCHY[tierA?.toLowerCase()] ?? 0;
  const levelB = TIER_HIERARCHY[tierB?.toLowerCase()] ?? 0;

  if (levelA < levelB) return -1;
  if (levelA > levelB) return 1;
  return 0;
}

/**
 * Check if a tier change is an upgrade
 *
 * @param {string} fromTier - Current tier
 * @param {string} toTier - Target tier
 * @returns {boolean} True if upgrade
 */
export function isUpgrade(fromTier, toTier) {
  return compareTiers(fromTier, toTier) < 0;
}

/**
 * Check if a tier change is a downgrade
 *
 * @param {string} fromTier - Current tier
 * @param {string} toTier - Target tier
 * @returns {boolean} True if downgrade
 */
export function isDowngrade(fromTier, toTier) {
  return compareTiers(fromTier, toTier) > 0;
}

/**
 * Get feature limits for a specific tier
 *
 * @param {string} tier - Tier name
 * @returns {object} Feature limits for the tier
 */
export function getTierLimits(tier) {
  return TIER_LIMITS[tier?.toLowerCase()] ?? TIER_LIMITS[TierName.FREE];
}

/**
 * Check if a tier has a specific feature
 *
 * @param {string} tier - Tier name
 * @param {string} feature - Feature name
 * @returns {boolean} True if tier has the feature
 */
export function hasFeature(tier, feature) {
  const limits = getTierLimits(tier);

  // Feature flags
  const features = {
    'fork-analysis': hasMinimumTier(tier, TierName.TEAM),
    'pattern-clustering': hasMinimumTier(tier, TierName.TEAM),
    'anomaly-detection': hasMinimumTier(tier, TierName.ENTERPRISE),
    'fork-graph': hasMinimumTier(tier, TierName.ENTERPRISE),
    'watchlists': hasMinimumTier(tier, TierName.ENTERPRISE),
    'webhooks': limits.webhooks > 0,
    'slack': hasMinimumTier(tier, TierName.TEAM),
    'real-time': limits.realTimeAlerts,
    'websocket': hasMinimumTier(tier, TierName.PRO),
    'feature-extraction': hasMinimumTier(tier, TierName.PRO)
  };

  return features[feature] ?? false;
}

/**
 * Get human-readable error message for insufficient tier
 *
 * @param {string} requiredTier - Minimum tier required
 * @returns {string} Error message
 */
export function getTierErrorMessage(requiredTier) {
  const tierName = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
  return `${tierName} tier or higher required for this feature`;
}

/**
 * Normalize tier string to lowercase
 *
 * @param {string} tier - Tier name
 * @returns {string} Normalized tier name
 */
export function normalizeTier(tier) {
  return tier?.toLowerCase() || TierName.FREE;
}
