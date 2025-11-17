// Usage Analytics Dashboard Page
// Displays API usage statistics, rate limits, and historical trends

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function UsageDashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [usageData, setUsageData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Redirect if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/');
        }
    }, [status, router]);

    // Load usage statistics
    async function loadUsageStats() {
        try {
            setLoading(true);
            setError(null);

            // TODO: Replace with actual API endpoint when ready
            // For now, use mock data structure
            const response = await fetch(`http://localhost:8000/api/v1/subscriptions/usage`, {
                headers: {
                    'Content-Type': 'application/json',
                    // TODO: Add authentication header
                }
            });

            if (!response.ok) {
                // If endpoint doesn't exist yet, use mock data
                const mockData = {
                    user_id: session?.user?.email || 'demo@example.com',
                    tier: 'pro',
                    current_usage: {
                        minute: 0,
                        hour: 15,
                        day: 342,
                        endpoints: {
                            '/v1/x402/verify': 250,
                            '/v1/x402/supported-chains': 50,
                            '/v1/x402/usage': 42
                        }
                    },
                    limits: {
                        minute: 35,
                        hour: 2083,
                        day: 50000
                    },
                    remaining: {
                        minute: 35,
                        hour: 2068,
                        day: 49658
                    }
                };
                setUsageData(mockData);
            } else {
                const data = await response.json();
                setUsageData(data);
            }
        } catch (err) {
            console.error('Failed to load usage stats:', err);
            // Use mock data on error
            const mockData = {
                user_id: session?.user?.email || 'demo@example.com',
                tier: 'pro',
                current_usage: {
                    minute: 0,
                    hour: 15,
                    day: 342,
                    endpoints: {
                        '/v1/x402/verify': 250,
                        '/v1/x402/supported-chains': 50,
                        '/v1/x402/usage': 42
                    }
                },
                limits: {
                    minute: 35,
                    hour: 2083,
                    day: 50000
                },
                remaining: {
                    minute: 35,
                    hour: 2068,
                    day: 49658
                }
            };
            setUsageData(mockData);
        } finally {
            setLoading(false);
        }
    }

    // Initial load
    useEffect(() => {
        if (status === 'authenticated') {
            loadUsageStats();
        }
    }, [status]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        if (!autoRefresh || status !== 'authenticated') return;

        const interval = setInterval(() => {
            loadUsageStats();
        }, 30000);

        return () => clearInterval(interval);
    }, [autoRefresh, status]);

    // Calculate percentage used
    function getUsagePercentage(used, limit) {
        if (limit === 0) return 0;
        return Math.min((used / limit) * 100, 100);
    }

    // Get color based on usage percentage
    function getUsageColor(percentage) {
        if (percentage >= 90) return 'text-red-400 bg-red-900/20 border-red-500';
        if (percentage >= 75) return 'text-yellow-400 bg-yellow-900/20 border-yellow-500';
        return 'text-cyan bg-cyan/10 border-cyan';
    }

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen bg-void flex items-center justify-center">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    if (!usageData) {
        return (
            <div className="min-h-screen bg-void flex items-center justify-center">
                <div className="text-white">No usage data available</div>
            </div>
        );
    }

    const dayPercentage = getUsagePercentage(usageData.current_usage.day, usageData.limits.day);
    const hourPercentage = getUsagePercentage(usageData.current_usage.hour, usageData.limits.hour);
    const minutePercentage = getUsagePercentage(usageData.current_usage.minute, usageData.limits.minute);

    return (
        <div className="min-h-screen bg-void text-white">
            <div className="py-8 px-5 mx-auto max-w-[1400px]">
                {/* Navigation */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => router.push('/')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            ← Home
                        </button>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/api-keys')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            API Keys
                        </button>
                        <button
                            onClick={() => router.push('/dashboard/usage')}
                            className="text-white text-sm border-b border-cyan"
                        >
                            Usage Analytics
                        </button>
                    </div>
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`text-xs px-3 py-1 rounded border ${
                            autoRefresh
                                ? 'border-cyan text-cyan'
                                : 'border-gray-500 text-gray-500'
                        }`}
                    >
                        {autoRefresh ? '● Auto-refresh ON' : '○ Auto-refresh OFF'}
                    </button>
                </div>

                {/* Header */}
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;使用状況</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Usage Analytics</h1>
                    <p className="text-gray-400 mt-4">
                        Monitor your KAMIYO API usage and rate limits
                    </p>
                </div>

                {/* Tier Badge */}
                <div className="mb-8 inline-block">
                    <div className="px-4 py-2 bg-gradient-to-r from-cyan to-magenta rounded-lg">
                        <span className="text-white font-semibold uppercase text-sm">
                            {usageData.tier} Tier
                        </span>
                    </div>
                </div>

                {/* Rate Limit Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Daily Usage */}
                    <div className={`border rounded-lg p-6 ${getUsageColor(dayPercentage)}`}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-75">
                            Daily Limit
                        </div>
                        <div className="text-3xl font-bold mb-2">
                            {usageData.current_usage.day.toLocaleString()}
                        </div>
                        <div className="text-sm mb-4">
                            of {usageData.limits.day.toLocaleString()} requests
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                            <div
                                className="bg-current h-2 rounded-full transition-all duration-500"
                                style={{ width: `${dayPercentage}%` }}
                            />
                        </div>
                        <div className="text-xs">
                            {usageData.remaining.day.toLocaleString()} remaining ({(100 - dayPercentage).toFixed(1)}%)
                        </div>
                    </div>

                    {/* Hourly Usage */}
                    <div className={`border rounded-lg p-6 ${getUsageColor(hourPercentage)}`}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-75">
                            Hourly Limit
                        </div>
                        <div className="text-3xl font-bold mb-2">
                            {usageData.current_usage.hour.toLocaleString()}
                        </div>
                        <div className="text-sm mb-4">
                            of {usageData.limits.hour.toLocaleString()} requests
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                            <div
                                className="bg-current h-2 rounded-full transition-all duration-500"
                                style={{ width: `${hourPercentage}%` }}
                            />
                        </div>
                        <div className="text-xs">
                            {usageData.remaining.hour.toLocaleString()} remaining ({(100 - hourPercentage).toFixed(1)}%)
                        </div>
                    </div>

                    {/* Per-Minute Usage */}
                    <div className={`border rounded-lg p-6 ${getUsageColor(minutePercentage)}`}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-75">
                            Per-Minute Limit
                        </div>
                        <div className="text-3xl font-bold mb-2">
                            {usageData.current_usage.minute}
                        </div>
                        <div className="text-sm mb-4">
                            of {usageData.limits.minute} requests
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                            <div
                                className="bg-current h-2 rounded-full transition-all duration-500"
                                style={{ width: `${minutePercentage}%` }}
                            />
                        </div>
                        <div className="text-xs">
                            {usageData.remaining.minute} remaining ({(100 - minutePercentage).toFixed(1)}%)
                        </div>
                    </div>
                </div>

                {/* Endpoint Breakdown */}
                {usageData.current_usage.endpoints && Object.keys(usageData.current_usage.endpoints).length > 0 && (
                    <div className="bg-obsidian border border-kamiyo-border rounded-lg p-6 mb-8">
                        <h2 className="text-2xl font-semibold mb-4">Endpoint Breakdown (Today)</h2>
                        <div className="space-y-4">
                            {Object.entries(usageData.current_usage.endpoints)
                                .sort(([, a], [, b]) => b - a)
                                .map(([endpoint, count]) => {
                                    const percentage = (count / usageData.current_usage.day) * 100;
                                    return (
                                        <div key={endpoint} className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-sm text-cyan">{endpoint}</span>
                                                <span className="text-gray-400">
                                                    {count.toLocaleString()} requests ({percentage.toFixed(1)}%)
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-800 rounded-full h-2">
                                                <div
                                                    className="bg-gradient-to-r from-cyan to-magenta h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Upgrade CTA (if close to limits) */}
                {dayPercentage >= 75 && usageData.tier === 'free' && (
                    <div className="bg-gradient-to-r from-cyan/10 to-magenta/10 border border-cyan/50 rounded-lg p-6 mb-8">
                        <h3 className="text-xl font-semibold mb-2 text-cyan">
                            Approaching Your Daily Limit
                        </h3>
                        <p className="text-gray-300 mb-4">
                            You've used {dayPercentage.toFixed(0)}% of your daily API requests.
                            Upgrade to Pro for 50x more requests and real-time data.
                        </p>
                        <button
                            onClick={() => router.push('/pricing')}
                            className="px-6 py-3 bg-gradient-to-r from-cyan to-magenta text-white font-semibold rounded-lg hover:opacity-90 transition"
                        >
                            View Upgrade Options
                        </button>
                    </div>
                )}

                {/* Info Box */}
                <div className="bg-obsidian border border-kamiyo-border rounded-lg p-6">
                    <h3 className="text-xl font-semibold mb-4">About Rate Limits</h3>
                    <div className="space-y-3 text-sm text-gray-300">
                        <p>
                            <strong className="text-white">Daily Limits:</strong> Total API requests allowed per 24-hour period
                        </p>
                        <p>
                            <strong className="text-white">Hourly Limits:</strong> Maximum requests within any 60-minute window
                        </p>
                        <p>
                            <strong className="text-white">Per-Minute Limits:</strong> Burst protection to prevent API abuse
                        </p>
                        <p className="pt-3 border-t border-gray-700">
                            Rate limits reset automatically. Upgrade your tier for higher limits and additional features.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
