import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import { ScrambleButton } from "../components/ScrambleButton";
import { hasMinimumTier, TierName } from "../lib/tiers";

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [apiKeys, setApiKeys] = useState([]);
    const [usage, setUsage] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user) {
            router.push("/auth/signin");
            return;
        }

        const fetchData = async () => {
            try {
                // Fetch subscription status
                const subStatus = await fetch(`/api/subscription/status?email=${encodeURIComponent(session.user.email)}`).then(res => res.json());
                setSubscription(subStatus);

                // Fetch API keys
                const keysRes = await fetch("/api/user/api-keys");
                if (keysRes.ok) {
                    const keysData = await keysRes.json();
                    setApiKeys(keysData.keys || []);
                }

                // Fetch usage stats for Team+ tiers
                if (subStatus.tier && hasMinimumTier(subStatus.tier, TierName.TEAM)) {
                    const usageRes = await fetch(`/api/usage?email=${encodeURIComponent(session.user.email)}`);
                    if (usageRes.ok) {
                        const usageData = await usageRes.json();
                        setUsage(usageData);
                    }
                }
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [status, session, router]);

    if (status === "loading" || loading) {
        return (
            <div className="bg-black text-white min-h-screen flex items-center justify-center">
                <div className="text-gray-400">Loading...</div>
            </div>
        );
    }

    if (!subscription) {
        return (
            <div className="bg-black text-white min-h-screen flex items-center justify-center">
                <div className="text-gray-400">Unable to load subscription data</div>
            </div>
        );
    }

    const tierDisplay = subscription.tier ? subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1) : "Free";
    const hasUsageAnalytics = subscription.tier && hasMinimumTier(subscription.tier, TierName.TEAM);

    return (
        <div className="bg-black text-white min-h-screen p-8">
            <Head><title>Dashboard - KAMIYO</title></Head>

            <div className="max-w-7xl mx-auto">
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
                            className="text-white text-sm border-b border-cyan"
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
                            onClick={() => router.push('/dashboard/subscription')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Subscription
                        </button>
                    </div>
                </div>

                <h1 className="text-4xl font-light mb-2">x402 Payment Dashboard</h1>
                <p className="text-gray-400 mb-8">
                    Subscription Tier: <span className="text-white">{tierDisplay}</span>
                </p>

                {/* Subscription Info Card */}
                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 mb-8">
                    <h2 className="text-2xl font-light mb-4">Subscription Status</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-gray-400 text-sm">Current Tier</p>
                            <p className="text-white text-xl">{tierDisplay}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">x402 Payment Access</p>
                            <p className="text-white text-xl">{subscription.isSubscribed ? 'Full Access' : 'Pay-per-use'}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">API Keys</p>
                            <p className="text-white text-xl">{apiKeys.length > 0 ? `${apiKeys.length} Active` : 'None'}</p>
                        </div>
                    </div>
                    {!subscription.isSubscribed && (
                        <div className="mt-6">
                            <ScrambleButton
                                text="Upgrade Subscription"
                                onClick={() => router.push('/pricing')}
                            />
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors cursor-pointer"
                         onClick={() => router.push('/api-docs')}>
                        <h3 className="text-lg font-light mb-2">API Documentation</h3>
                        <p className="text-gray-400 text-sm mb-4">Learn how to integrate x402 payments into your AI agents</p>
                        <span className="text-cyan text-sm">View Docs →</span>
                    </div>
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors cursor-pointer"
                         onClick={() => router.push('/dashboard/api-keys')}>
                        <h3 className="text-lg font-light mb-2">Manage API Keys</h3>
                        <p className="text-gray-400 text-sm mb-4">Create and manage your x402 payment API keys</p>
                        <span className="text-cyan text-sm">Manage Keys →</span>
                    </div>
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 hover:border-cyan transition-colors cursor-pointer"
                         onClick={() => window.open('https://discord.com/invite/6Qxps5XP', '_blank')}>
                        <h3 className="text-lg font-light mb-2">Join Community</h3>
                        <p className="text-gray-400 text-sm mb-4">Get support and connect with other developers</p>
                        <span className="text-cyan text-sm">Join Discord →</span>
                    </div>
                </div>

                {/* Usage Analytics for Team+ */}
                {hasUsageAnalytics && usage && (
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-light">Usage Analytics</h2>
                            <button
                                onClick={() => router.push('/dashboard/usage')}
                                className="text-cyan hover:text-magenta transition-colors text-sm"
                            >
                                View Detailed Stats →
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="border border-gray-500 border-opacity-25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">Total API Calls (7d)</p>
                                <p className="text-white text-2xl font-light">{usage.totalRequests?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="border border-gray-500 border-opacity-25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">x402 Payments (7d)</p>
                                <p className="text-white text-2xl font-light">{usage.totalPayments?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="border border-gray-500 border-opacity-25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">USDC Received (7d)</p>
                                <p className="text-white text-2xl font-light">${usage.totalUSDC?.toFixed(2) || '0.00'}</p>
                            </div>
                            <div className="border border-gray-500 border-opacity-25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">Daily Average</p>
                                <p className="text-white text-2xl font-light">{usage.dailyAverage?.toLocaleString() || '0'}</p>
                            </div>
                        </div>

                        {usage.recentActivity && usage.recentActivity.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-lg font-light mb-3">Recent Activity</h3>
                                <div className="space-y-2">
                                    {usage.recentActivity.slice(0, 5).map((activity, index) => (
                                        <div key={index} className="flex justify-between items-center text-sm py-2 border-b border-gray-500 border-opacity-25">
                                            <span className="text-gray-400">{activity.endpoint || 'API Call'}</span>
                                            <span className="text-white">{new Date(activity.timestamp).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Getting Started for Free Tier */}
                {!subscription.isSubscribed && (
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <h2 className="text-2xl font-light mb-4">Getting Started with x402 Payments</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">1</div>
                                <div>
                                    <h3 className="text-white mb-1">Create an API Key</h3>
                                    <p className="text-gray-400 text-sm">Generate your first x402 payment API key to start accepting on-chain USDC payments</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">2</div>
                                <div>
                                    <h3 className="text-white mb-1">Read the Documentation</h3>
                                    <p className="text-gray-400 text-sm">Learn how to implement HTTP 402 Payment Required in your AI agent applications</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">3</div>
                                <div>
                                    <h3 className="text-white mb-1">Test x402 Payments</h3>
                                    <p className="text-gray-400 text-sm">Start with pay-per-use x402 payments on Base, Ethereum, or Solana</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
