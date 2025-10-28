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
            id: "price_personal",
            name: "Personal",
            price: "$19",
            priceDetail: "/month",
            tier: "personal",
            enabled: true
        },
        {
            id: "price_team",
            name: "Team",
            price: "$99",
            priceDetail: "/month",
            tier: "team",
            enabled: true
        },
        {
            id: "price_enterprise",
            name: "Enterprise",
            price: "$299",
            priceDetail: "/month",
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
        "name": "KAMIYO Security Intelligence for AI Agents",
        "description": "Security intelligence via MCP subscriptions or x402 API. Real-time exploit data from 20+ sources for AI agents. Claude Desktop integration available.",
        "url": "https://kamiyo.io/pricing",
        "brand": {
            "@type": "Brand",
            "name": "KAMIYO"
        },
        "offers": [
            {
                "@type": "Offer",
                "name": "Personal MCP Plan",
                "description": "Unlimited security queries via MCP. Claude Desktop integration with real-time data from 20+ exploit sources.",
                "price": "19",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock"
            },
            {
                "@type": "Offer",
                "name": "Team MCP Plan",
                "description": "Team subscription with 5 concurrent AI agents, team workspace, usage analytics, and priority support.",
                "price": "99",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock"
            },
            {
                "@type": "Offer",
                "name": "Enterprise MCP Plan",
                "description": "Unlimited AI agents with custom MCP tools, SLA guarantees (99.9%), dedicated support, and custom integrations.",
                "price": "299",
                "priceCurrency": "USD",
                "billingPeriod": "P1M",
                "availability": "https://schema.org/InStock"
            },
            {
                "@type": "Offer",
                "name": "x402 Pay-Per-Query API",
                "description": "Pay $0.01 per query with USDC on Base, Ethereum, or Solana. No account required. Perfect for custom integrations.",
                "price": "0.01",
                "priceCurrency": "USD",
                "priceSpecification": {
                    "@type": "UnitPriceSpecification",
                    "price": "0.01",
                    "priceCurrency": "USD",
                    "unitText": "query"
                },
                "availability": "https://schema.org/InStock"
            }
        ]
    };

    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-5 mx-auto" style={{ maxWidth: '1400px' }}>
            <Head>
                <title>Security Intelligence Pricing | MCP & x402 for AI Agents | KAMIYO</title>
                <meta name="description" content="KAMIYO Security Intelligence: MCP subscriptions ($19-299/mo) for unlimited queries or x402 API at $0.01 per query. Real-time exploit data from 20+ sources for AI agents. Claude Desktop integration available." />
                <meta name="keywords" content="MCP pricing, Claude Desktop security, x402 API, AI agent security, security intelligence, exploit data, crypto security API, pay per query, MCP server, Model Context Protocol, blockchain security, real-time exploit intelligence" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/pricing" />
                <meta property="og:title" content="Security Intelligence Pricing | MCP & x402 for AI Agents" />
                <meta property="og:description" content="MCP subscriptions for unlimited security queries or x402 API at $0.01 per query. Real-time exploit data for AI agents." />
                <meta property="og:site_name" content="KAMIYO" />

                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/pricing" />
                <meta name="twitter:title" content="Security Intelligence Pricing | MCP & x402 for AI Agents" />
                <meta name="twitter:description" content="Choose MCP for unlimited queries or x402 for pay-per-use. Security intelligence from 20+ exploit sources." />

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
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-left">Pricing for AI Agents | Security Intelligence</h1>
            </div>

            <section className="w-full pt-8 mb-16" aria-labelledby="mcp-subscriptions-heading">
                <h2 id="mcp-subscriptions-heading" className="text-3xl font-light text-center mb-4">MCP Subscriptions</h2>
                <p className="text-gray-400 text-sm text-center mb-8">
                    Unlimited security intelligence for your AI agents
                </p>
            </section>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full justify-center mb-16" role="list">
                {plans.map((plan) => (
                    <article
                        key={plan.tier}
                        className={`relative bg-black border ${plan.tier === 'team' ? 'border-cyan' : 'border-gray-500 border-opacity-25'} p-8 rounded-lg flex flex-col transition-all duration-300 card hover:-translate-y-1`}
                        itemScope
                        itemType="https://schema.org/Offer"
                        role="listitem"
                        title={`${plan.name} Plan: ${plan.price} per month for unlimited security queries`}
                    >
                        {plan.tier === 'team' && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                <span className="text-xs text-cyan" role="status">
                                    MOST POPULAR
                                </span>
                            </div>
                        )}
                        <h3 className="text-2xl font-light mb-2" itemProp="name">{plan.name}</h3>
                        <div className="mb-4" itemProp="priceSpecification" itemScope itemType="https://schema.org/PriceSpecification">
                            <span className="text-4xl font-light" itemProp="price">{plan.price}</span>
                            <span className="text-lg text-gray-500 ml-1" itemProp="priceCurrency" content="USD">{plan.priceDetail}</span>
                            <meta itemProp="valueAddedTaxIncluded" content="false" />
                        </div>

                        {/* Feature List */}
                        <ul className="space-y-3 mb-8 text-sm flex-grow" role="list" itemProp="description">
                            {plan.tier === 'personal' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Unlimited exploit queries</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Claude Desktop integration</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Real-time data (20+ sources)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Historical database access</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">WebSocket streaming</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'team' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Everything in Personal, plus:</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">5 concurrent AI agents</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Team workspace</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Usage analytics dashboard</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Webhook notifications</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Priority support</span>
                                    </li>
                                </>
                            )}
                            {plan.tier === 'enterprise' && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Everything in Team, plus:</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Unlimited AI agents</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Custom MCP tools</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">SLA guarantees (99.9%)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Dedicated support</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-cyan">✓</span>
                                        <span className="text-gray-300">Custom integrations</span>
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
                                        : plan.tier === 'personal'
                                            ? 'Add to Claude Desktop'
                                            : plan.tier === 'team'
                                                ? 'Subscribe Team Plan'
                                                : 'Contact Sales'
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

            {/* x402 API Section */}
            <div className="border-t border-gray-500 border-opacity-25 pt-16 w-full">
                <section className="mb-8" aria-labelledby="x402-heading">
                    <h2 id="x402-heading" className="text-3xl font-light text-center mb-4">x402 API</h2>
                    <p className="text-gray-400 text-sm text-center mb-8">
                        Pay per query, no subscription needed
                    </p>
                </section>

                <article
                    className="max-w-2xl mx-auto border border-gray-500 border-opacity-25 rounded-lg p-8"
                    itemScope
                    itemType="https://schema.org/PaymentMethod"
                    title="x402 Pay As You Go: $0.01 per query"
                >
                    <h3 className="text-2xl font-light mb-4" itemProp="name">Pay As You Go</h3>
                    <div className="mb-4">
                        <span className="text-4xl font-light" itemProp="price" content="0.01">$0.01</span>
                        <span className="text-lg text-gray-500"> per query</span>
                    </div>
                    <ul className="space-y-3 mb-8 text-sm" role="list">
                        <li className="flex items-start gap-2">
                            <span className="text-cyan">✓</span>
                            <span className="text-gray-300">No account required</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan">✓</span>
                            <span className="text-gray-300">Pay with USDC on Base/Ethereum/Solana</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan">✓</span>
                            <span className="text-gray-300">Same real-time data as MCP</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan">✓</span>
                            <span className="text-gray-300">24-hour payment tokens</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan">✓</span>
                            <span className="text-gray-300">Perfect for custom integrations</span>
                        </li>
                    </ul>
                    <div className="flex justify-center">
                        <PayButton
                            textOverride="View API Documentation"
                            onClickOverride={() => {
                                window.location.href = '/api-docs';
                            }}
                        />
                    </div>
                </article>
            </div>

            {/* Comparison Section */}
            <div className="mt-16 w-full">
                <h3 className="text-2xl font-light mb-8 text-center">Which should you choose?</h3>
                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <h4 className="text-xl font-light mb-4">Choose MCP if:</h4>
                        <ul className="space-y-2 text-gray-400">
                            <li>• Running persistent AI agents</li>
                            <li>• Need unlimited queries</li>
                            <li>• Want Claude Desktop integration</li>
                            <li>• Prefer monthly billing</li>
                        </ul>
                    </div>
                    <div className="border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <h4 className="text-xl font-light mb-4">Choose x402 API if:</h4>
                        <ul className="space-y-2 text-gray-400">
                            <li>• Building custom integrations</li>
                            <li>• Making sporadic queries</li>
                            <li>• Don't want subscriptions</li>
                            <li>• Prefer pay-per-use pricing</li>
                        </ul>
                    </div>
                </div>
            </div>

            <section className="mt-16 w-full" aria-labelledby="feature-comparison-heading">
                <h2 id="feature-comparison-heading" className="text-2xl mb-6 font-light">Feature Comparison: x402 and Subscription Plans</h2>
                <div className="overflow-x-auto border border-gray-500 border-opacity-25 rounded-lg">
                    <table className="w-full text-left" role="table" aria-label="Pricing plan feature comparison">
                        <thead>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="col" className="p-4 text-white">Features</th>
                            <th scope="col" className="p-4 text-white">Personal</th>
                            <th scope="col" className="p-4 text-white">Team</th>
                            <th scope="col" className="p-4 text-white">Enterprise</th>
                            <th scope="col" className="p-4 text-white">x402 API</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Pricing Model</th>
                            <td className="p-4 text-gray-400 text-xs">$19/month</td>
                            <td className="p-4 text-gray-400 text-xs">$99/month</td>
                            <td className="p-4 text-gray-400 text-xs">$299/month</td>
                            <td className="p-4 text-gray-400 text-xs">$0.01/query</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Query Limits</th>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">Pay per use</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Claude Desktop MCP</th>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Real-time Data (20+ sources)</th>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">WebSocket Streaming</th>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Concurrent AI Agents</th>
                            <td className="p-4 text-gray-400 text-xs">1</td>
                            <td className="p-4 text-gray-400 text-xs">5</td>
                            <td className="p-4 text-gray-400 text-xs">Unlimited</td>
                            <td className="p-4 text-gray-400 text-xs">N/A</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Account Required</th>
                            <td className="p-4 text-gray-400 text-xs">Yes</td>
                            <td className="p-4 text-gray-400 text-xs">Yes</td>
                            <td className="p-4 text-gray-400 text-xs">Yes</td>
                            <td className="p-4 text-gray-400 text-xs">No</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th scope="row" className="p-4 font-light text-sm">Support</th>
                            <td className="p-4 text-gray-400 text-xs">Email</td>
                            <td className="p-4 text-gray-400 text-xs">Priority</td>
                            <td className="p-4 text-gray-400 text-xs">Dedicated</td>
                            <td className="p-4 text-gray-400 text-xs">Community</td>
                        </tr>
                        <tr>
                            <th scope="row" className="p-4 font-light text-sm">SLA Guarantee</th>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan" aria-label="Included" title="Included" /></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500" aria-label="Not included" title="Not included" /></td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
