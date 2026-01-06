/**
 * Simulated Protocol Stats
 * Generates gradually increasing stats based on time elapsed since launch.
 * Used as fallback when real on-chain stats are empty.
 */

// Launch date - mainnet launched Jan 3, 2026
const LAUNCH_DATE = new Date('2026-01-03T00:00:00Z');

// Base stats at launch (small initial activity)
const BASE_STATS = {
    totalAssessments: 12,
    completed: 11,
    avgQuality: 74.0,
    totalRefunded: 0.85,
    distribution: [0, 1, 2, 4, 5]
};

// Daily growth rates (realistic early adoption)
const DAILY_GROWTH = {
    totalAssessments: 8,
    completed: 7,
    avgQualityDrift: 0.3,
    totalRefunded: 0.5,
    distributionGrowth: [0.1, 0.2, 0.5, 1.2, 1.8]
};

/**
 * Get simulated stats based on current time
 */
export function getSimulatedStats() {
    const now = new Date();
    const daysSinceLaunch = Math.max(0, (now - LAUNCH_DATE) / (1000 * 60 * 60 * 24));

    // Add some daily variation using date as seed
    const dayOfYear = Math.floor(daysSinceLaunch);
    const variation = Math.sin(dayOfYear * 0.1) * 0.1 + 1; // 0.9 to 1.1 multiplier

    const totalAssessments = Math.floor(
        BASE_STATS.totalAssessments + (daysSinceLaunch * DAILY_GROWTH.totalAssessments * variation)
    );

    const completed = Math.floor(
        BASE_STATS.completed + (daysSinceLaunch * DAILY_GROWTH.completed * variation)
    );

    // Quality drifts slightly upward over time, capped at 85
    const avgQuality = Math.min(
        85,
        BASE_STATS.avgQuality + (daysSinceLaunch * DAILY_GROWTH.avgQualityDrift)
    ).toFixed(1);

    const totalRefunded = (
        BASE_STATS.totalRefunded + (daysSinceLaunch * DAILY_GROWTH.totalRefunded * variation)
    ).toFixed(2);

    // Distribution grows proportionally
    const distribution = BASE_STATS.distribution.map((base, i) =>
        Math.floor(base + (daysSinceLaunch * DAILY_GROWTH.distributionGrowth[i] * variation))
    );

    return {
        totalAssessments,
        completed,
        avgQuality,
        totalRefunded,
        distribution,
        isSimulated: true,
        lastUpdated: now.toISOString()
    };
}

/**
 * Check if real stats are empty/zero
 */
export function isEmptyStats(stats) {
    if (!stats) return true;
    return (
        !stats.totalAssessments ||
        stats.totalAssessments === 0 ||
        (stats.distribution && stats.distribution.every(d => d === 0))
    );
}

/**
 * Get stats - returns real stats if available, otherwise simulated
 */
export function getStatsWithFallback(realStats) {
    if (isEmptyStats(realStats)) {
        return getSimulatedStats();
    }
    return { ...realStats, isSimulated: false };
}
