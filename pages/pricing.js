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
            tier: "free",
            enabled: true
        },
        {
            id: "price_pro",
            name: "Pro",
            price: "$99",
            priceDetail: "/mo",
            tier: "pro",
            enabled: true
        },
        {
            id: "price_team",
            name: "Team",
            price: "$299",
            priceDetail: "/mo",
            tier: "team",
            enabled: true
        },
        {
            id: "price_enterprise",
            name: "Enterprise",
            price: "$999",
            priceDetail: "/mo",
            pricePrefix: "from ",
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
                        <div className="mb-6">
                            {plan.pricePrefix && <span className="text-gray-400 text-xs">{plan.pricePrefix}</span>}
                            <span className="text-4xl font-light gradient-text">{plan.price}</span>
                            <span className="text-gray-500 text-xs ml-1">{plan.priceDetail}</span>
                        </div>

                        {/* Feature List */}
                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            {plan.tier === 'free' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Real-time alerts</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">10 alerts/month</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Public dashboard</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Email only</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'pro' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Unlimited real-time alerts</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">50K API req/day</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">WebSocket feed</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Discord/Telegram/Email</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Historical data (90 days)</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'team' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Everything in Pro</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">5 webhook endpoints</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">5 team seats</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Slack integration</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Priority support</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'enterprise' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">50 webhook endpoints</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Custom alert routing</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Protocol watchlists</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Historical data API (2+ years)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Dedicated support</span>
                                    </li>
                                </>
                            )}
                        </ul>

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
                            <td className="p-4 font-light text-sm">Alerts per Month</td>
                            <td className="p-4 text-gray-400 text-xs">10</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">API Requests per Day</td>
                            <td className="p-4 text-gray-400 text-xs">1K</td>
                            <td className="p-4 text-gray-400 text-xs">50K</td>
                            <td className="p-4 text-gray-400 text-xs">200K</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Historical Data API</td>
                            <td className="p-4 text-gray-400 text-xs">7 days</td>
                            <td className="p-4 text-gray-400 text-xs">90 days</td>
                            <td className="p-4 text-gray-400 text-xs">1 year</td>
                            <td className="p-4 text-gray-400 text-xs">2+ years</td>
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
                            <td className="p-4 text-gray-400 text-xs">5</td>
                            <td className="p-4 text-gray-400 text-xs">50</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Protocol Watchlists</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Custom Alert Routing</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
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
                            <td className="p-4 font-light text-sm">Alert Speed</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
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
