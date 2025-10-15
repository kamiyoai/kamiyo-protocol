import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import { ScrambleButton } from "../components/ScrambleButton";

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [exploits, setExploits] = useState([]);
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

                // Fetch recent exploits
                const exploitsRes = await fetch("/api/exploits?page=1&page_size=10");
                if (exploitsRes.ok) {
                    const data = await exploitsRes.json();
                    setExploits(data.data || []);
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
                        <button
                            onClick={() => router.push('/pricing')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            Pricing
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

                    {exploits.length === 0 ? (
                        <p className="text-gray-400">No exploits available</p>
                    ) : (
                        <div className="space-y-4">
                            {exploits.map((exploit, index) => (
                                <div
                                    key={index}
                                    className="border border-gray-500 border-opacity-25 rounded p-4 hover:border-cyan transition-colors"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-white font-light text-lg">{exploit.protocol}</h3>
                                        <span className="text-sm text-cyan">{exploit.chain}</span>
                                    </div>
                                    <p className="text-gray-400 text-sm mb-2">
                                        {exploit.description || (
                                            <span>
                                                Exploit detected {exploit.category ? `(${exploit.category})` : ''} – <a href={exploit.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:text-magenta underline">View source</a>
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-500">
                                            {new Date(exploit.date).toLocaleDateString()}
                                        </span>
                                        <span className="text-magenta font-medium">
                                            ${exploit.amount_usd ? exploit.amount_usd.toLocaleString() : 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
