import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import { ScrambleButton } from "../../components/ScrambleButton";

const tiers = [
    {
        name: 'free',
        display: 'Free',
        price: 0,
        features: [
            '1,000 verifications/month',
            'Solana & Base support',
            'Multi-chain USDC verification',
            'Community support',
            'Standard rate limits'
        ]
    },
    {
        name: 'starter',
        display: 'Starter',
        price: 99,
        features: [
            '50,000 verifications/month',
            'Solana, Base & Ethereum',
            'Priority verification',
            'Email support',
            'Higher rate limits',
            '99.9% uptime SLA'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER
    },
    {
        name: 'pro',
        display: 'Pro',
        price: 299,
        features: [
            '500,000 verifications/month',
            '6 blockchain networks',
            'Advanced risk scoring',
            'Priority support',
            'Custom rate limits',
            '99.95% uptime SLA'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO
    },
    {
        name: 'enterprise',
        display: 'Enterprise',
        price: 999,
        features: [
            'Unlimited verifications',
            'All supported chains',
            'Custom integration support',
            'Dedicated support',
            'Custom SLA agreements',
            'On-premise deployment option'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE
    }
];

export default function SubscriptionPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState(false);

    useEffect(() => {
        if (status === "loading") {
            return;
        }

        if (status === "unauthenticated" || !session?.user) {
            window.location.href = "https://kamiyo.ai/auth/signin";
            return;
        }

        const fetchSubscription = async () => {
            try {
                const res = await fetch(`/api/subscription/status?email=${encodeURIComponent(session.user.email)}`);
                const data = await res.json();
                setSubscription(data);
            } catch (error) {
                console.error("Failed to load subscription:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSubscription();
    }, [status, session, router]);

    const handleUpgradeDowngrade = async (tierName) => {
        try {
            setUpgrading(true);

            const tier = tiers.find(t => t.name === tierName);

            if (tierName === 'free') {
                alert('Contact support to downgrade to Free tier');
                return;
            }

            if (tierName === 'enterprise') {
                window.location.href = 'https://kamiyo.ai/inquiries';
                return;
            }

            if (tier.stripePrice) {
                const res = await fetch('/api/subscription/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: session.user.email,
                        priceId: tier.stripePrice
                    })
                });

                const data = await res.json();

                if (data.url) {
                    window.location.href = data.url;
                } else {
                    alert('Failed to create checkout session');
                }
            }
        } catch (error) {
            console.error("Error managing subscription:", error);
            alert('An error occurred. Please try again.');
        } finally {
            setUpgrading(false);
        }
    };

    if (status === "loading" || loading) {
        return (
            <div className="bg-black text-white min-h-screen flex items-center justify-center">
                <div className="text-gray-400">Loading...</div>
            </div>
        );
    }

    const currentTier = subscription?.tier || 'free';

    return (
        <div className="bg-black text-white min-h-screen py-8">
            <Head><title>Subscription - KAMIYO</title></Head>

            <div className="max-w-[1400px] mx-auto px-5">
                {/* Navigation */}
                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => router.push('/')}
                            className="text-gray-400 hover:text-white transition-colors text-sm"
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
                            className="text-white text-sm border-b border-cyan"
                        >
                            Subscription
                        </button>
                    </div>
                </div>

                {/* Header */}
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;サブスクリプション</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Manage Subscription</h1>
                    <p className="text-gray-400 mt-4">
                        Current Tier: <span className="text-white">{subscription?.tier?.charAt(0).toUpperCase() + subscription?.tier?.slice(1) || 'Free'}</span>
                    </p>
                </div>

                {/* Subscription Tiers */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {tiers.map((tier) => {
                        const isCurrent = currentTier === tier.name;
                        const isHigherTier = ['free', 'starter', 'pro', 'enterprise'].indexOf(tier.name) > ['free', 'starter', 'pro', 'enterprise'].indexOf(currentTier);
                        const isLowerTier = ['free', 'starter', 'pro', 'enterprise'].indexOf(tier.name) < ['free', 'starter', 'pro', 'enterprise'].indexOf(currentTier);

                        return (
                            <div
                                key={tier.name}
                                className={`relative bg-black border border-gray-500/25 rounded-lg p-6 flex flex-col transition-all duration-300 ${
                                    isCurrent
                                        ? 'card card-highlighted -translate-y-1'
                                        : ''
                                }`}
                            >
                                {isCurrent && (
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                        <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                                            Current Plan
                                        </span>
                                    </div>
                                )}

                                <h3 className="text-xl font-light mb-2">{tier.display}</h3>
                                <div className="mb-6">
                                    <span className="text-4xl font-light gradient-text">${tier.price}</span>
                                    {tier.price > 0 && <span className="text-gray-500 text-xs ml-1">/mo</span>}
                                    {tier.price === 0 && <span className="text-gray-500 text-xs ml-1">forever</span>}
                                </div>

                                <ul className="space-y-2 mb-6 text-xs flex-grow">
                                    {tier.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-2">
                                            <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-gray-300">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="flex justify-center mt-auto pt-6">
                                    {isCurrent ? (
                                        <button
                                            disabled
                                            className="px-6 py-2 bg-gray-700 text-gray-400 rounded cursor-not-allowed text-sm"
                                        >
                                            Current Plan
                                        </button>
                                    ) : isHigherTier ? (
                                        <ScrambleButton
                                            text={upgrading ? "Processing..." : "Upgrade"}
                                            enabled={!upgrading}
                                            onClick={() => handleUpgradeDowngrade(tier.name)}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => handleUpgradeDowngrade(tier.name)}
                                            className="px-6 py-2 border border-gray-500 text-gray-400 rounded hover:border-gray-300 hover:text-gray-200 transition text-sm"
                                        >
                                            Downgrade
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
