import Head from 'next/head';

export default function About() {
    // JSON-LD Structured Data for About/Organization page
    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "KAMIYO",
        "legalName": "KAMIYO Security Intelligence",
        "url": "https://kamiyo.io",
        "logo": "https://kamiyo.io/favicon.png",
        "description": "Real-time cryptocurrency exploit intelligence platform for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources.",
        "foundingDate": "2024",
        "sameAs": [
            "https://twitter.com/KAMIYO",
            "https://github.com/kamiyo-ai"
        ],
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Customer Support",
            "email": "support@kamiyo.io",
            "url": "https://kamiyo.io"
        }
    };

    const aboutPageSchema = {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        "name": "About KAMIYO Security Intelligence",
        "url": "https://kamiyo.io/about",
        "description": "Learn about KAMIYO's real-time cryptocurrency exploit intelligence platform, MCP subscription model, x402 API access, and our mission to protect AI agents with security intelligence from 20+ sources",
        "mainEntity": {
            "@id": "https://kamiyo.io/#organization"
        }
    };

    return (
        <div className="min-h-screen">
            <Head>
                <title>About KAMIYO | Security Intelligence for AI Agents</title>
                <meta name="title" content="About KAMIYO | Security Intelligence for AI Agents" />
                <meta name="description" content="KAMIYO provides real-time cryptocurrency exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources including CertiK, PeckShield, BlockSec, and SlowMist." />
                <meta name="keywords" content="security intelligence, crypto exploits, AI agent security, MCP protocol, x402 API, exploit intelligence, DeFi security, blockchain security, CertiK, PeckShield, BlockSec, SlowMist, real-time security data" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.io/about" />

                {/* Robots Meta */}
                <meta name="robots" content="index, follow" />
                <meta name="language" content="English" />
                <meta name="author" content="KAMIYO" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/about" />
                <meta property="og:title" content="About KAMIYO | Security Intelligence for AI Agents" />
                <meta property="og:description" content="Real-time cryptocurrency exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources." />
                <meta property="og:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/about" />
                <meta name="twitter:title" content="About KAMIYO | Security Intelligence for AI Agents" />
                <meta name="twitter:description" content="Real-time cryptocurrency exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources." />
                <meta name="twitter:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta name="twitter:site" content="@KAMIYO" />
                <meta name="twitter:creator" content="@KAMIYO" />

                {/* JSON-LD Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageSchema) }}
                />
            </Head>

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;私たちについて</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">What is KAMIYO</h1>
                    <h4 className="text-xl md:text-2xl mt-4 text-cyan">Security Intelligence for AI Agents</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <p>KAMIYO is a real-time cryptocurrency exploit intelligence platform that aggregates security data from 20+ sources including CertiK, PeckShield, BlockSec, SlowMist, and more. We provide AI agents with instant access to exploit alerts, protocol risk scores, and historical security data.</p>

                        <p>AI agents access KAMIYO through MCP (Model Context Protocol) subscriptions for unlimited queries, or via x402 API for pay-per-query access. Both methods provide the same real-time security intelligence from our comprehensive database tracking $2.1B+ in exploits.</p>

                        <p>In the rapidly evolving AI agent economy, autonomous systems deploying billions in DeFi need instant access to threat data. KAMIYO aggregates exploit data from every major security researcher, verifies it for accuracy, and delivers it to AI agents within minutes of detection.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Core Features</h4>
                        <ol start="1" data-spread="true">
                            <li>
                                <p><strong>20+ Source Aggregation:</strong> Real-time exploit data from CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, and 15+ other leading security researchers, all in one feed.</p>
                            </li>
                            <li>
                                <p><strong>Multi-Chain Coverage:</strong> Monitor exploits on Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, and 15+ other chains with comprehensive security intelligence across the entire crypto ecosystem.</p>
                            </li>
                            <li>
                                <p><strong>Flexible Access:</strong> MCP subscriptions ($19/99/299/mo) for unlimited queries or x402 pay-per-query ($0.01) for direct API access. Choose the model that fits your use case.</p>
                            </li>
                            <li>
                                <p><strong>No Accounts Required (x402 API):</strong> AI agents can access security intelligence immediately with on-chain payments—no registration, no API keys, no identity verification needed for x402 access.</p>
                            </li>
                            <li>
                                <p><strong>Source Verification:</strong> Proprietary quality scoring validates exploit reports before indexing, ensuring high-accuracy security intelligence from trusted researchers.</p>
                            </li>
                            <li>
                                <p><strong>Real-Time WebSocket Streaming:</strong> MCP subscribers receive instant exploit alerts via persistent WebSocket connection, enabling immediate defensive actions.</p>
                            </li>
                            <li>
                                <p><strong>Developer-Friendly Integration:</strong> MCP server for Claude Desktop and x402 SDK for custom implementations, supporting multiple programming languages and frameworks.</p>
                            </li>
                        </ol>

                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">Access Method 1: MCP Subscription (AI Agents)</h4>
                        <ul data-spread="true">
                            <li>
                                <p><strong>Subscribe:</strong> Sign up for MCP subscription at kamiyo.ai/pricing ($19/99/299/mo based on query volume).</p>
                            </li>
                            <li>
                                <p><strong>Add to Claude Desktop:</strong> Install KAMIYO MCP server in your AI agent configuration for persistent security access.</p>
                            </li>
                            <li>
                                <p><strong>Unlimited Queries:</strong> Your AI agent calls security tools during decision-making without per-query costs or rate limits.</p>
                            </li>
                            <li>
                                <p><strong>Real-Time Updates:</strong> Persistent WebSocket connection for instant exploit alerts as they're detected and verified.</p>
                            </li>
                        </ul>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Access Method 2: x402 API (Direct Access)</h4>
                        <ul data-spread="true">
                            <li>
                                <p><strong>API Request:</strong> Send query to kamiyo.ai/exploits/latest-alert without any authentication.</p>
                            </li>
                            <li>
                                <p><strong>402 Response:</strong> Server returns payment instructions with amount ($0.01 USDC) and supported chains.</p>
                            </li>
                            <li>
                                <p><strong>Pay $0.01 USDC:</strong> Send payment on Base/Ethereum/Solana with unique memo identifying your request.</p>
                            </li>
                            <li>
                                <p><strong>Get Data:</strong> Receive exploit intelligence, token valid 24 hours for subsequent queries.</p>
                            </li>
                        </ul>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Our Mission</h4>
                        <p>We exist to protect the AI agent economy by providing real-time security intelligence that prevents exploits before they cause damage. As AI agents deploy billions in DeFi, they need instant access to threat data. KAMIYO makes security intelligence accessible through both MCP subscriptions for persistent AI access and x402 API for direct queries.</p>
                        <p>Our mission: Aggregate exploit data from every major security researcher, verify it for accuracy, and deliver it to AI agents within minutes of detection. We're building the security intelligence layer for autonomous systems.</p>
                    </div>
                </div>

            </section>
            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="mb-8 font-light text-sm uppercase tracking-widest text-cyan">— &nbsp;技術</p>
                    <h3 className="text-3xl md:text-4xl lg:text-5xl font-light">Security Intelligence Infrastructure</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">DATA AGGREGATION</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">20+ Security Source Integration</h4>
                        <p>We aggregate exploit data from CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, and 15+ other leading security researchers. Each source is monitored continuously with proprietary scrapers and API integrations for real-time intelligence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">QUALITY SCORING</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Source Verification System</h4>
                        <p>Proprietary algorithm scores sources on speed, exclusivity, reliability, coverage, and accuracy. Exploit reports are cross-verified across multiple sources and validated before indexing to ensure high-quality intelligence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">MCP INTEGRATION</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Model Context Protocol Server</h4>
                        <p>Native MCP server for Claude Desktop and other MCP-compatible AI agents. Provides persistent WebSocket connection for real-time exploit alerts and security tools that agents can call during decision-making.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">DEVELOPER TOOLS</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">SDK and Integration Libraries</h4>
                        <p>MCP server for AI agents and x402 SDK for custom implementations. Supports Python, JavaScript, and other popular languages with comprehensive documentation and examples.</p>
                    </div>
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">x402 API</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Pay-Per-Query Access</h4>
                        <p>Our FastAPI implementation supports HTTP 402 Payment Required for pay-per-query access. AI agents pay $0.01 USDC on Base/Ethereum/Solana for direct security intelligence without accounts or subscriptions.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">EXPLOIT DATABASE</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Historical Intelligence Storage</h4>
                        <p>Comprehensive database tracking $2.1B+ in exploits across 20+ chains. Every incident includes protocol, chain, amount, date, source, and verification status for complete audit trails and historical analysis.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">REAL-TIME STREAMING</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">WebSocket Alert System</h4>
                        <p>MCP subscribers receive instant exploit alerts via persistent WebSocket connection. Enables AI agents to pause trading, exit positions, or trigger defensive actions within seconds of exploit detection.</p>
                        <p>Our platform adheres to security best practices with rate limiting, token expiration, cryptographic verification, and comprehensive logging for auditability and compliance.</p>
                    </div>
                </div>
            </section>

        </div>
    );
}
