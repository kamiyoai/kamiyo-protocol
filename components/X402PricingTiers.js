// components/X402PricingTiers.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import PayButton from './PayButton';

export default function X402PricingTiers({ showTitle = true }) {
    const router = useRouter();
    const [loading, setLoading] = useState(null);

    const tiers = [
        {
            name: "Protocol",
            tier: "free",
            price: "0.1%",
            priceDetail: "per escrow",
            features: [
                "Unlimited escrow agreements",
                "SOL, USDC, USDT support",
                "Multi-oracle dispute resolution",
                "On-chain reputation tracking",
                "Open source SDK"
            ],
            footnote: "Min 5,000 lamports per escrow. 2% fee on disputes (1% protocol + 1% oracle pool)."
        },
        {
            name: "Dashboard",
            tier: "starter",
            price: "$49",
            priceDetail: "/mo",
            features: [
                "Real-time escrow monitoring",
                "Dispute analytics",
                "Agent reputation insights",
                "Transaction history export",
                "Email alerts"
            ]
        },
        {
            name: "Team",
            tier: "pro",
            price: "$199",
            priceDetail: "/mo",
            features: [
                "Everything in Dashboard",
                "Multi-agent management",
                "Custom oracle panels",
                "API access for analytics",
                "Priority support"
            ]
        },
        {
            name: "Enterprise",
            tier: "enterprise",
            price: "Custom",
            priceDetail: "",
            features: [
                "Everything in Team",
                "Private oracle network",
                "Custom fee structures",
                "Dedicated account manager",
                "SLA guarantees"
            ]
        }
    ];

    const handleSelect = async (tier) => {
        if (tier === 'enterprise') {
            router.push('/inquiries');
            return;
        }

        if (tier === 'free') {
            router.push('/api-docs');
            return;
        }

        setLoading(tier);

        try {
            const response = await fetch('/api/v1/x402/billing/create-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tier,
                    success_url: `${window.location.origin}/dashboard?checkout=success`,
                    cancel_url: `${window.location.origin}/pricing?checkout=cancelled`
                })
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('Checkout error:', error);
                alert(`Error: ${error.error || 'Failed to create checkout session'}`);
                setLoading(null);
                return;
            }

            const data = await response.json();

            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error('No checkout URL returned');
            }
        } catch (error) {
            console.error('Failed to create checkout session:', error);
            alert('Failed to start checkout. Please try again or contact support.');
            setLoading(null);
        }
    };

    return (
        <div className="w-full">
            {showTitle && (
                <div className="text-center mb-12">
                    <h3 className="text-3xl font-light mb-4 text-white">
                        Simple, Transparent Pricing
                    </h3>
                    <p className="text-gray-400 text-lg">
                        Pay-per-use protocol fees. Optional dashboard for monitoring and analytics.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {tiers.map((plan, index) => {
                    const isHighlighted = false;

                    return (
                        <div
                            key={plan.tier}
                            className={`relative bg-black ${isHighlighted ? 'border border-transparent bg-gradient-to-br from-cyan via-cyan to-magenta bg-clip-padding' : 'border border-gray-500 border-opacity-25'} rounded-lg ${isHighlighted ? '-translate-y-1' : ''} hover:-translate-y-1 transition-all duration-300 flex flex-col`}
                            itemScope
                            itemType="https://schema.org/Offer"
                            style={isHighlighted ? {
                                background: 'linear-gradient(black, black) padding-box, linear-gradient(135deg, #00f0ff, #ff44f5) border-box'
                            } : {}}
                        >
                            <div className="p-6 flex flex-col flex-grow">
                                {isHighlighted && (
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                        <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                                            Most Popular
                                        </span>
                                    </div>
                                )}

                                <h3 className="text-xl font-light mb-2" itemProp="name">{plan.name}</h3>

                                <div className="mb-6" itemProp="priceSpecification" itemScope itemType="https://schema.org/PriceSpecification">
                                    {plan.pricePrefix && <span className="text-gray-500 text-xs mr-1">{plan.pricePrefix}</span>}
                                    <span className="text-4xl font-light gradient-text" itemProp="price">{plan.price}</span>
                                    <span className="text-gray-500 text-xs ml-1" itemProp="priceCurrency" content="USD">{plan.priceDetail}</span>
                                </div>

                                <ul className="space-y-2 mb-6 text-xs flex-grow" role="list">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start gap-2">
                                            <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-gray-300">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <meta itemProp="availability" content="https://schema.org/InStock" />
                                <meta itemProp="url" content={`https://kamiyo.ai/pricing#${plan.tier}`} />

                                {plan.footnote && (
                                    <p className="text-gray-500 text-xs mt-4 mb-2">{plan.footnote}</p>
                                )}

                                <div className="flex justify-center mt-auto pt-6">
                                    <PayButton
                                        textOverride={
                                            loading === plan.tier
                                                ? 'Processing...'
                                                : plan.tier === 'enterprise'
                                                ? 'Contact Sales'
                                                : plan.tier === 'free'
                                                ? 'View Docs'
                                                : 'Get Started'
                                        }
                                        onClickOverride={() => handleSelect(plan.tier)}
                                        disabled={loading !== null}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
