import { useSession, signOut } from "next-auth/react";
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
        // Wait for session to finish loading before making redirect decisions
        if (status === "loading") {
            return;
        }

        // Only redirect if we're certain the user is not authenticated
        if (status === "unauthenticated" || !session?.user) {
            window.location.href = "https://kamiyo.ai/auth/signin";
            return;
        }

        const fetchData = async () => {
            try {
                // Fetch subscription status
                const subStatus = await fetch(`/api/subscription/status?email=${encodeURIComponent(session.user.email)}`).then(res => res.json());
                setSubscription(subStatus);

                // Fetch API keys
                const keysRes = await fetch(`/api/user/api-keys?email=${encodeURIComponent(session.user.email)}`);
                if (keysRes.ok) {
                    const keysData = await keysRes.json();
                    setApiKeys(keysData.apiKeys || []);
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
        <div className="bg-black text-white min-h-screen py-8">
            <Head><title>Dashboard - KAMIYO</title></Head>

            <div className="max-w-[1400px] mx-auto px-5">
                {/* Navigation */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => router.push('/')}
                            className="text-white text-sm border-b border-cyan"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => router.push('/api-keys')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            API Keys
                        </button>
                        <button
                            onClick={() => router.push('/usage')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Usage
                        </button>
                        <button
                            onClick={() => router.push('/subscription')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Subscription
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-gray-400 text-sm">{session?.user?.email}</span>
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Sign Out
                        </button>
                    </div>
                </div>

                <div className="subheading-border mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest gradient-text mb-4 md:mb-8">— &nbsp;Dashboard ダッシュボード</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Dashboard</h1>
                    <p className="text-gray-400 mt-4">
                        Subscription Tier: <span className="text-white">{tierDisplay}</span>
                    </p>
                </div>

                {/* Subscription Info Card */}
                <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
                    <h2 className="text-2xl font-light mb-4">Subscription Status</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-gray-400 text-sm">Current Tier</p>
                            <p className="text-white text-xl">{tierDisplay}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">API Access (MCP/x402)</p>
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
                                onClick={() => window.location.href = 'https://kamiyo.ai/pricing'}
                            />
                        </div>
                    )}
                </div>

                {/* Mitama Integration */}
                <div className="bg-black border border-cyan/50 rounded-lg p-8 mb-8">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-light mb-2">Agent Identity Layer: Mitama</h2>
                            <p className="text-gray-400 text-sm">Open source framework for autonomous agent identities on Solana</p>
                        </div>
                        <span className="text-cyan text-xs border border-cyan px-2 py-1 rounded">OPEN SOURCE</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                        <div>
                            <h3 className="text-white font-light mb-3">What is Mitama?</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Mitama provides PDA-based identities and reputation for AI agents.
                                While Mitama handles identity and trust, KAMIYO provides payment infrastructure.
                            </p>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-cyan" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                    </svg>
                                    <span className="text-gray-400">PDA-based identities (no private keys)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-cyan" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                    </svg>
                                    <span className="text-gray-400">On-chain reputation tracking</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-cyan" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                    </svg>
                                    <span className="text-gray-400">MEV protection and strategy testing</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-cyan" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                    </svg>
                                    <span className="text-gray-400">MIT licensed - fork, modify, build</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-white font-light mb-3">Quick Start</h3>
                            <div className="bg-gray-900/50 border border-gray-700 rounded p-4 mb-4">
                                <pre className="text-xs text-gray-300 overflow-x-auto">
{`npm install @kamiyo/mitama

import { MitamaSDK } from '@kamiyo/mitama';

const sdk = new MitamaSDK({
  solanaRpc: 'https://api.mainnet-beta.solana.com',
  kamiyoApiKey: process.env.KAMIYO_API_KEY
});

const agent = await sdk.createAgent({
  name: 'TradingBot',
  type: 'Trading'
});`}
                                </pre>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => window.open('https://github.com/kamiyo-ai/kamiyo-protocol', '_blank')}
                                    className="text-cyan hover:text-white transition-colors text-sm border border-cyan hover:border-white px-4 py-2 rounded"
                                >
                                    View on GitHub
                                </button>
                                <button
                                    onClick={() => window.location.href = '/api-docs'}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border border-gray-700 hover:border-white px-4 py-2 rounded"
                                >
                                    Documentation
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 pt-6">
                        <h3 className="text-white font-light mb-3 text-sm">Architecture</h3>
                        <div className="text-gray-400 text-xs font-mono">
                            Your Agent → Mitama (Identity) → KAMIYO (Payment) → Solana
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6 hover:border-magenta transition-colors cursor-pointer"
                         onClick={() => window.location.href = 'https://kamiyo.ai/api-docs'}>
                        <h3 className="text-lg font-light mb-2">API Documentation</h3>
                        <p className="text-gray-400 text-sm mb-4">Learn how to integrate payment infrastructure</p>
                        <span className="text-cyan text-sm">View Docs →</span>
                    </div>
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6 hover:border-magenta transition-colors cursor-pointer"
                         onClick={() => router.push('/api-keys')}>
                        <h3 className="text-lg font-light mb-2">Manage API Keys</h3>
                        <p className="text-gray-400 text-sm mb-4">Create and manage API keys for payment processing</p>
                        <span className="text-cyan text-sm">Manage Keys →</span>
                    </div>
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6 hover:border-magenta transition-colors cursor-pointer"
                         onClick={() => window.open('https://discord.com/invite/6Qxps5XP', '_blank')}>
                        <h3 className="text-lg font-light mb-2">Join Community</h3>
                        <p className="text-gray-400 text-sm mb-4">Get support and connect with other developers</p>
                        <span className="text-cyan text-sm">Join Discord →</span>
                    </div>
                </div>

                {/* Usage Analytics for Team+ */}
                {hasUsageAnalytics && usage && (
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-light">Usage Analytics</h2>
                            <button
                                onClick={() => router.push('/usage')}
                                className="text-cyan hover:text-magenta transition-colors text-sm"
                            >
                                View Detailed Stats →
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="border border-gray-500/25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">Total API Calls (7d)</p>
                                <p className="text-white text-2xl font-light">{usage.totalRequests?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="border border-gray-500/25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">x402 Payments (7d)</p>
                                <p className="text-white text-2xl font-light">{usage.totalPayments?.toLocaleString() || '0'}</p>
                            </div>
                            <div className="border border-gray-500/25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">USDC Received (7d)</p>
                                <p className="text-white text-2xl font-light">${usage.totalUSDC?.toFixed(2) || '0.00'}</p>
                            </div>
                            <div className="border border-gray-500/25 rounded p-4">
                                <p className="text-gray-400 text-sm mb-1">Daily Average</p>
                                <p className="text-white text-2xl font-light">{usage.dailyAverage?.toLocaleString() || '0'}</p>
                            </div>
                        </div>

                        {usage.recentActivity && usage.recentActivity.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-lg font-light mb-3">Recent Activity</h3>
                                <div className="space-y-2">
                                    {usage.recentActivity.slice(0, 5).map((activity, index) => (
                                        <div key={index} className="flex justify-between items-center text-sm py-2 border-b border-gray-500/25">
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
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <h2 className="text-2xl font-light mb-4">Getting Started with Payment Verification</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">1</div>
                                <div>
                                    <h3 className="text-white mb-1">Create an API Key</h3>
                                    <p className="text-gray-400 text-sm">Generate your first API key to start verifying crypto payments</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">2</div>
                                <div>
                                    <h3 className="text-white mb-1">Read the Documentation</h3>
                                    <p className="text-gray-400 text-sm">Learn how to integrate payment verification via x402 API</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="text-cyan text-2xl font-light">3</div>
                                <div>
                                    <h3 className="text-white mb-1">Start Verifying</h3>
                                    <p className="text-gray-400 text-sm">Verify USDC payments across 12+ blockchains with one API call</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
