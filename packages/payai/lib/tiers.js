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
    seats: 1,
    apiRequestsPerDay: 1000,
    historicalDataDays: 7,
    realTimeAlerts: false,
    websockets: false,
    sdkAccess: true,
    multipleApiKeys: false
  },
  [TierName.PRO]: {
    seats: 1,
    apiRequestsPerDay: 50000,
    historicalDataDays: 90,
    realTimeAlerts: true,
    websockets: true,
    sdkAccess: true,
    multipleApiKeys: false
  },
  [TierName.TEAM]: {
    seats: 5,
    apiRequestsPerDay: 100000,
    historicalDataDays: 365,
    realTimeAlerts: true,
    websockets: true,
    sdkAccess: true,
    multipleApiKeys: true
  },
  [TierName.ENTERPRISE]: {
    seats: 999,
    apiRequestsPerDay: 999999,
    historicalDataDays: 730,
    realTimeAlerts: true,
    websockets: true,
    sdkAccess: true,
    multipleApiKeys: true
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

  // Feature flags for x402 Payment Facilitator
  const features = {
    // Core x402 features
    'x402-payments': true, // All tiers support x402 pay-per-use
    'usdc-payments': true, // All tiers support USDC payments
    'no-account-required': true, // x402 doesn't require accounts

    // API & Integration features
    'websockets': limits.websockets,
    'javascript-sdk': limits.sdkAccess,
    'multiple-api-keys': limits.multipleApiKeys,

    // Analytics & Monitoring
    'usage-analytics': hasMinimumTier(tier, TierName.TEAM),
    'real-time-monitoring': limits.realTimeAlerts,

    // Support levels
    'email-support': hasMinimumTier(tier, TierName.PRO),
    'priority-support': hasMinimumTier(tier, TierName.TEAM),
    'dedicated-support': hasMinimumTier(tier, TierName.ENTERPRISE),

    // Enterprise features
    'custom-payment-integrations': hasMinimumTier(tier, TierName.ENTERPRISE),
    'sla-guarantee': hasMinimumTier(tier, TierName.ENTERPRISE),
    'dedicated-engineer': hasMinimumTier(tier, TierName.ENTERPRISE)
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
