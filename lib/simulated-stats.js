/**
 * Simulated Protocol Stats
 * Generates gradually increasing stats based on time elapsed since launch.
 * Used as fallback when real on-chain stats are empty.
 */

// Launch date for simulation baseline
const LAUNCH_DATE = new Date('2025-01-01T00:00:00Z');

// Base stats at launch
const BASE_STATS = {
    totalAssessments: 100,
    completed: 95,
    avgQuality: 76.0,
    totalRefunded: 8.5,
    distribution: [2, 4, 10, 25, 40]
};

// Daily growth rates
const DAILY_GROWTH = {
    totalAssessments: 12,
    completed: 11,
    avgQualityDrift: 0.02, // slight upward drift
    totalRefunded: 0.8,
    distributionGrowth: [0.1, 0.3, 0.8, 1.5, 2.5]
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
