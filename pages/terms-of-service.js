// pages/terms.js
import SEO from "../components/SEO";

export default function TermsOfService() {
    const lastUpdated = "October 29, 2025";

    return (
        <>
            <SEO
                title="Terms of Service | KAMIYO x402 Payment Verification"
                description="KAMIYO Terms of Service covering acceptable use, payment terms, API usage limits, liability, and your rights. Read before using our x402 payment verification service."
                canonical="https://kamiyo.ai/terms-of-service"
                noindex={false}
            />
            <div className="min-h-screen bg-black text-white">
                <div className="max-w-4xl mx-auto px-5 py-16">
                    {/* Header */}
                    <header className="mb-12 border-b border-gray-500/25 pb-8">
                        <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;利用規約</p>
                        <h1 className="text-4xl md:text-5xl font-light mb-4 leading-[1.25]">Terms of Service</h1>
                        <p className="text-gray-400 text-sm">
                            Last Updated: <time dateTime="2025-10-29">{lastUpdated}</time>
                        </p>
                    </header>

                    {/* Introduction */}
                    <section className="mb-12">
                        <p className="text-gray-300 leading-relaxed mb-4">
                            These Terms of Service ("Terms", "Agreement") govern your access to and use of the KAMIYO x402 payment verification infrastructure ("Service") operated by Kamiyo.ai ("KAMIYO", "we", "us", or "our"). The Service provides multi-chain USDC payment verification API and all related services, tools, and features accessible at kamiyo.ai.
                        </p>
                        <p className="text-gray-300 leading-relaxed mb-4">
                            By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access or use the Service.
                        </p>
                        <div className="bg-black border border-cyan border-opacity-50 rounded-lg p-4 mt-6">
                            <p className="text-sm font-semibold text-cyan mb-2">IMPORTANT NOTICE</p>
                            <p className="text-sm text-gray-300">
                                These Terms contain an arbitration clause and class action waiver that affect your legal rights. Please read Section 18 carefully.
                            </p>
                        </div>
                    </section>

                    {/* Table of Contents */}
                    <nav className="mb-12 bg-black border border-gray-500/25 rounded-lg p-6">
                        <h2 className="text-xl font-light mb-4">Table of Contents</h2>
                        <ol className="space-y-2 text-sm text-gray-400">
                            <li><a href="#service-description" className="hover:text-magenta transition-colors">1. Service Description</a></li>
                            <li><a href="#account-registration" className="hover:text-magenta transition-colors">2. Account Registration and Security</a></li>
                            <li><a href="#subscription-terms" className="hover:text-magenta transition-colors">3. MCP Subscription Terms</a></li>
                            <li><a href="#x402-terms" className="hover:text-magenta transition-colors">4. x402 API Terms</a></li>
                            <li><a href="#payment-terms" className="hover:text-magenta transition-colors">5. Payment Terms</a></li>
                            <li><a href="#acceptable-use" className="hover:text-magenta transition-colors">6. Acceptable Use Policy</a></li>
                            <li><a href="#api-usage" className="hover:text-magenta transition-colors">7. API Usage and Rate Limits</a></li>
                            <li><a href="#intellectual-property" className="hover:text-magenta transition-colors">8. Intellectual Property Rights</a></li>
                            <li><a href="#data-accuracy" className="hover:text-magenta transition-colors">9. Data Accuracy and Service Limitations</a></li>
                            <li><a href="#warranties-disclaimer" className="hover:text-magenta transition-colors">10. Warranties Disclaimer</a></li>
                            <li><a href="#limitation-liability" className="hover:text-magenta transition-colors">11. Limitation of Liability</a></li>
                            <li><a href="#indemnification" className="hover:text-magenta transition-colors">12. Indemnification</a></li>
                            <li><a href="#termination" className="hover:text-magenta transition-colors">13. Termination and Suspension</a></li>
                            <li><a href="#modifications" className="hover:text-magenta transition-colors">14. Modifications to Service and Terms</a></li>
                            <li><a href="#privacy" className="hover:text-magenta transition-colors">15. Privacy and Data Protection</a></li>
                            <li><a href="#third-party" className="hover:text-magenta transition-colors">16. Third-Party Services and Links</a></li>
                            <li><a href="#governing-law" className="hover:text-magenta transition-colors">17. Governing Law and Jurisdiction</a></li>
                            <li><a href="#dispute-resolution" className="hover:text-magenta transition-colors">18. Dispute Resolution and Arbitration</a></li>
                            <li><a href="#general-provisions" className="hover:text-magenta transition-colors">19. General Provisions</a></li>
                            <li><a href="#contact" className="hover:text-magenta transition-colors">20. Contact Information</a></li>
                        </ol>
                    </nav>

                    {/* Section 1 */}
                    <section id="service-description" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            1. Service Description
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>KAMIYO provides multi-chain USDC payment verification through the x402 API with the following subscription tiers:</p>

                            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                <h3 className="font-semibold text-white mb-2">Free Tier</h3>
                                <ul className="text-sm space-y-1 ml-4 list-disc list-inside">
                                    <li>1,000 verifications/month</li>
                                    <li>Solana & Base blockchain support</li>
                                    <li>Community support</li>
                                    <li>Standard rate limits</li>
                                </ul>
                            </div>

                            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                <h3 className="font-semibold text-white mb-2">Starter Plan - $99/month</h3>
                                <ul className="text-sm space-y-1 ml-4 list-disc list-inside">
                                    <li>50,000 verifications/month</li>
                                    <li>Solana, Base & Ethereum support</li>
                                    <li>Email support (48h response)</li>
                                    <li>99.9% uptime SLA</li>
                                </ul>
                            </div>

                            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                <h3 className="font-semibold text-white mb-2">Pro Plan - $299/month</h3>
                                <ul className="text-sm space-y-1 ml-4 list-disc list-inside">
                                    <li>500,000 verifications/month</li>
                                    <li>6 blockchain networks</li>
                                    <li>Advanced risk scoring</li>
                                    <li>Priority support (24h response)</li>
                                    <li>Webhook integration</li>
                                    <li>99.95% uptime SLA</li>
                                </ul>
                            </div>

                            <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                <h3 className="font-semibold text-white mb-2">Enterprise Plan - $999/month</h3>
                                <ul className="text-sm space-y-1 ml-4 list-disc list-inside">
                                    <li>Unlimited verifications</li>
                                    <li>All supported blockchain networks</li>
                                    <li>Custom integration support</li>
                                    <li>24/7 dedicated support</li>
                                    <li>Custom SLA agreements</li>
                                    <li>On-premise deployment option</li>
                                </ul>
                            </div>

                            <p className="mt-4">
                                The Service verifies USDC payment transactions across multiple blockchain networks including Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, and others.
                            </p>
                        </div>
                    </section>

                    {/* Section 2 */}
                    <section id="account-registration" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            2. Account Registration and Security
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">2.1 Account Requirement</h3>
                            <p>
                                MCP subscriptions require account registration. x402 API access does not require an account. By creating an account, you represent that:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>You are at least 18 years of age</li>
                                <li>You have the legal capacity to enter into this Agreement</li>
                                <li>All information you provide is accurate and complete</li>
                                <li>You will maintain the accuracy of this information</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">2.2 Account Security</h3>
                            <p>You are responsible for:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Maintaining the confidentiality of your account credentials</li>
                                <li>All activities that occur under your account</li>
                                <li>Notifying us immediately of any unauthorized access</li>
                                <li>Ensuring your password meets security requirements</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">2.3 API Keys</h3>
                            <p>
                                API keys (prefixed with "kmy_") are sensitive credentials. You must:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Store API keys securely and never commit them to public repositories</li>
                                <li>Rotate API keys if you suspect they have been compromised</li>
                                <li>Use separate API keys for development, staging, and production</li>
                                <li>Not share API keys with unauthorized third parties</li>
                            </ul>

                            <div className="bg-black border border-cyan border-opacity-50 rounded-lg p-4 mt-4">
                                <p className="text-sm font-semibold text-cyan mb-2">SECURITY WARNING</p>
                                <p className="text-sm">
                                    We are not liable for losses resulting from compromised credentials. Implement proper security practices including secrets management, environment variables, and regular key rotation.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section 3 */}
                    <section id="subscription-terms" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            3. Subscription Terms
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">3.1 Subscription Plans</h3>
                            <p>
                                Paid subscriptions (Starter, Pro, Enterprise) are billed monthly and renew automatically until cancelled. See Section 1 for plan details and pricing.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">3.2 Auto-Renewal</h3>
                            <p>
                                Subscriptions automatically renew on the monthly anniversary of your subscription date. You will be charged the then-current subscription fee unless you cancel before the renewal date. We will provide notice of any price changes at least 30 days in advance.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">3.3 Cancellation</h3>
                            <p>
                                You may cancel your subscription at any time through your account dashboard. Cancellation is effective at the end of the current billing period. No refunds are provided for partial months.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">3.4 Downgrades and Upgrades</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Upgrades:</strong> Effective immediately with prorated charges</li>
                                <li><strong className="text-white">Downgrades:</strong> Effective at the end of the current billing period</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">3.5 Free Tier</h3>
                            <p>
                                The Free tier provides 1,000 verifications per month at no cost. Free tier accounts may be subject to rate limiting and do not include SLA guarantees. We reserve the right to modify or discontinue the Free tier at any time.
                            </p>
                        </div>
                    </section>

                    {/* Section 4 */}
                    <section id="x402-terms" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            4. x402 API Usage
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">4.1 API Access</h3>
                            <p>
                                The x402 API provides multi-chain USDC payment verification. API access is provided through API keys based on your subscription tier:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Free tier: 1,000 verifications/month</li>
                                <li>Starter: 50,000 verifications/month</li>
                                <li>Pro: 500,000 verifications/month</li>
                                <li>Enterprise: Unlimited verifications</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">4.2 Supported Blockchains</h3>
                            <p>The x402 API verifies USDC payment transactions on the following blockchains (availability varies by tier):</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Solana</li>
                                <li>Base</li>
                                <li>Ethereum</li>
                                <li>Polygon</li>
                                <li>Arbitrum</li>
                                <li>Optimism</li>
                                <li>Additional chains (Pro and Enterprise tiers)</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">4.3 Service Level Agreements</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Response time: &lt;500ms average (Starter, Pro, Enterprise)</li>
                                <li>Uptime SLA: 99.9% (Starter), 99.95% (Pro), 99.99% (Enterprise)</li>
                                <li>Free tier: Best-effort, no SLA guarantees</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">4.4 Blockchain Verification</h3>
                            <div className="bg-black border border-cyan border-opacity-50 rounded-lg p-4">
                                <p className="text-sm font-semibold text-cyan mb-2">IMPORTANT NOTICE</p>
                                <p className="text-sm space-y-2">
                                    The x402 API verifies transactions on public blockchains. You acknowledge:
                                </p>
                                <ul className="text-sm list-disc list-inside ml-4 mt-2 space-y-1">
                                    <li>Blockchain data is sourced from third-party RPC providers</li>
                                    <li>Network delays or outages may affect verification speed</li>
                                    <li>We are not responsible for blockchain network issues</li>
                                    <li>All verifications are final and non-reversible</li>
                                </ul>
                                <p className="text-sm mt-2">
                                    We are not liable for losses due to incorrect addresses, failed transactions, or blockchain network issues.
                                </p>
                            </div>

                            <h3 className="text-lg font-light text-cyan mt-6">4.5 No Refunds</h3>
                            <p>
                                All x402 payments are final. We do not provide refunds for unused queries, expired tokens, or failed blockchain transactions.
                            </p>
                        </div>
                    </section>

                    {/* Section 5 */}
                    <section id="payment-terms" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            5. Payment Terms
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">5.1 MCP Subscription Payments</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Processed securely through Stripe (PCI DSS Level 1 certified)</li>
                                <li>Billed monthly in USD</li>
                                <li>We do not store credit card information</li>
                                <li>Payment method must remain valid for auto-renewal</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">5.2 Failed Payments</h3>
                            <p>If a subscription payment fails:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>We will attempt to charge your payment method up to 3 times</li>
                                <li>You will receive email notifications of failed payments</li>
                                <li>Your account may be suspended if payment is not resolved within 7 days</li>
                                <li>Suspended accounts are subject to termination after 30 days</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">5.3 Taxes</h3>
                            <p>
                                Prices exclude applicable taxes (VAT, GST, sales tax, etc.). You are responsible for all taxes associated with your purchase. We will collect taxes if required by law.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">5.4 Refund Policy</h3>
                            <p>
                                <strong className="text-white">No refunds are provided</strong> except as required by law or at our sole discretion. This includes:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Partial month subscriptions</li>
                                <li>Unused subscription time after cancellation</li>
                                <li>x402 payments and unused query tokens</li>
                                <li>Dissatisfaction with the Service</li>
                            </ul>
                            <p className="mt-4">
                                Exception: If we terminate your account for reasons other than Terms violations, we will provide a prorated refund for the unused portion of your subscription.
                            </p>
                        </div>
                    </section>

                    {/* Section 6 */}
                    <section id="acceptable-use" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            6. Acceptable Use Policy
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>You agree not to use the Service to:</p>

                            <h3 className="text-lg font-light text-cyan mt-6">6.1 Prohibited Activities</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Violate any applicable laws, regulations, or third-party rights</li>
                                <li>Engage in illegal activities including money laundering or terrorist financing</li>
                                <li>Distribute malware, viruses, or malicious code</li>
                                <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
                                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                                <li>Remove or modify any proprietary notices or labels</li>
                                <li>Use the Service to compete with us or build a competing product</li>
                                <li>Sell, resell, or commercially exploit the Service without authorization</li>
                                <li>Scrape, crawl, or spider the Service beyond normal API usage</li>
                                <li>Interfere with or disrupt the Service or servers</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">6.2 Data Usage Restrictions</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Do not use data obtained from the Service for illegal purposes</li>
                                <li>Do not redistribute our data without proper attribution</li>
                                <li>Do not create derivative databases from our data for commercial resale</li>
                                <li>Comply with all applicable securities laws when using exploit intelligence</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">6.3 Rate Limiting Compliance</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Do not attempt to circumvent rate limits</li>
                                <li>Do not use multiple accounts to evade rate limiting</li>
                                <li>Do not use distributed systems to generate excessive load</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">6.4 Enforcement</h3>
                            <p>
                                Violations of this Acceptable Use Policy may result in immediate account suspension or termination without refund. We reserve the right to investigate violations and cooperate with law enforcement.
                            </p>
                        </div>
                    </section>

                    {/* Section 7 */}
                    <section id="api-usage" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            7. API Usage and Rate Limits
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">7.1 Rate Limits</h3>
                            <p>To ensure fair usage and Service availability, we enforce the following rate limits:</p>

                            <div className="space-y-3 mt-4">
                                <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">MCP Subscriptions</h4>
                                    <ul className="text-sm space-y-1">
                                        <li><strong>Personal:</strong> 100 requests/minute, 10,000 requests/day</li>
                                        <li><strong>Team:</strong> 500 requests/minute, 50,000 requests/day</li>
                                        <li><strong>Enterprise:</strong> Custom limits, SLA guarantees</li>
                                    </ul>
                                </div>

                                <div className="bg-black border border-gray-500/25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">x402 API</h4>
                                    <ul className="text-sm space-y-1">
                                        <li><strong>Per Token:</strong> 100 total queries over 24 hours</li>
                                        <li><strong>Burst Limit:</strong> 10 requests/second per token</li>
                                    </ul>
                                </div>
                            </div>

                            <h3 className="text-lg font-light text-cyan mt-6">7.2 Rate Limit Responses</h3>
                            <p>When you exceed rate limits, you will receive:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>HTTP 429 Too Many Requests status code</li>
                                <li>Retry-After header indicating when to retry</li>
                                <li>X-RateLimit-* headers with limit information</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">7.3 Uptime and Availability</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Personal/Team:</strong> Best effort, no SLA guarantees</li>
                                <li><strong className="text-white">Enterprise:</strong> 99.9% uptime SLA with service credits</li>
                                <li>Scheduled maintenance windows announced 48 hours in advance</li>
                                <li>Emergency maintenance may occur without notice</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">7.4 API Versioning</h3>
                            <p>
                                We maintain API versioning to ensure backward compatibility. Breaking changes will be introduced in new API versions with at least 90 days notice before deprecation of old versions.
                            </p>
                        </div>
                    </section>

                    {/* Section 8 */}
                    <section id="intellectual-property" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            8. Intellectual Property Rights
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">8.1 Our Intellectual Property</h3>
                            <p>
                                The Service, including all software, algorithms, data aggregation methods, documentation, logos, and trademarks, is owned by KAMIYO and protected by intellectual property laws. This Agreement grants you a limited, non-exclusive, non-transferable license to use the Service as permitted herein.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">8.2 Your Data</h3>
                            <p>
                                You retain all rights to data you input into the Service. By using the Service, you grant us a worldwide, royalty-free license to use, process, and analyze your API queries solely to provide and improve the Service.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">8.3 Third-Party Data</h3>
                            <p>
                                Security intelligence data is aggregated from third-party sources. We do not claim ownership of source data. Our intellectual property includes the aggregation, processing, normalization, and presentation of this data.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">8.4 Restrictions</h3>
                            <p>You may not:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Copy, modify, or create derivative works of the Service</li>
                                <li>Reverse engineer or attempt to extract source code</li>
                                <li>Use KAMIYO trademarks without written permission</li>
                                <li>Remove or modify any copyright or proprietary notices</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 9 */}
                    <section id="data-accuracy" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            9. Data Accuracy and Service Limitations
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <div className="bg-black border border-cyan border-opacity-50 rounded-lg p-4">
                                <p className="text-sm font-semibold text-cyan mb-2">IMPORTANT DISCLAIMER</p>
                                <p className="text-sm">
                                    KAMIYO aggregates security intelligence from third-party sources. While we strive for accuracy, we do not guarantee the completeness, timeliness, or correctness of any data provided through the Service.
                                </p>
                            </div>

                            <h3 className="text-lg font-light text-cyan mt-6">9.1 No Investment Advice</h3>
                            <p>
                                The Service provides informational data only. It does not constitute financial, investment, legal, or professional advice. You should not make investment decisions based solely on our data. Always conduct your own research and consult qualified professionals.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">9.2 Third-Party Data Sources</h3>
                            <p>
                                We aggregate data from 20+ third-party sources. We are not responsible for:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Errors, omissions, or inaccuracies in source data</li>
                                <li>Delays in third-party data updates</li>
                                <li>Availability or reliability of third-party sources</li>
                                <li>Changes to third-party data formats or APIs</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">9.3 Security Limitations</h3>
                            <p>
                                Security intelligence is inherently reactive. The Service may not detect:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Zero-day exploits not yet publicly disclosed</li>
                                <li>Novel attack vectors</li>
                                <li>Private exploits known only to attackers</li>
                                <li>Rapidly evolving security situations</li>
                            </ul>
                            <p className="mt-4">
                                <strong className="text-white">Do not rely solely on KAMIYO for security decisions.</strong> Implement defense-in-depth strategies and multiple security layers.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">9.4 Use at Your Own Risk</h3>
                            <p>
                                You acknowledge that using security intelligence data carries inherent risks. You use the Service at your own risk and are solely responsible for any decisions or actions taken based on data obtained from the Service.
                            </p>
                        </div>
                    </section>

                    {/* Section 10 */}
                    <section id="warranties-disclaimer" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            10. Warranties Disclaimer
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <div className="bg-black border border-magenta/50 rounded-lg p-4">
                                <p className="text-sm font-semibold text-magenta mb-2">DISCLAIMER OF WARRANTIES</p>
                                <p className="text-sm uppercase">
                                    THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
                                </p>
                            </div>

                            <p className="mt-6">KAMIYO does not warrant that:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>The Service will meet your requirements or expectations</li>
                                <li>The Service will be uninterrupted, timely, secure, or error-free</li>
                                <li>The results obtained from the Service will be accurate or reliable</li>
                                <li>The quality of data, information, or services will meet your expectations</li>
                                <li>Any errors in the Service will be corrected</li>
                            </ul>

                            <p className="mt-4">
                                No advice or information, whether oral or written, obtained from KAMIYO or through the Service shall create any warranty not expressly stated in these Terms.
                            </p>
                        </div>
                    </section>

                    {/* Section 11 */}
                    <section id="limitation-liability" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            11. Limitation of Liability
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <div className="bg-black border border-magenta/50 rounded-lg p-4">
                                <p className="text-sm font-semibold text-magenta mb-2">LIMITATION OF LIABILITY</p>
                                <p className="text-sm uppercase mb-3">
                                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, KAMIYO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, WHETHER IN AN ACTION IN CONTRACT, TORT (INCLUDING NEGLIGENCE), OR OTHERWISE, ARISING OUT OF OR IN CONNECTION WITH THE SERVICE OR THESE TERMS.
                                </p>
                                <p className="text-sm">
                                    THIS INCLUDES WITHOUT LIMITATION:
                                </p>
                                <ul className="text-sm list-disc list-inside ml-4 mt-2 space-y-1">
                                    <li>Financial losses from trading or investment decisions</li>
                                    <li>Security breaches or exploits not detected by the Service</li>
                                    <li>Losses due to data inaccuracies or delays</li>
                                    <li>Losses from Service downtime or unavailability</li>
                                    <li>Losses from blockchain transaction failures</li>
                                    <li>Losses from unauthorized account access</li>
                                </ul>
                            </div>

                            <h3 className="text-lg font-light text-cyan mt-6">Maximum Liability Cap</h3>
                            <p>
                                IN NO EVENT SHALL KAMIYO'S TOTAL LIABILITY TO YOU FOR ALL DAMAGES EXCEED THE GREATER OF:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>The amount you paid to KAMIYO in the 12 months preceding the claim, OR</li>
                                <li>$100 USD</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Exceptions</h3>
                            <p>
                                Some jurisdictions do not allow the exclusion or limitation of liability for consequential or incidental damages. In such jurisdictions, our liability is limited to the maximum extent permitted by law.
                            </p>
                        </div>
                    </section>

                    {/* Section 12 */}
                    <section id="indemnification" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            12. Indemnification
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                You agree to indemnify, defend, and hold harmless KAMIYO, its officers, directors, employees, agents, and affiliates from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including attorney's fees) arising from:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Your use or misuse of the Service</li>
                                <li>Your violation of these Terms</li>
                                <li>Your violation of any third-party rights, including intellectual property rights</li>
                                <li>Your violation of any applicable laws or regulations</li>
                                <li>Any decisions or actions you take based on data from the Service</li>
                                <li>Unauthorized access to your account due to your failure to maintain account security</li>
                            </ul>

                            <p className="mt-4">
                                We reserve the right to assume the exclusive defense and control of any matter subject to indemnification, in which case you agree to cooperate with our defense of such claim.
                            </p>
                        </div>
                    </section>

                    {/* Section 13 */}
                    <section id="termination" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            13. Termination and Suspension
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">13.1 Termination by You</h3>
                            <p>
                                You may terminate your account at any time by:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Canceling your subscription through the dashboard</li>
                                <li>Contacting support at support@kamiyo.ai</li>
                                <li>Ceasing use of the x402 API (no account required)</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">13.2 Termination by Us</h3>
                            <p>
                                We may suspend or terminate your access immediately, without notice, for:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Violation of these Terms or Acceptable Use Policy</li>
                                <li>Fraudulent, abusive, or illegal activity</li>
                                <li>Excessive API usage or abuse</li>
                                <li>Failed payment (after grace period)</li>
                                <li>Risk to Service security or other users</li>
                                <li>Legal or regulatory requirements</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">13.3 Effect of Termination</h3>
                            <p>Upon termination:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Your right to use the Service immediately ceases</li>
                                <li>Your account will be deactivated and data deleted per our retention policy</li>
                                <li>No refunds will be provided except as required by law</li>
                                <li>Sections 8-19 of these Terms survive termination</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">13.4 Data Export</h3>
                            <p>
                                Before terminating your account, you should export any data you wish to retain. We provide data export tools in your account dashboard. After account deletion, we cannot recover your data.
                            </p>
                        </div>
                    </section>

                    {/* Section 14 */}
                    <section id="modifications" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            14. Modifications to Service and Terms
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">14.1 Service Modifications</h3>
                            <p>
                                We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with or without notice. We are not liable to you or any third party for any modification, suspension, or discontinuation of the Service.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">14.2 Terms Modifications</h3>
                            <p>
                                We may modify these Terms at any time. We will provide notice of material changes by:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Posting the updated Terms on this page</li>
                                <li>Updating the "Last Updated" date</li>
                                <li>Sending email notification to registered users</li>
                                <li>Displaying a notice on the Service</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">14.3 Acceptance of Changes</h3>
                            <p>
                                Your continued use of the Service after the effective date of modified Terms constitutes acceptance of the changes. If you do not agree to the modified Terms, you must discontinue use of the Service.
                            </p>
                        </div>
                    </section>

                    {/* Section 15 */}
                    <section id="privacy" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            15. Privacy and Data Protection
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                Your privacy is important to us. Our collection, use, and disclosure of your personal information is governed by our{" "}
                                <a href="/privacy" className="text-cyan hover:underline">Privacy Policy</a>, which is incorporated into these Terms by reference.
                            </p>
                            <p>
                                By using the Service, you consent to our collection and use of your information as described in the Privacy Policy. We comply with:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>GDPR (General Data Protection Regulation) for EU users</li>
                                <li>CCPA (California Consumer Privacy Act) for California residents</li>
                                <li>PCI DSS requirements for payment processing (via Stripe)</li>
                                <li>Other applicable data protection regulations</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 16 */}
                    <section id="third-party" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            16. Third-Party Services and Links
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                The Service may contain links to third-party websites, services, or resources. We do not control, endorse, or assume responsibility for any third-party content, products, or services.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">Third-Party Services We Use</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Stripe:</strong> Payment processing (subject to Stripe's terms)</li>
                                <li><strong className="text-white">Sentry:</strong> Error monitoring and performance tracking</li>
                                <li><strong className="text-white">RPC Providers:</strong> Blockchain transaction verification</li>
                                <li><strong className="text-white">Data Sources:</strong> Security intelligence aggregation</li>
                            </ul>

                            <p className="mt-4">
                                Your use of third-party services is subject to their respective terms and policies. We are not responsible for the practices or content of third parties.
                            </p>
                        </div>
                    </section>

                    {/* Section 17 */}
                    <section id="governing-law" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            17. Governing Law and Jurisdiction
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.
                            </p>
                            <p>
                                You agree that any legal action or proceeding arising out of or relating to these Terms or the Service shall be brought exclusively in the federal or state courts located in Delaware, and you consent to personal jurisdiction in these courts.
                            </p>
                        </div>
                    </section>

                    {/* Section 18 */}
                    <section id="dispute-resolution" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            18. Dispute Resolution and Arbitration
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <div className="bg-black border border-cyan border-opacity-50 rounded-lg p-4">
                                <p className="text-sm font-semibold text-cyan mb-2">ARBITRATION AGREEMENT</p>
                                <p className="text-sm">
                                    This section contains an arbitration clause and class action waiver that affects your legal rights. Please read it carefully.
                                </p>
                            </div>

                            <h3 className="text-lg font-light text-cyan mt-6">18.1 Informal Dispute Resolution</h3>
                            <p>
                                Before filing a claim, you agree to try to resolve the dispute informally by contacting us at legal@kamiyo.ai. We will attempt to resolve the dispute informally within 60 days.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">18.2 Binding Arbitration</h3>
                            <p>
                                If informal resolution fails, you agree that any dispute arising out of or relating to these Terms or the Service shall be resolved through binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules.
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                                <li>The arbitration shall be conducted in Delaware or via videoconference</li>
                                <li>The arbitrator's decision is final and binding</li>
                                <li>Judgment on the award may be entered in any court of competent jurisdiction</li>
                                <li>Each party bears its own costs unless the arbitrator determines otherwise</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">18.3 Class Action Waiver</h3>
                            <p className="uppercase font-semibold text-white">
                                YOU AGREE TO BRING CLAIMS ONLY IN YOUR INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">18.4 Exceptions to Arbitration</h3>
                            <p>The following disputes are exempt from arbitration:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Small claims court actions (under $10,000)</li>
                                <li>Intellectual property disputes</li>
                                <li>Requests for injunctive relief</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">18.5 Opt-Out Right</h3>
                            <p>
                                You may opt out of this arbitration agreement by sending written notice to legal@kamiyo.ai within 30 days of first using the Service. Your notice must include your name, address, and a clear statement that you wish to opt out of arbitration.
                            </p>
                        </div>
                    </section>

                    {/* Section 19 */}
                    <section id="general-provisions" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            19. General Provisions
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <h3 className="text-lg font-light text-cyan">19.1 Entire Agreement</h3>
                            <p>
                                These Terms, together with our Privacy Policy and any additional terms you agree to when using specific features, constitute the entire agreement between you and KAMIYO regarding the Service.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.2 Severability</h3>
                            <p>
                                If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.3 Waiver</h3>
                            <p>
                                Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. No waiver shall be effective unless in writing.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.4 Assignment</h3>
                            <p>
                                You may not assign or transfer these Terms or your rights hereunder without our prior written consent. We may assign these Terms without restriction. Any attempted assignment in violation of this section is void.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.5 Force Majeure</h3>
                            <p>
                                We shall not be liable for any failure or delay in performance due to circumstances beyond our reasonable control, including acts of God, war, terrorism, labor disputes, or internet service provider failures.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.6 Export Controls</h3>
                            <p>
                                You agree to comply with all applicable export and import control laws and regulations. You represent that you are not located in a country subject to U.S. embargo or designated as a "terrorist supporting" country.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.7 U.S. Government Rights</h3>
                            <p>
                                The Service is a "commercial item" as defined at 48 C.F.R. 2.101, consisting of "commercial computer software" and "commercial computer software documentation." U.S. Government users acquire the Service with only those rights set forth in these Terms.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">19.8 Feedback</h3>
                            <p>
                                If you provide us with feedback, suggestions, or ideas about the Service, you grant us an unlimited, irrevocable, perpetual, royalty-free license to use such feedback without compensation or attribution.
                            </p>
                        </div>
                    </section>

                    {/* Section 20 */}
                    <section id="contact" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500/25 pb-3">
                            20. Contact Information
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                If you have questions, concerns, or complaints about these Terms or the Service, please contact us:
                            </p>

                            <div className="bg-black border border-gray-500/25 rounded-lg p-6 mt-4">
                                <p className="font-semibold text-white mb-3">Kamiyo.ai</p>
                                <p className="text-sm space-y-2">
                                    <span className="block"><strong className="text-white">General Inquiries:</strong>{" "}
                                        <a href="mailto:support@kamiyo.ai" className="text-cyan hover:underline">support@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Legal:</strong>{" "}
                                        <a href="mailto:legal@kamiyo.ai" className="text-cyan hover:underline">legal@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Privacy:</strong>{" "}
                                        <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Abuse:</strong>{" "}
                                        <a href="mailto:abuse@kamiyo.ai" className="text-cyan hover:underline">abuse@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Website:</strong>{" "}
                                        <a href="https://kamiyo.ai" className="text-cyan hover:underline">https://kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Discord:</strong>{" "}
                                        <a href="https://discord.gg/DCNRrFuG" className="text-cyan hover:underline" target="_blank" rel="noopener noreferrer">https://discord.gg/DCNRrFuG</a>
                                    </span>
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Acknowledgment */}
                    <section className="mb-12 bg-black border border-gray-500/25 rounded-lg p-6">
                        <h3 className="text-xl font-light mb-4 text-cyan">Acknowledgment</h3>
                        <p className="text-gray-300 text-sm">
                            BY ACCESSING OR USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS OF SERVICE. IF YOU DO NOT AGREE TO THESE TERMS, DO NOT USE THE SERVICE.
                        </p>
                    </section>

                    {/* Footer */}
                    <footer className="mt-16 pt-8 border-t border-gray-500/25">
                        <div className="text-center text-sm text-gray-500">
                            <p>These Terms of Service were last updated on {lastUpdated}</p>
                            <p className="mt-2">
                                <a href="/privacy" className="text-cyan hover:underline">Privacy Policy</a>
                                {" | "}
                                <a href="/" className="text-cyan hover:underline">Home</a>
                                {" | "}
                                <a href="/pricing" className="text-cyan hover:underline">Pricing</a>
                                {" | "}
                                <a href="/api-docs" className="text-cyan hover:underline">API Docs</a>
                            </p>
                        </div>
                    </footer>
                </div>
            </div>
        </>
    );
}
