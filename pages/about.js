import Head from 'next/head';

export default function About() {
    // JSON-LD Structured Data for About/Organization page
    const organizationSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "KAMIYO",
        "legalName": "KAMIYO x402 Payment Facilitator",
        "url": "https://kamiyo.io",
        "logo": "https://kamiyo.io/favicon.png",
        "description": "Leading x402 Payment Facilitator platform implementing HTTP 402 Payment Required protocol for autonomous AI agent payments with on-chain USDC across Base, Ethereum, and Solana blockchains",
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
        "name": "About KAMIYO x402 Payment Facilitator",
        "url": "https://kamiyo.io/about",
        "description": "Learn about KAMIYO's x402 Payment Facilitator platform, HTTP 402 Payment Required implementation, and our mission to enable autonomous AI agent payments with on-chain USDC",
        "mainEntity": {
            "@id": "https://kamiyo.io/#organization"
        }
    };

    return (
        <div className="min-h-screen">
            <Head>
                <title>About KAMIYO | x402 Payment Facilitator for AI Agent Payments</title>
                <meta name="title" content="About KAMIYO | x402 Payment Facilitator for AI Agent Payments" />
                <meta name="description" content="KAMIYO is the leading x402 Payment Facilitator platform implementing HTTP 402 Payment Required for autonomous AI agents. On-chain USDC payments on Base, Ethereum, and Solana without account signup." />
                <meta name="keywords" content="x402 protocol, HTTP 402 Payment Required, payment facilitator, AI agent payments, on-chain API payments, USDC payments, autonomous agent billing, blockchain payment infrastructure, AI commerce platform, crypto micropayments, Web3 payments, decentralized payments" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.io/about" />

                {/* Robots Meta */}
                <meta name="robots" content="index, follow" />
                <meta name="language" content="English" />
                <meta name="author" content="KAMIYO" />

                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://kamiyo.io/about" />
                <meta property="og:title" content="About KAMIYO | x402 Payment Facilitator for AI Agent Payments" />
                <meta property="og:description" content="Leading x402 Payment Facilitator implementing HTTP 402 Payment Required for autonomous AI agents. On-chain USDC payments without account signup." />
                <meta property="og:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:url" content="https://kamiyo.io/about" />
                <meta name="twitter:title" content="About KAMIYO | x402 Payment Facilitator for AI Agent Payments" />
                <meta name="twitter:description" content="Leading x402 Payment Facilitator implementing HTTP 402 Payment Required for autonomous AI agents with on-chain USDC payments." />
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

            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;About</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">What is KAMIYO</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">x402 Payment Facilitator Platform</h4>
                        <p>KAMIYO is an x402 Payment Facilitator platform that implements the HTTP 402 Payment Required protocol, enabling autonomous AI agents to make seamless on-chain payments for API access without requiring accounts or API keys.</p>

                        <p>In the rapidly evolving AI agent economy, autonomous systems need frictionless ways to pay for services. Our platform enables pay-per-request API access using on-chain USDC payments on Base, Ethereum, and Solana blockchains, verified cryptographically in real-time.</p>

                        <p>By implementing the x402 protocol standard, we enable any AI agent or autonomous system to access APIs instantly with a simple payment transaction, making machine-to-machine commerce accessible to the next generation of intelligent systems.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Core Features</h4>
                        <ol start="1" data-spread="true">
                            <li>
                                <p><strong>HTTP 402 Protocol:</strong> Full implementation of the HTTP 402 Payment Required standard, enabling standardized payment-gated API access across any service or platform.</p>
                            </li>
                            <li>
                                <p><strong>Multi-Chain Support:</strong> Accept USDC payments on Base, Ethereum, and Solana blockchains, giving users flexibility in their preferred payment network.</p>
                            </li>
                            <li>
                                <p><strong>Pay-Per-Request Model:</strong> Transparent pricing at $0.0001 per API call, enabling micropayments for AI agents without subscription overhead or minimum commitments.</p>
                            </li>
                            <li>
                                <p><strong>No Accounts Required:</strong> AI agents can access APIs immediately with on-chain payments—no registration, no API keys, no identity verification needed.</p>
                            </li>
                            <li>
                                <p><strong>Cryptographic Verification:</strong> Every payment is verified on-chain with cryptographic proof, ensuring secure, trustless transactions without intermediaries.</p>
                            </li>
                            <li>
                                <p><strong>24-Hour Token Validity:</strong> Payment tokens remain valid for 24 hours, enabling efficient batch operations and reducing transaction costs for high-frequency users.</p>
                            </li>
                            <li>
                                <p><strong>Developer-Friendly SDK:</strong> Integrate x402 payments into your applications with our comprehensive SDK, supporting multiple programming languages and frameworks.</p>
                            </li>
                        </ol>

                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">How the Platform Works</h4>
                        <ul data-spread="true">
                            <li>
                                <p><strong>Payment Request:</strong><br/>When an API request requires payment, the server responds with HTTP 402 status code and payment instructions, including the payment address, amount, and supported blockchains.</p>
                            </li>
                            <li>
                                <p><strong>On-Chain Payment:</strong><br/>The AI agent or client sends USDC to the specified payment address on their preferred blockchain (Base, Ethereum, or Solana) with a unique memo identifying their request.</p>
                            </li>
                            <li>
                                <p><strong>Cryptographic Verification:</strong><br/>Our payment verifier monitors the blockchain, validates the transaction amount and memo, then generates a cryptographically signed payment token proving successful payment.</p>
                            </li>
                            <li>
                                <p><strong>API Access Granted:</strong><br/>The client includes the payment token in their API request header, our middleware verifies the signature, and the API responds with the requested data. Tokens remain valid for 24 hours for subsequent requests.</p>
                            </li>
                        </ul>
                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Our Mission</h4>
                        <p>We exist to enable the autonomous AI agent economy by providing frictionless, decentralized payment infrastructure for machine-to-machine commerce. As AI agents become increasingly autonomous, they need payment systems that work without human intervention, accounts, or traditional payment rails.</p>
                        <p>KAMIYO makes API access truly permissionless—any AI agent, anywhere, can pay for services on-chain and gain immediate access. We're building the payment layer for the next generation of autonomous systems.</p>
                    </div>
                </div>

            </section>
            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="mb-8 font-light text-sm uppercase tracking-widest text-cyan">— &nbsp;Technology</p>
                    <h3 className="text-3xl md:text-4xl lg:text-5xl font-light">Payment Infrastructure</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">BLOCKCHAIN NETWORKS</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Multi-Chain USDC Support</h4>
                        <p>We support USDC payments on Base (Layer 2 Ethereum with low fees), Ethereum mainnet (maximum decentralization), and Solana (high throughput). Each network is verified using native RPC providers and blockchain explorers.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">PAYMENT VERIFICATION</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Real-Time On-Chain Validation</h4>
                        <p>Our payment verifier monitors blockchain transactions in real-time, validates payment amounts and memo fields, then issues cryptographically signed tokens that prove payment authenticity without storing sensitive data.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">SECURITY</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Cryptographic Token System</h4>
                        <p>Payment tokens are signed using HMAC-SHA256 with secure server secrets, ensuring tokens cannot be forged or replayed. Each token includes transaction hash, chain ID, timestamp, and expiration for complete auditability.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">DEVELOPER TOOLS</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">SDK and Integration Libraries</h4>
                        <p>Our SDK provides language-specific libraries for Python, JavaScript, and other popular languages, handling payment flow, token management, and request retries automatically for seamless integration.</p>
                    </div>
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">API MIDDLEWARE</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">x402 Protocol Implementation</h4>
                        <p>Our FastAPI middleware implements the complete HTTP 402 Payment Required flow, automatically handling payment verification, token validation, and access control for any protected endpoint with minimal configuration.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">PAYMENT TRACKING</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Transaction Database</h4>
                        <p>Every payment is recorded in our database with full transaction details, enabling audit trails, usage analytics, and payment history tracking. Data is stored securely with encryption at rest.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">STANDARDS</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">HTTP 402 Protocol Standard</h4>
                        <p>We implement the HTTP 402 Payment Required status code as defined in RFC 2616, extended with the x402 protocol specification for on-chain cryptocurrency payments. This ensures interoperability with any compliant client or service.</p>
                        <p>Our platform adheres to blockchain best practices, using industry-standard libraries like web3.py and solana-py for maximum security and reliability in payment verification.</p>
                    </div>
                </div>
            </section>

        </div>
    );
}
