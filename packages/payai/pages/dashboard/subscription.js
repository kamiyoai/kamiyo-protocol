import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Head from "next/head";
import { ScrambleButton } from "../../components/ScrambleButton";
import { LinkButton } from "../../components/Button";

const tiers = [
    {
        name: 'free',
        display: 'Free',
        price: 0,
        features: [
            'Unlimited email alerts',
            '24-hour delayed data',
            '1K API calls/day',
            'Public dashboard access'
        ]
    },
    {
        name: 'pro',
        display: 'Pro',
        price: 89,
        features: [
            'Unlimited real-time alerts',
            '50K API req/day',
            'WebSocket feed',
            'Discord/Telegram/Email',
            'Historical data (90 days)'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || 'price_1SHrROCvpzIkQ1SiQpZqrf0V'
    },
    {
        name: 'team',
        display: 'Team',
        price: 199,
        features: [
            'Everything in Pro',
            '5 webhook endpoints',
            'Slack integration',
            'Fork detection analysis',
            'Pattern clustering',
            'Priority support'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM || 'price_1SHrpdCvpzIkQ1SiuYAXsLKI'
    },
    {
        name: 'enterprise',
        display: 'Enterprise',
        price: 499,
        features: [
            'Everything in Team',
            '50 webhook endpoints',
            'Protocol watchlists',
            'Fork graph visualization',
            'Historical data (2+ years)',
            'Dedicated support'
        ],
        stripePrice: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE || 'price_1SHrS3CvpzIkQ1Simt712q1Q'
    }
];

export default function SubscriptionPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState(false);

    useEffect(() => {
        // Wait for session to finish loading before making redirect decisions
        if (status === "loading") {
            return;
        }

        // Only redirect if we're certain the user is not authenticated
        if (status === "unauthenticated" || !session?.user) {
            router.push("/auth/signin");
            return;
        }

        const fetchSubscription = async () => {
            try {
                const res = await fetch(`/api/subscription/status?email=${encodeURIComponent(session.user.email)}`);
                const data = await res.json();
                setSubscription(data);
            } catch (error) {
                console.error("Error fetching subscription:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSubscription();
    }, [status, session, router]);

    const handleUpgradeDowngrade = async (targetTier) => {
        if (upgrading) return;

        setUpgrading(true);
        try {
            const tier = tiers.find(t => t.name === targetTier);

            if (targetTier === 'free') {
                // Handle downgrade to free
                const res = await fetch('/api/subscription/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: session.user.email })
                });

                if (res.ok) {
                    alert('Successfully downgraded to Free tier');
                    window.location.reload();
                } else {
                    const error = await res.json();
                    alert(`Failed to downgrade: ${error.message || 'Unknown error'}`);
                }
            } else {
                // Handle upgrade/change to paid tier
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
                    // Redirect to Stripe Checkout
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
        <div className="bg-black text-white min-h-screen p-8">
            <Head><title>Subscription - KAMIYO</title></Head>

            <div className="max-w-7xl mx-auto">
                {/* Navigation */}
                <div className="mb-6 flex items-center gap-6">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                        ← Dashboard
                    </button>
                </div>

                <h1 className="text-4xl font-light mb-2">Manage Subscription</h1>
                <p className="text-gray-400 mb-8">
                    Current Tier: <span className="text-white">{subscription?.tier?.charAt(0).toUpperCase() + subscription?.tier?.slice(1) || 'Free'}</span>
                </p>

                {/* Subscription Tiers */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {tiers.map((tier) => {
                        const isCurrent = currentTier === tier.name;
                        const isHigherTier = ['free', 'pro', 'team', 'enterprise'].indexOf(tier.name) > ['free', 'pro', 'team', 'enterprise'].indexOf(currentTier);
                        const isLowerTier = ['free', 'pro', 'team', 'enterprise'].indexOf(tier.name) < ['free', 'pro', 'team', 'enterprise'].indexOf(currentTier);

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
                                    ) : isLowerTier ? (
                                        <button
                                            onClick={() => {
                                                if (confirm(`Are you sure you want to downgrade to ${tier.display}? You will lose access to premium features.`)) {
                                                    handleUpgradeDowngrade(tier.name);
                                                }
                                            }}
                                            disabled={upgrading}
                                            className="px-6 py-2 border border-gray-500 text-gray-400 rounded hover:border-gray-300 hover:text-gray-200 transition text-sm"
                                        >
                                            {upgrading ? "Processing..." : "Downgrade"}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Billing Portal Link */}
                {subscription?.isSubscribed && subscription.tier !== 'free' && (
                    <div className="mt-8 text-center">
                        <p className="text-gray-400 mb-4">
                            Need to update payment method or view invoices?
                        </p>
                        <LinkButton
                            href="https://billing.stripe.com/p/login/9B628q7kD3vG0w0fD79bO00"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Access Billing Portal →
                        </LinkButton>
                    </div>
                )}
            </div>
        </div>
    );
}
