// components/X402PricingTiers.js
import Link from "next/link";

export default function X402PricingTiers({ showTitle = true }) {
    const tiers = [
        {
            name: "Free",
            price: "$0",
            period: "forever",
            description: "Perfect for testing and development",
            verifications: "1,000/mo",
            chains: "2 chains",
            features: [
                "1,000 verifications/month",
                "Solana & Base support",
                "Multi-chain USDC verification",
                "Community support",
                "Standard rate limits"
            ],
            cta: "Get Started Free",
            ctaLink: "/x402",
            highlighted: false
        },
        {
            name: "Starter",
            price: "$99",
            period: "/mo",
            description: "For growing applications",
            verifications: "50,000/mo",
            chains: "3 chains",
            features: [
                "50,000 verifications/month",
                "Solana, Base & Ethereum",
                "Priority verification",
                "Email support",
                "Higher rate limits",
                "99.9% uptime SLA"
            ],
            cta: "Start Free Trial",
            ctaLink: "/x402",
            highlighted: true
        },
        {
            name: "Pro",
            price: "$299",
            period: "/mo",
            description: "For production applications",
            verifications: "500,000/mo",
            chains: "6 chains",
            features: [
                "500,000 verifications/month",
                "6 blockchain networks",
                "Advanced risk scoring",
                "Priority support",
                "Custom rate limits",
                "99.95% uptime SLA"
            ],
            cta: "Start Free Trial",
            ctaLink: "/x402",
            highlighted: false
        },
        {
            name: "Enterprise",
            price: "$999",
            period: "/mo",
            description: "For high-volume operations",
            verifications: "Unlimited",
            chains: "All chains",
            features: [
                "Unlimited verifications",
                "All supported chains",
                "Custom integration support",
                "Dedicated support",
                "Custom SLA agreements",
                "On-premise deployment option"
            ],
            cta: "Contact Sales",
            ctaLink: "/inquiries",
            highlighted: false
        }
    ];

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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {tiers.map((tier) => (
                    <div
                        key={tier.name}
                        className="border border-gray-800 rounded-lg p-8 space-y-4"
                    >
                        <div>
                            <h4 className="text-xl font-light text-white mb-2">
                                {tier.name}
                            </h4>
                            <p className="text-gray-400 text-sm">
                                {tier.description}
                            </p>
                        </div>

                        <div>
                            <span className="text-4xl font-light text-white">
                                {tier.price}
                            </span>
                            <span className="text-gray-400 text-sm ml-1">
                                {tier.period}
                            </span>
                        </div>

                        <div className="border-t border-gray-800 pt-4">
                            <div className="text-sm text-gray-400 mb-1">
                                <span className="text-white font-light">
                                    {tier.verifications}
                                </span>{' '}
                                verifications
                            </div>
                            <div className="text-sm text-gray-400">
                                <span className="text-white font-light">
                                    {tier.chains}
                                </span>{' '}
                                supported
                            </div>
                        </div>

                        <ul className="space-y-2 border-t border-gray-800 pt-4">
                            {tier.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                    <svg
                                        className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                    <span className="text-gray-400">{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="pt-4">
                            <Link
                                href={tier.ctaLink}
                                className={`block text-center px-6 py-3 rounded-lg font-medium transition-colors ${
                                    tier.highlighted
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'border border-gray-600 hover:border-gray-500 text-white'
                                }`}
                            >
                                {tier.cta}
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12 text-center">
                <p className="text-gray-400 text-sm">
                    All plans include API access, Python & JavaScript SDKs, and production-ready infrastructure.{' '}
                    <Link href="/x402/docs" className="text-blue-400 hover:text-blue-300">
                        View documentation →
                    </Link>
                </p>
            </div>
        </div>
    );
}
