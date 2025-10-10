// pages/pricing.js
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import PayButton from "../components/PayButton";
import { useSession } from "next-auth/react";
import { MinusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export default function PricingPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isRedirecting, setIsRedirecting] = useState(false);

    const plans = [
        {
            id: "price_free",
            name: "Free",
            price: "$0/month",
            description: "Perfect for exploring exploit intelligence and personal projects.",
            tier: "free",
            enabled: true
        },
        {
            id: "price_basic",
            name: "Basic",
            price: "$29/month",
            description: "For individual developers with regular needs and small teams.",
            tier: "basic",
            enabled: true
        },
        {
            id: "price_pro",
            name: "Pro",
            price: "$99/month",
            description: "For development teams and security-conscious organizations.",
            tier: "pro",
            enabled: true
        },
        {
            id: "price_enterprise",
            name: "Enterprise",
            price: "$499/month",
            description: "For large organizations with mission-critical monitoring needs.",
            tier: "enterprise",
            enabled: true
        }
    ];

    const handlePaymentRedirect = async (tier) => {
        if (!session) {
            router.push("/auth/signin");
            return;
        }

        if (tier === 'free') {
            // For free tier, just redirect to dashboard
            router.push("/dashboard");
            return;
        }

        setIsRedirecting(true);
        try {
            const res = await fetch(`/api/payment/checkout?plan=${tier}&userId=${session.user.id}`);
            if (res.ok) {
                const { url } = await res.json();
                window.location.href = url;
            } else {
                console.error("Failed to initiate payment");
            }
        } catch (error) {
            console.error("Payment error:", error);
        } finally {
            setIsRedirecting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-5 mx-auto" style={{ maxWidth: '1400px' }}>
            <Head>
                <title>Kamiyo Subscription Plans - Real-time Exploit Intelligence</title>
            </Head>
            <div className="w-full flex flex-col items-start border-dotted border-b border-cyan mb-6 pb-6">
                <p className="font-light text-left text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Subscription Plans</p>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-left">Choose Your Intelligence Level</h1>
            </div>
            <p className="text-gray-400 text-sm mb-12 text-left max-w-2xl self-start">Get real-time blockchain exploit intelligence with verified sources. Start free and upgrade anytime for more features, higher rate limits, and priority support.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full justify-center">
                {plans.map((plan) => (
                    <div
                        key={plan.tier}
                        className={`relative bg-black border border-gray-500 border-opacity-25 p-8 rounded-2xl flex flex-col transition-all duration-300 card hover:-translate-y-1 ${
                            plan.tier === 'pro' ? 'card-highlighted' : ''
                        }`}
                    >
                        {plan.tier === 'pro' && (
                            <div className="text-magenta text-xs uppercase tracking-wider mb-2 font-semibold">Most Popular</div>
                        )}
                        <h2 className="text-xl font-semibold mb-3">{plan.name}</h2>
                        <p className="text-2xl text-white mb-4">{plan.price}</p>
                        <p className="text-gray-400 text-sm mb-6">{plan.description}</p>
                        <div className="mt-auto">
                            <PayButton
                                textOverride={
                                    isRedirecting
                                        ? 'Processing...'
                                        : plan.tier === 'free'
                                            ? 'Get Started'
                                            : plan.tier === 'enterprise'
                                                ? 'Contact Sales'
                                                : 'Subscribe Now'
                                }
                                onClickOverride={() => {
                                    if (plan.tier === 'enterprise') {
                                        window.location.href = '/inquiries';
                                    } else {
                                        handlePaymentRedirect(plan.tier);
                                    }
                                }}
                                disabled={isRedirecting}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-16 w-full">
                <h4 className="text-2xl mb-6 font-light">Feature Comparison</h4>
                <div className="overflow-x-auto border border-gray-500 border-opacity-25 rounded-lg">
                    <table className="w-full text-left">
                        <thead>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th className="p-4 text-white">Features</th>
                            <th className="p-4 text-white">Free</th>
                            <th className="p-4 text-white">Basic</th>
                            <th className="p-4 text-white">Pro</th>
                            <th className="p-4 text-white">Enterprise</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">API Requests per Day</td>
                            <td className="p-4 text-gray-400">100</td>
                            <td className="p-4 text-gray-400">1,000</td>
                            <td className="p-4 text-gray-400">10,000</td>
                            <td className="p-4 text-gray-400">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Historical Data Access</td>
                            <td className="p-4 text-gray-400">7 days</td>
                            <td className="p-4 text-gray-400">30 days</td>
                            <td className="p-4 text-gray-400">90 days</td>
                            <td className="p-4 text-gray-400">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Email Alerts</td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Discord Alerts</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Telegram Alerts</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Webhook Integration</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">CSV/JSON Export</td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Real-time Delivery</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Support</td>
                            <td className="p-4 text-gray-400 text-xs">Community</td>
                            <td className="p-4 text-gray-400 text-xs">Email (48h)</td>
                            <td className="p-4 text-gray-400 text-xs">Priority (24h)</td>
                            <td className="p-4 text-gray-400 text-xs">24/7 Dedicated</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Custom Integrations</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr>
                            <td className="p-4 font-light text-sm">SLA & White Label</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-16 w-full">
                <h4 className="text-2xl mb-6 font-light">Frequently Asked Questions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h5 className="text-lg mb-2 text-cyan">Can I switch plans anytime?</h5>
                        <p className="text-gray-400 text-sm">Yes! Upgrades take effect immediately with proration. Downgrades take effect at the end of your current billing period.</p>
                    </div>
                    <div>
                        <h5 className="text-lg mb-2 text-cyan">What payment methods do you accept?</h5>
                        <p className="text-gray-400 text-sm">We accept all major credit cards (Visa, Mastercard, American Express, Discover) via Stripe.</p>
                    </div>
                    <div>
                        <h5 className="text-lg mb-2 text-cyan">Do you offer refunds?</h5>
                        <p className="text-gray-400 text-sm">We don't offer refunds for partial months. If you cancel, your subscription remains active until the end of the current billing period.</p>
                    </div>
                    <div>
                        <h5 className="text-lg mb-2 text-cyan">Can I exceed my rate limit?</h5>
                        <p className="text-gray-400 text-sm">Rate limits are hard limits. If you need higher limits, upgrade your plan. Enterprise plans have unlimited API access.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
