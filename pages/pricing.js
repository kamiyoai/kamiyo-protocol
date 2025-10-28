// pages/pricing.js
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import PayButton from "../components/PayButton";
import { useSession } from "next-auth/react";
import { MinusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
// SEO component will be imported once created by another agent
// import SEO from "../components/SEO";

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
            price: "$89",
            priceDetail: "/mo",
            tier: "pro",
            enabled: true
        },
        {
            id: "price_team",
            name: "Team",
            price: "$199",
            priceDetail: "/mo",
            tier: "team",
            enabled: true
        },
        {
            id: "price_enterprise",
            name: "Enterprise",
            price: "$499",
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

    // JSON-LD structured data for pricing offers
    const pricingSchema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "KAMIYO x402 Payment Facilitator API",
        "description": "HTTP 402 Payment Required API with on-chain USDC payments for AI agents. Pay-per-request or subscribe to exploit intelligence API with x402 protocol support on Base, Ethereum, and Solana blockchains.",
        "url": "https://kamiyo.io/pricing",
        "brand": {
            "@type": "Brand",
            "name": "KAMIYO"
        },
        "offers": [
            {
                "@type": "Offer",
                "name": "x402 Pay-Per-Use",
                "description": "Pay-per-request on-chain USDC payments with HTTP 402 Payment Required workflow. Perfect for AI agents requiring autonomous payment capabilities without accounts or API keys.",
                "price": "0.0001",
                "priceCurrency": "USDC",
                "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": "0.0001",
                    "priceCurrency": "USDC",
                    "unitText": "API call"
                },
                "availability": "https://schema.org/InStock",
                "availableAtOrFrom": {
                    "@type": "Place",
                    "name": "Base, Ethereum, Solana blockchains"
                },
                "eligibleQuantity": {
                    "@type": "QuantitativeValue",
                    "value": "1000",
                    "unitText": "requests per USDC"
                }
            },
            {
                "@type": "Offer",
                "name": "Free Tier",
                "description": "Free access to x402 pay-per-use payments with USDC on Base, Ethereum, or Solana. 1,000 API calls per day with HTTP 402 Payment Required protocol support.",
                "price": "0",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
                "eligibleDuration": {
                    "@type": "QuantitativeValue",
                    "value": "P1D",
                    "unitText": "1,000 API calls per day"
                }
            },
            {
                "@type": "Offer",
                "name": "Pro Plan",
                "description": "Professional subscription with 50,000 API calls per day, WebSocket connections, JavaScript SDK access, and email support. Includes x402 protocol support for AI agent payments.",
                "price": "89",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock",
                "eligibleQuantity": {
                    "@type": "QuantitativeValue",
                    "value": "50000",
                    "unitText": "API calls per day"
                }
            },
            {
                "@type": "Offer",
                "name": "Team Plan",
                "description": "Team subscription with 100,000 API calls per day, multiple API keys, usage analytics dashboard, and priority support. Full x402 payment protocol integration.",
                "price": "199",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock",
                "eligibleQuantity": {
                    "@type": "QuantitativeValue",
                    "value": "100000",
                    "unitText": "API calls per day"
                }
            },
            {
                "@type": "Offer",
                "name": "Enterprise Plan",
                "description": "Enterprise-grade API access with unlimited calls, custom payment integrations, 99.9% SLA guarantee, and dedicated support engineer. Full HTTP 402 Payment Required protocol customization.",
                "price": "499",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock",
                "priceValidUntil": "2025-12-31"
            }
        ]
    };

    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-5 mx-auto" style={{ maxWidth: '1400px' }}>
            <Head>
                <title>x402 API Pricing | Pay-Per-Request with USDC On-Chain | KAMIYO</title>
                <meta name="description" content="KAMIYO x402 Payment Facilitator: Pay-per-request API with on-chain USDC payments on Base, Ethereum, and Solana. HTTP 402 Payment Required protocol for AI agents. No accounts needed, $0.0001 per call." />
                <meta name="keywords" content="x402, HTTP 402 Payment Required, API pricing, pay per request, USDC payments, on-chain payments, AI agent payments, blockchain API, Base USDC, Ethereum USDC, Solana USDC, payment facilitator, exploit intelligence API, real-time security data" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/pricing" />
                <meta property="og:title" content="x402 API Pricing | Pay-Per-Request with USDC On-Chain" />
                <meta property="og:description" content="Pay-per-request API with HTTP 402 Payment Required protocol. On-chain USDC payments on Base, Ethereum, and Solana. Perfect for AI agents." />
                <meta property="og:site_name" content="KAMIYO" />

                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/pricing" />
                <meta name="twitter:title" content="x402 API Pricing | Pay-Per-Request with USDC On-Chain" />
                <meta name="twitter:description" content="HTTP 402 Payment Required protocol with on-chain USDC payments. Perfect for AI agents needing autonomous payment capabilities." />

                {/* Additional SEO */}
                <meta name="robots" content="index, follow" />
                <meta name="language" content="English" />
                <meta name="revisit-after" content="7 days" />
                <meta name="author" content="KAMIYO" />
                <link rel="canonical" href="https://kamiyo.io/pricing" />

                {/* JSON-LD Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
                />
            </Head>
            <div className="w-full flex flex-col items-start border-dotted border-b border-cyan mb-6 pb-6">
                <p className="font-light text-left text-sm uppercase tracking-widest text-cyan mb-8" role="doc-subtitle">— &nbsp;Pricing Options</p>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-left">x402 API Pricing</h1>
            </div>

            <section className="w-full pt-8 mb-8" aria-labelledby="subscription-plans-heading">
                <h2 id="subscription-plans-heading" className="text-2xl font-light text-center mb-4">Subscription Plans with x402 Support</h2>
                <p className="text-gray-400 text-sm text-center mb-8">
                    Monthly billing with included API calls. All plans support <strong>x402 protocol</strong> for <strong>AI agent payments</strong>.
                </p>
            </section>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full justify-center" role="list">
                {plans.map((plan) => (
                    <article
                        key={plan.tier}
                        className={`relative bg-black border border-gray-500 border-opacity-25 p-8 rounded-2xl flex flex-col transition-all duration-300 card hover:-translate-y-1 ${
                            plan.tier === 'pro' ? 'card-highlighted -translate-y-1' : ''
                        }`}
                        itemScope
                        itemType="https://schema.org/Offer"
                        role="listitem"
                        title={`${plan.name} Plan: ${plan.tier === 'free' ? 'Free x402 pay-per-use access with USDC payments' : plan.tier === 'enterprise' ? 'Unlimited API calls with custom integrations' : `${plan.price} per month with included API calls`}`}
                    >
                        {plan.tier === 'pro' && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full" role="status">
                                    Most Popular
                                </span>
                            </div>
                        )}
                        <h3 className="text-xl font-light mb-2" itemProp="name">{plan.name} Plan</h3>
                        <div className="mb-6" itemProp="priceSpecification" itemScope itemType="https://schema.org/PriceSpecification">
                            {plan.pricePrefix && <span className="text-gray-400 text-xs">{plan.pricePrefix}</span>}
                            <span className="text-4xl font-light gradient-text" itemProp="price">{plan.price}</span>
                            <span className="text-gray-500 text-xs ml-1" itemProp="priceCurrency" content="USD">{plan.priceDetail}</span>
                            <meta itemProp="valueAddedTaxIncluded" content="false" />
                        </div>

                        {/* Feature List */}
                        <ul className="space-y-2 mb-6 text-xs flex-grow" role="list" itemProp="description">
                            {plan.tier === 'free' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300"><strong>x402 protocol</strong> pay-per-use access</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">1,000 API calls per day</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">On-chain <strong>USDC payments</strong> (Base/Ethereum/Solana)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">No account required for <strong>AI agent payments</strong></span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'pro' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Everything in Free + <strong>x402 protocol</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">50,000 API calls per day</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Real-time WebSocket connections</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">JavaScript SDK for <strong>AI agent integration</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Email support</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'team' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Everything in Pro + <strong>x402 support</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">100,000 API calls per day</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Multiple API keys for team access</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Usage analytics dashboard</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Priority support</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'enterprise' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Everything in Team + full <strong>x402 customization</strong></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Unlimited API calls</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Custom <strong>HTTP 402 Payment Required</strong> integrations</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">99.9% SLA guarantee</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                                            <title>Check icon</title>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-gray-300">Dedicated support engineer</span>
                                    </li>
                                </>
                            )}
                        </ul>

                        <meta itemProp="availability" content="https://schema.org/InStock" />
                        <meta itemProp="url" content={`https://kamiyo.io/pricing#${plan.tier}`} />

                        <div className="flex justify-center mt-auto pt-6">
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
                    </article>
                ))}
            </div>

            {/* x402 Pay-per-Use info */}
            <article
                className="w-full bg-black p-6 rounded-lg mt-12"
                itemScope
                itemType="https://schema.org/PaymentMethod"
                title="x402 Pay-per-Use: On-chain USDC payments with HTTP 402 Payment Required protocol"
            >
                <h3 className="text-cyan text-lg mb-2" itemProp="name">x402 Pay-per-Use</h3>
                <p className="text-gray-400 text-sm mb-4" itemProp="description">
                    <strong>HTTP 402 Payment Required protocol</strong> with on-chain USDC payments.
                    No account required. Perfect for <strong>AI agent autonomous payments</strong>.
                </p>
                <div className="text-white text-3xl font-light mb-2" itemProp="price" content="0.0001">
                    $0.0001 <span className="text-gray-500 text-sm">per API call</span>
                </div>
                <div className="text-gray-400 text-xs mb-4">10,000 requests per $1.00 USDC</div>
                <ul className="space-y-2 text-xs text-gray-400 mb-4" role="list">
                    <li className="flex items-start gap-2">
                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                            <title>Check icon</title>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Pay with USDC on <strong>Base, Ethereum, or Solana</strong> blockchains</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                            <title>Check icon</title>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span><strong>HTTP 402 Payment Required</strong> workflow</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                            <title>Check icon</title>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Payment tokens valid for 24 hours</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" role="img">
                            <title>Check icon</title>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>No signup or API keys required for <strong>AI agent payments</strong></span>
                    </li>
                </ul>
                <a href="/api-docs#x402" className="text-cyan hover:text-magenta text-sm transition-colors" aria-label="Learn more about x402 protocol">
                    Learn more about x402 protocol →
                </a>
            </article>

            <section className="mt-16 w-full" aria-labelledby="feature-comparison-heading">
                <h2 id="feature-comparison-heading" className="text-2xl mb-6 font-light">Feature Comparison: x402 and Subscription Plans</h2>
                <div className="overflow-x-auto border border-gray-500 border-opacity-25 rounded-lg">
                    <table className="w-full text-left" role="table" aria-label="Pricing plan feature comparison">
                        <thead>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="col" className="p-4 text-white">Features</th>
                            <th scope="col" className="p-4 text-white">Free</th>
                            <th scope="col" className="p-4 text-white">Pro</th>
                            <th scope="col" className="p-4 text-white">Team</th>
                            <th scope="col" className="p-4 text-white">Enterprise</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Email Alerts</th>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">API Requests per Day</th>
                            <td className="p-4 text-gray-400 text-xs">1,000</td>
                            <td className="p-4 text-gray-400 text-xs">50,000</td>
                            <td className="p-4 text-gray-400 text-xs">100,000</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Historical Data API</th>
                            <td className="p-4 text-gray-400 text-xs">7 days</td>
                            <td className="p-4 text-gray-400 text-xs">90 days</td>
                            <td className="p-4 text-gray-400 text-xs">1 year</td>
                            <td className="p-4 text-gray-400 text-xs">2+ years</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Email Alerts</th>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Discord/Telegram Alerts</th>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Custom Alert Routing</th>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">WebSocket Feed</th>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">CSV/JSON Export</th>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Alert Speed</th>
                            <td className="p-4 text-gray-400 text-xs">24-hour delay</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                            <td className="p-4 text-gray-400 text-xs">Real-time</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Support</th>
                            <td className="p-4 text-gray-400 text-xs">Community</td>
                            <td className="p-4 text-gray-400 text-xs">Email</td>
                            <td className="p-4 text-gray-400 text-xs">Priority</td>
                            <td className="p-4 text-gray-400 text-xs">Dedicated</td>
                        </tr>
                        <tr>
                            <th scope="row" className="p-4 font-light text-sm">Custom SLAs</th>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
