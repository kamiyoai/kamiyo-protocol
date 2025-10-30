import Head from 'next/head';
import { LinkButton } from "../components/Button";

export default function Features() {
    // JSON-LD Structured Data for Features page
    const itemListSchema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "KAMIYO Security Intelligence Platform Features",
        "description": "Complete list of features for KAMIYO's crypto exploit intelligence and security monitoring platform",
        "url": "https://kamiyo.io/features",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "20+ Source Aggregation",
                "description": "Real-time crypto exploit data from CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, and 15+ security researchers"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "MCP Integration for AI Agents",
                "description": "Native integration with Claude Desktop and AI agents via Model Context Protocol with unlimited queries"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": "Protocol Risk Scoring",
                "description": "AI-powered risk assessment based on exploit history, amount lost, time since incident, and attack patterns"
            },
            {
                "@type": "ListItem",
                "position": 4,
                "name": "Real-Time Detection",
                "description": "Exploits detected and indexed within minutes with critical alerts pushed immediately"
            },
            {
                "@type": "ListItem",
                "position": 5,
                "name": "Historical Database",
                "description": "Query 2+ years of exploit history filtered by chain, protocol, amount, and attack category"
            },
            {
                "@type": "ListItem",
                "position": 6,
                "name": "Wallet Screening",
                "description": "Check wallet addresses for involvement in known exploits with blacklist status and risk classification"
            },
            {
                "@type": "ListItem",
                "position": 7,
                "name": "x402 API Access",
                "description": "Alternative pay-per-query API access at $0.01 per query with on-chain USDC payments"
            }
        ]
    };

    const webPageSchema = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "Security Intelligence Features for AI Agents",
        "url": "https://kamiyo.io/features",
        "description": "KAMIYO security intelligence features: 20+ source aggregation, MCP integration for AI agents, protocol risk scoring, real-time exploit detection, and historical database",
        "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": "https://kamiyo.io"
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Features",
                    "item": "https://kamiyo.io/features"
                }
            ]
        }
    };

    return (
        <div className="min-h-screen">
            <Head>
                <title>Security Intelligence Features | AI Agent Integration | KAMIYO</title>
                <meta name="title" content="Security Intelligence Features | AI Agent Integration | KAMIYO" />
                <meta name="description" content="KAMIYO security intelligence features: 20+ source aggregation, MCP integration for AI agents, protocol risk scoring, real-time exploit detection, historical database, and wallet screening for crypto security monitoring." />
                <meta name="keywords" content="crypto security intelligence, AI agent security tools, MCP integration, protocol risk assessment, exploit detection, security monitoring, crypto intelligence API, blockchain security features, wallet screening, exploit database, AI security agents" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.io/features" />

                {/* Robots Meta */}
                <meta name="robots" content="index, follow" />
                <meta name="language" content="English" />
                <meta name="author" content="KAMIYO" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/features" />
                <meta property="og:title" content="Security Intelligence Features | AI Agent Integration" />
                <meta property="og:description" content="KAMIYO security intelligence features: 20+ source aggregation, MCP integration for AI agents, protocol risk scoring, and real-time exploit detection." />
                <meta property="og:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/features" />
                <meta name="twitter:title" content="Security Intelligence Features | AI Agent Integration" />
                <meta name="twitter:description" content="20+ source aggregation, MCP integration for AI agents, protocol risk scoring, and real-time exploit detection." />
                <meta name="twitter:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta name="twitter:site" content="@KAMIYO" />
                <meta name="twitter:creator" content="@KAMIYO" />

                {/* JSON-LD Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
                />
            </Head>

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;機能</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Security Intelligence for AI Agents</h1>
                    <p className="text-gray-400 mt-4 text-xl">Real-time crypto exploit data from 20+ sources. Access via MCP subscription or x402 API.</p>
                </div>

                {/* Security Intelligence Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">SECURITY INTELLIGENCE</p>
                        <h2 className="text-3xl md:text-4xl font-light">What You Get</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">20+ Source Aggregation</h3>
                            <p className="text-gray-400 text-sm">
                                CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, and 15+ more security
                                researchers. All exploits in one feed.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Real-Time Detection</h3>
                            <p className="text-gray-400 text-sm">
                                Exploits detected and indexed within minutes. Critical alerts pushed
                                immediately. $2.1B tracked in H1 2025.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Protocol Risk Scoring</h3>
                            <p className="text-gray-400 text-sm">
                                AI-powered risk assessment based on exploit history, amount lost,
                                time since last incident, and attack patterns.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Historical Database</h3>
                            <p className="text-gray-400 text-sm">
                                Query 2+ years of exploit history. Filter by chain, protocol, amount,
                                category. Learn from past incidents.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Source Quality Ranking</h3>
                            <p className="text-gray-400 text-sm">
                                Proprietary scoring algorithm ranks sources on speed, accuracy,
                                exclusivity, and coverage. Know which sources to trust.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Wallet Screening</h3>
                            <p className="text-gray-400 text-sm">
                                Check if wallet addresses are involved in known exploits.
                                Blacklist status and risk classification.
                            </p>
                        </div>
                    </div>
                </div>

                {/* MCP Integration Features */}
                <div className="mb-20 border-t border-gray-500/25 pt-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">AI AGENT INTEGRATION</p>
                        <h2 className="text-3xl md:text-4xl font-light">MCP Integration for AI Agents</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Claude Desktop Integration</h3>
                            <p className="text-gray-400 text-sm">
                                Add KAMIYO to Claude Desktop with one click. Your AI agents can
                                query exploit data during conversations and decision-making.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Unlimited Tool Calls</h3>
                            <p className="text-gray-400 text-sm">
                                MCP subscriptions include unlimited security queries. No per-query
                                charges, no rate limits. Your AI agents can check security freely.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Persistent Connections</h3>
                            <p className="text-gray-400 text-sm">
                                WebSocket connections for real-time updates. AI agents stay connected
                                and receive exploit alerts as they happen.
                            </p>
                        </div>

                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Team Collaboration</h3>
                            <p className="text-gray-400 text-sm">
                                Share MCP workspace with team. Multiple AI agents can access
                                security intelligence with centralized billing and analytics.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Alternative: x402 API Access */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">ALTERNATIVE ACCESS</p>
                        <h2 className="text-3xl md:text-4xl font-light">x402 API for Direct/Custom Integration</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Pay-Per-Query Access</h3>
                            <p className="mb-4">Don't need MCP? Access KAMIYO directly via x402 API with on-chain USDC payments:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>$0.01 per API query</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>No account creation required</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Pay with USDC on Base, Ethereum, or Solana</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Cryptographic verification on-chain</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Pricing: 100 queries per $1.00 USDC</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">HTTP 402 Payment Required</h3>
                            <p className="mb-4">Industry-standard payment protocol for API access:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Automatic price discovery via HTTP headers</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>JavaScript SDK for automated payments</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>REST API for custom integrations</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Payment tokens valid for 100 queries or 24 hours</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Full API docs: <LinkButton href="/api-docs">kamiyo.ai/api-docs</LinkButton></p>
                        </div>
                    </div>
                </div>

                {/* Billing Options */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">BILLING OPTIONS</p>
                        <h2 className="text-3xl md:text-4xl font-light">Choose Your Access Model</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">MCP Subscriptions (Recommended)</h3>
                            <p className="mb-4">Unlimited access for AI agents and teams:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Starter ($19/mo):</strong> 1 MCP connection, unlimited queries</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Pro ($99/mo):</strong> 5 MCP connections, team workspace, analytics</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Enterprise ($299/mo):</strong> Unlimited connections, SLA, priority support</span>
                                </li>
                            </ul>
                            <p className="mb-4">Credit card billing via Stripe. Includes Claude Desktop integration, WebSocket connections, and unlimited security queries.</p>
                            <p className="text-sm text-gray-500">Ideal for: AI agents, production apps, teams, high-frequency usage</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Pay-Per-Query (x402)</h3>
                            <p className="mb-4">Perfect for sporadic or custom access:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>No account creation required</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Pay only for what you use</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Instant access with on-chain USDC payment</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>$0.01 per API query (100 queries per $1)</span>
                                </li>
                            </ul>
                            <p className="mb-4">On-chain USDC payments on Base, Ethereum, or Solana. No subscription commitment.</p>
                            <p className="text-sm text-gray-500">Ideal for: Testing, low-volume users, custom integrations</p>
                        </div>
                    </div>
                </div>

                {/* Data Quality & Coverage */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">DATA QUALITY</p>
                        <h2 className="text-3xl md:text-4xl font-light">Comprehensive & Reliable Coverage</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Multi-Source Validation</h3>
                            <p className="mb-4">Every exploit is cross-referenced across multiple security researchers to ensure accuracy and reduce false positives.</p>
                            <p className="mb-4">Our proprietary source ranking algorithm evaluates:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Detection speed and timeliness</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Historical accuracy and false positive rate</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Exclusive coverage and unique insights</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">20+ security researchers, 2+ years of history</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Chain Coverage</h3>
                            <p className="mb-4">Comprehensive monitoring across all major chains:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Ethereum, Arbitrum, Optimism, Base, zkSync</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Solana, BNB Chain, Polygon, Avalanche</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Cosmos, Polkadot, Aptos, Sui, and more</span>
                                </li>
                            </ul>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">API Reliability</h3>
                            <p className="mb-4">Enterprise-grade infrastructure:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>99.9% uptime SLA (Enterprise tier)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Real-time monitoring and alerting</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Detailed usage analytics and reporting</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Built for production AI agents</p>
                        </div>
                    </div>
                </div>

            </section>

        </div>
    );
}
