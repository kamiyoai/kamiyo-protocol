import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import { ScrambleButton } from "../components/ScrambleButton";
import ExploitList from "../components/ExploitList";

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user) {
            router.push("/auth/signin");
            return;
        }

        const fetchData = async () => {
            try {
                const subStatus = await fetch(`/api/subscription/status?email=${encodeURIComponent(session.user.email)}`).then(res => res.json());
                setSubscription(subStatus);
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
    const isRealTime = subscription.isSubscribed && subscription.tier && subscription.tier.toLowerCase() !== 'free';

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
                        {subscription?.tier && (subscription.tier === 'team' || subscription.tier === 'enterprise') && (
                            <button
                                onClick={() => router.push('/fork-analysis')}
                                className="text-gray-400 hover:text-white transition-colors text-sm"
                            >
                                Fork Analysis
                            </button>
                        )}
                        <button
                            onClick={() => router.push('/dashboard/subscription')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Subscription
                        </button>
                    </div>
                </div>

                <h1 className="text-4xl font-light mb-2">Dashboard</h1>
                <p className="text-gray-400 mb-8">
                    Subscription Tier: <span className="text-white">{tierDisplay}</span>
                    {!isRealTime && <span className="ml-4 text-sm text-yellow-500">(Viewing delayed data)</span>}
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
                            <p className="text-gray-400 text-sm">Data Access</p>
                            <p className="text-white text-xl">{isRealTime ? 'Real-time' : 'Delayed (24h)'}</p>
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">API Access</p>
                            <p className="text-white text-xl">{subscription.isSubscribed ? 'Enabled' : 'Limited'}</p>
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

                {/* Recent Exploits */}
                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-light">Recent Exploits</h2>
                        <button
                            onClick={() => router.push('/inquiries')}
                            className="text-cyan hover:text-magenta transition-colors text-sm"
                        >
                            View All →
                        </button>
                    </div>

                    <ExploitList limit={10} showFilters={true} />
                </div>
            </div>
        </div>
    );
}
