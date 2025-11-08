// components/X402PricingTiers.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import PayButton from './PayButton';

export default function X402PricingTiers({ showTitle = true }) {
    const router = useRouter();

    const tiers = [
        {
            name: "Free",
            tier: "free",
            price: "$0",
            priceDetail: "forever",
            features: [
                "1,000 verifications/month",
                "Solana & Base support",
                "Multi-chain USDC verification",
                "Community support",
                "Standard rate limits"
            ]
        },
        {
            name: "Starter",
            tier: "starter",
            price: "$99",
            priceDetail: "/mo",
            features: [
                "50,000 verifications/month",
                "Solana, Base & Ethereum",
                "Priority verification",
                "Email support",
                "Higher rate limits",
                "99.9% uptime SLA"
            ]
        },
        {
            name: "Pro",
            tier: "pro",
            price: "$299",
            priceDetail: "/mo",
            features: [
                "500,000 verifications/month",
                "6 blockchain networks",
                "Advanced risk scoring",
                "Priority support",
                "Custom rate limits",
                "99.95% uptime SLA"
            ]
        },
        {
            name: "Enterprise",
            tier: "enterprise",
            price: "$999",
            priceDetail: "/mo",
            features: [
                "Unlimited verifications",
                "All supported chains",
                "Custom integration support",
                "Dedicated support",
                "Custom SLA agreements",
                "On-premise deployment option"
            ]
        }
    ];

    const handleSelect = (tier) => {
        if (tier === 'enterprise') {
            router.push('/inquiries');
        } else {
            router.push('/dashboard/x402');
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
                        Start free and scale as you grow. All plans include multi-chain support.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {tiers.map((plan, index) => {
                    const isHighlighted = plan.tier === 'starter';

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

                                <div className="flex justify-center mt-auto pt-6">
                                    <PayButton
                                        textOverride={
                                            plan.tier === 'enterprise'
                                                ? 'Contact Sales'
                                                : plan.tier === 'free'
                                                ? 'Get Started'
                                                : 'Start Free Trial'
                                        }
                                        onClickOverride={() => handleSelect(plan.tier)}
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
