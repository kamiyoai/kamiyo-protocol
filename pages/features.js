import Head from 'next/head';

export default function Features() {
    // JSON-LD Structured Data for Features page
    const itemListSchema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "KAMIYO x402 Payment Facilitator Features",
        "description": "Complete list of features for the x402 Payment Facilitator platform",
        "url": "https://kamiyo.io/features",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "HTTP 402 Payment Required Protocol",
                "description": "Full implementation of HTTP 402 Payment Required standard for payment-gated API access with autonomous AI agent support"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Multi-Chain USDC Support",
                "description": "Accept USDC payments on Base, Ethereum, and Solana blockchains with automatic verification"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": "Pay-Per-Request Model",
                "description": "Transparent pricing at $0.10 per 1,000 API calls with micropayments for AI agents"
            },
            {
                "@type": "ListItem",
                "position": 4,
                "name": "No Account Required",
                "description": "AI agents can access APIs immediately with on-chain payments without registration or API keys"
            },
            {
                "@type": "ListItem",
                "position": 5,
                "name": "Cryptographic Verification",
                "description": "Every payment is verified on-chain with cryptographic proof ensuring secure trustless transactions"
            },
            {
                "@type": "ListItem",
                "position": 6,
                "name": "JavaScript SDK",
                "description": "Automated x402 payment handling with detection, verification, and retry logic built-in"
            },
            {
                "@type": "ListItem",
                "position": 7,
                "name": "WebSocket Support",
                "description": "Real-time WebSocket connections with x402 authentication for high-frequency trading and monitoring"
            }
        ]
    };

    const webPageSchema = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": "x402 Payment Facilitator Features",
        "url": "https://kamiyo.io/features",
        "description": "Explore KAMIYO's x402 payment protocol features: HTTP 402 Payment Required, multi-chain USDC support, cryptographic verification, and developer tools",
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
                <title>x402 Features | Payment Protocol Capabilities | KAMIYO</title>
                <meta name="title" content="x402 Features | Payment Protocol Capabilities | KAMIYO" />
                <meta name="description" content="Explore x402 Payment Facilitator features: HTTP 402 Payment Required protocol, multi-chain USDC support on Base/Ethereum/Solana, cryptographic verification, JavaScript SDK, and WebSocket connections for AI agents." />
                <meta name="keywords" content="x402 features, HTTP 402 capabilities, payment protocol features, multi-chain payments, AI agent integration, USDC payments, blockchain API features, on-chain payment verification, payment facilitator features, crypto micropayments, Web3 API features" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.io/features" />

                {/* Robots Meta */}
                <meta name="robots" content="index, follow" />
                <meta name="language" content="English" />
                <meta name="author" content="KAMIYO" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/features" />
                <meta property="og:title" content="x402 Features | Payment Protocol Capabilities" />
                <meta property="og:description" content="Explore x402 Payment Facilitator features: HTTP 402 protocol, multi-chain USDC support, cryptographic verification, and developer tools for AI agents." />
                <meta property="og:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/features" />
                <meta name="twitter:title" content="x402 Features | Payment Protocol Capabilities" />
                <meta name="twitter:description" content="HTTP 402 protocol, multi-chain USDC support, cryptographic verification, and developer tools for AI agents." />
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

            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Features</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">x402 Payment Facilitator</h1>
                    <p className="text-gray-400 mt-4">On-chain payments for API access. No accounts. No credentials. Just pay and access.</p>
                </div>

                {/* Core x402 Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">CORE FEATURES</p>
                        <h2 className="text-2xl md:text-3xl font-light">HTTP 402 Payment Required</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Pay-Per-Use API Access</h3>
                            <p className="mb-4">APIs return HTTP 402 Payment Required when authentication is needed. Payment details are included in response headers, allowing AI agents to discover pricing and payment addresses automatically.</p>
                            <p className="mb-4">No account creation, no API keys to manage, no OAuth flows. Just send a USDC payment on-chain and receive an access token valid for 1,000 API calls (24 hours).</p>
                            <p className="mb-4">Perfect for autonomous AI agents that need instant API access without human intervention for signup flows.</p>
                            <p className="text-sm text-gray-500">Pricing: $0.10 per 1,000 API calls</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Multi-Chain USDC Support</h3>
                            <p className="mb-4">Pay with USDC on your preferred blockchain:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Base:</strong> Low fees (~$0.01), fast confirmation (~2 seconds)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Ethereum:</strong> Maximum security, established network</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Solana:</strong> Ultra-low fees (~$0.0001), instant finality</span>
                                </li>
                            </ul>
                            <p className="mb-4">AI agents automatically choose the optimal chain based on balance availability and transaction costs.</p>
                            <p className="text-sm text-gray-500">Supported: Base, Ethereum mainnet, Solana mainnet</p>
                        </div>
                    </div>
                </div>

                {/* Payment Verification */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">VERIFICATION</p>
                        <h2 className="text-2xl md:text-3xl font-light">Cryptographic Payment Proof</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">On-Chain Verification</h3>
                            <p className="mb-4">All payments are verified directly on the blockchain using RPC endpoints. No centralized database of credentials, no API keys that can leak, no passwords to remember.</p>
                            <p className="mb-4">Payment verification checks:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Transaction exists and is confirmed on-chain</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Correct recipient address (KAMIYO payment address)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Sufficient payment amount (minimum $0.10 USDC)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Payment hasn't been used before (no double-spend)</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Verification time: ~5-30 seconds</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Access Token Generation</h3>
                            <p className="mb-4">After payment verification, receive a secure access token:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Valid for 1,000 API requests</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Expires after 24 hours</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Cryptographically signed JWT token</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Include in X-Payment-Token header for API calls</span>
                                </li>
                            </ul>
                            <p className="mb-4">Tokens are tied to the blockchain transaction hash, providing cryptographic proof of payment without storing sensitive credentials.</p>
                            <p className="text-sm text-gray-500">Token format: kmy_xxxxxxxxx</p>
                        </div>
                    </div>
                </div>

                {/* Developer Tools */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">DEVELOPER TOOLS</p>
                        <h2 className="text-2xl md:text-3xl font-light">SDKs & Integrations</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">JavaScript SDK</h3>
                            <p className="mb-4">Official JavaScript SDK handles the complete x402 payment flow automatically:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Detect HTTP 402 responses automatically</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Extract payment details from response headers</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Send USDC payment on preferred chain</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Wait for verification and receive access token</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Retry original request with token</span>
                                </li>
                            </ul>
                            <p className="mb-4">Install: <code className="text-xs bg-black border border-gray-500 border-opacity-25 px-2 py-1 rounded">npm install kamiyo-x402-sdk</code></p>
                            <p className="text-sm text-gray-500">Works in Node.js and browsers</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">REST API</h3>
                            <p className="mb-4">Complete REST API for manual integration:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><code className="text-xs">GET /x402/supported-chains</code> - List payment chains</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><code className="text-xs">GET /x402/pricing</code> - Get current pricing</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><code className="text-xs">POST /x402/verify-payment</code> - Verify payment and get token</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><code className="text-xs">GET /x402/token/status</code> - Check token usage</span>
                                </li>
                            </ul>
                            <p className="mb-4">All endpoints return standardized x402 headers for payment discovery and verification status.</p>
                            <p className="text-sm text-gray-500">Full API docs: <a href="/api-docs" className="text-cyan hover:text-magenta">kamiyo.ai/api-docs</a></p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">WebSocket Support</h3>
                            <p className="mb-4">Real-time WebSocket connections support x402 authentication. Send payment transaction hash via WebSocket message to authenticate connection.</p>
                            <p className="text-sm text-gray-500">Available: Pro/Team/Enterprise tiers</p>
                        </div>
                    </div>
                </div>

                {/* Subscription Alternative */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">BILLING OPTIONS</p>
                        <h2 className="text-2xl md:text-3xl font-light">Flexible Payment Models</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Pay-Per-Use (x402)</h3>
                            <p className="mb-4">Perfect for AI agents and low-volume users:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>No account creation</span>
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
                                    <span>Instant access with on-chain payment</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>$0.10 per 1,000 API calls</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Ideal for: AI agents, developers, testing</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Monthly Subscriptions</h3>
                            <p className="mb-4">Better value for high-volume usage:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Pro ($89/mo):</strong> 50K calls/day, WebSockets, email support</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Team ($199/mo):</strong> 100K calls/day, multiple API keys, analytics</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Enterprise ($499/mo):</strong> Unlimited calls, custom integrations, SLA</span>
                                </li>
                            </ul>
                            <p className="mb-4">Traditional credit card billing via Stripe. Includes API key management, dashboard access, and priority support.</p>
                            <p className="text-sm text-gray-500">Ideal for: Production apps, teams, high-volume users</p>
                        </div>
                    </div>
                </div>

                {/* Security & Compliance */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">SECURITY</p>
                        <h2 className="text-2xl md:text-3xl font-light">Enterprise-Grade Security</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">No Credential Storage</h3>
                            <p className="mb-4">Unlike traditional API key systems, x402 payments don't require storing user credentials. Every payment is verified on-chain, eliminating the risk of credential database breaches.</p>
                            <p className="mb-4">Access tokens are short-lived (24 hours) and tied to blockchain transactions, providing natural rate limiting and preventing unauthorized access.</p>
                            <p className="text-sm text-gray-500">Zero stored passwords, zero leaked API keys</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">CSRF Protection</h3>
                            <p className="mb-4">All state-changing endpoints (payment verification, token generation) require CSRF tokens to prevent cross-site request forgery attacks.</p>
                            <p className="text-sm text-gray-500">SameSite cookies, X-CSRF-Token headers</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Rate Limiting</h3>
                            <p className="mb-4">Automatic rate limiting based on payment tier and token usage:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Per-token request tracking</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Redis-backed rate limit counters</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Automatic token expiration after 1,000 calls or 24 hours</span>
                                </li>
                            </ul>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">Monitoring & Logging</h3>
                            <p className="mb-4">Enterprise tier includes:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Payment verification audit logs</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>API usage analytics and reporting</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Real-time error tracking (Sentry integration)</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Available: Enterprise tier</p>
                        </div>
                    </div>
                </div>

            </section>

        </div>
    );
}
