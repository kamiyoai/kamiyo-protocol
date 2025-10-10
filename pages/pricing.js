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
            price: "$0",
            priceDetail: "forever",
            description: "Stay informed",
            tier: "free",
            enabled: true
        },
        {
            id: "price_pro",
            name: "Pro",
            price: "$49",
            priceDetail: "/mo",
            description: "For individuals",
            tier: "pro",
            enabled: true
        },
        {
            id: "price_team",
            name: "Team",
            price: "$149",
            priceDetail: "/mo",
            description: "For small teams",
            tier: "team",
            enabled: true
        },
        {
            id: "price_enterprise",
            name: "Enterprise",
            price: "$799",
            priceDetail: "/mo",
            pricePrefix: "from ",
            description: "For protocols",
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
                            plan.tier === 'pro' ? 'card-highlighted -translate-y-1' : ''
                        }`}
                    >
                        {plan.tier === 'pro' && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                                    Most Popular
                                </span>
                            </div>
                        )}
                        <h2 className="text-xl font-light mb-2">{plan.name}</h2>
                        <div className="mb-4">
                            {plan.pricePrefix && <span className="text-gray-400 text-xs">{plan.pricePrefix}</span>}
                            <span className="text-4xl font-light gradient-text">{plan.price}</span>
                            <span className="text-gray-500 text-xs ml-1">{plan.priceDetail}</span>
                        </div>
                        <p className="text-gray-400 text-xs mb-6 flex-grow">{plan.description}</p>
                        <div className="flex justify-center mt-auto">
                            <PayButton
                                textOverride={
                                    isRedirecting
                                        ? 'Processing...'
                                        : plan.tier === 'free'
                                            ? 'Sign Up Free'
                                            : plan.tier === 'enterprise'
                                                ? 'Contact Sales'
                                                : plan.tier === 'team'
                                                    ? 'Start Free Trial'
                                                    : 'Start Free Trial'
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
                            <th className="p-4 text-white">Pro</th>
                            <th className="p-4 text-white">Team</th>
                            <th className="p-4 text-white">Enterprise</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">API Requests per Day</td>
                            <td className="p-4 text-gray-400 text-xs">1K</td>
                            <td className="p-4 text-gray-400 text-xs">10K</td>
                            <td className="p-4 text-gray-400 text-xs">100K</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Historical Data Access</td>
                            <td className="p-4 text-gray-400 text-xs">7 days</td>
                            <td className="p-4 text-gray-400 text-xs">30 days</td>
                            <td className="p-4 text-gray-400 text-xs">90 days</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Email Alerts</td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Discord/Telegram Alerts</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Webhook Endpoints</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4 text-gray-400 text-xs">5 endpoints</td>
                            <td className="p-4 text-gray-400 text-xs">50 endpoints</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">WebSocket Feed</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
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
                            <td className="p-4 font-light text-sm">Alert Delay</td>
                            <td className="p-4 text-gray-400 text-xs">24 hours</td>
                            <td className="p-4 text-gray-400 text-xs">&lt;5 min</td>
                            <td className="p-4 text-gray-400 text-xs">&lt;5 min</td>
                            <td className="p-4 text-gray-400 text-xs">&lt;5 min</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">User Seats</td>
                            <td className="p-4 text-gray-400 text-xs">1</td>
                            <td className="p-4 text-gray-400 text-xs">1</td>
                            <td className="p-4 text-gray-400 text-xs">5</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Support</td>
                            <td className="p-4 text-gray-400 text-xs">Community</td>
                            <td className="p-4 text-gray-400 text-xs">Email</td>
                            <td className="p-4 text-gray-400 text-xs">Priority</td>
                            <td className="p-4 text-gray-400 text-xs">Dedicated</td>
                        </tr>
                        <tr>
                            <td className="p-4 font-light text-sm">Custom SLAs</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
