// pages/privacy.js
import SEO from "../components/SEO";

export default function PrivacyPolicy() {
    const lastUpdated = "October 29, 2025";

    return (
        <>
            <SEO
                title="Privacy Policy | KAMIYO Security Intelligence"
                description="KAMIYO privacy policy covering data collection, storage, processing, and your rights under GDPR and CCPA. Learn how we protect your information."
                canonical="https://kamiyo.io/privacy"
                noindex={false}
            />
            <div className="min-h-screen bg-black text-white">
                <div className="max-w-4xl mx-auto px-5 py-16">
                    {/* Header */}
                    <header className="mb-12 border-b border-gray-500 border-opacity-25 pb-8">
                        <h1 className="text-4xl md:text-5xl font-light mb-4">Privacy Policy</h1>
                        <p className="text-gray-400 text-sm">
                            Last Updated: <time dateTime="2025-10-29">{lastUpdated}</time>
                        </p>
                    </header>

                    {/* Introduction */}
                    <section className="mb-12">
                        <p className="text-gray-300 leading-relaxed mb-4">
                            Kamiyo.ai ("KAMIYO", "we", "us", or "our") operates the KAMIYO Security Intelligence platform at kamiyo.io (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service, including our MCP (Model Context Protocol) subscriptions and x402 API.
                        </p>
                        <p className="text-gray-300 leading-relaxed mb-4">
                            By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our Service.
                        </p>
                    </section>

                    {/* Table of Contents */}
                    <nav className="mb-12 bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <h2 className="text-xl font-light mb-4">Table of Contents</h2>
                        <ol className="space-y-2 text-sm text-gray-400">
                            <li><a href="#information-we-collect" className="hover:text-cyan transition-colors">1. Information We Collect</a></li>
                            <li><a href="#how-we-use-information" className="hover:text-cyan transition-colors">2. How We Use Your Information</a></li>
                            <li><a href="#data-storage" className="hover:text-cyan transition-colors">3. Data Storage and Security</a></li>
                            <li><a href="#third-party-services" className="hover:text-cyan transition-colors">4. Third-Party Services</a></li>
                            <li><a href="#cookies" className="hover:text-cyan transition-colors">5. Cookies and Tracking Technologies</a></li>
                            <li><a href="#data-sharing" className="hover:text-cyan transition-colors">6. Data Sharing and Disclosure</a></li>
                            <li><a href="#your-rights" className="hover:text-cyan transition-colors">7. Your Privacy Rights</a></li>
                            <li><a href="#data-retention" className="hover:text-cyan transition-colors">8. Data Retention</a></li>
                            <li><a href="#international-transfers" className="hover:text-cyan transition-colors">9. International Data Transfers</a></li>
                            <li><a href="#children-privacy" className="hover:text-cyan transition-colors">10. Children's Privacy</a></li>
                            <li><a href="#california-rights" className="hover:text-cyan transition-colors">11. California Privacy Rights (CCPA)</a></li>
                            <li><a href="#gdpr-rights" className="hover:text-cyan transition-colors">12. GDPR Rights (EU Users)</a></li>
                            <li><a href="#changes" className="hover:text-cyan transition-colors">13. Changes to This Policy</a></li>
                            <li><a href="#contact" className="hover:text-cyan transition-colors">14. Contact Us</a></li>
                        </ol>
                    </nav>

                    {/* Section 1 */}
                    <section id="information-we-collect" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            1. Information We Collect
                        </h2>

                        <h3 className="text-xl font-light mb-4 text-cyan">1.1 Information You Provide</h3>
                        <div className="mb-6 text-gray-300 space-y-3">
                            <p><strong className="text-white">Account Information:</strong> When you create an account for MCP subscriptions, we collect:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Email address (required)</li>
                                <li>Name (optional)</li>
                                <li>Company name (optional, for Team and Enterprise plans)</li>
                                <li>Password (encrypted and hashed)</li>
                            </ul>
                            <p><strong className="text-white">Payment Information:</strong> Payment processing is handled by Stripe. We do not store your credit card information. Stripe collects:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Credit card details</li>
                                <li>Billing address</li>
                                <li>Payment history</li>
                            </ul>
                        </div>

                        <h3 className="text-xl font-light mb-4 text-cyan">1.2 Information Collected Automatically</h3>
                        <div className="mb-6 text-gray-300 space-y-3">
                            <p><strong className="text-white">API Usage Data:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>API requests (endpoints, timestamps, response codes)</li>
                                <li>Query parameters and search terms</li>
                                <li>Usage volume and frequency</li>
                                <li>IP addresses (for rate limiting and abuse prevention)</li>
                                <li>User agent and device information</li>
                            </ul>
                            <p><strong className="text-white">Analytics and Performance Data:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Browser type and version</li>
                                <li>Operating system</li>
                                <li>Pages visited and time spent</li>
                                <li>Referral sources</li>
                                <li>Click patterns and navigation paths</li>
                            </ul>
                        </div>

                        <h3 className="text-xl font-light mb-4 text-cyan">1.3 x402 API Usage (No Account Required)</h3>
                        <div className="text-gray-300 space-y-3">
                            <p>For x402 API users who pay per query without creating an account, we collect minimal data:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Blockchain transaction hash (for payment verification)</li>
                                <li>Payment token (temporary, expires in 24 hours)</li>
                                <li>API usage associated with that token</li>
                                <li>IP address (for rate limiting only, not linked to identity)</li>
                            </ul>
                            <p className="text-sm italic">Note: x402 users maintain anonymity - we do not collect email addresses or personal information unless you choose to create an account.</p>
                        </div>
                    </section>

                    {/* Section 2 */}
                    <section id="how-we-use-information" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            2. How We Use Your Information
                        </h2>
                        <div className="text-gray-300 space-y-3">
                            <p>We use the information we collect for the following purposes:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Service Provision:</strong> To provide, maintain, and improve the KAMIYO Security Intelligence Service</li>
                                <li><strong className="text-white">Authentication:</strong> To verify your identity and manage your account access</li>
                                <li><strong className="text-white">Payment Processing:</strong> To process subscription payments and x402 blockchain transactions</li>
                                <li><strong className="text-white">Usage Analytics:</strong> To analyze API usage patterns and improve service performance</li>
                                <li><strong className="text-white">Rate Limiting:</strong> To enforce API rate limits and prevent abuse</li>
                                <li><strong className="text-white">Customer Support:</strong> To respond to your inquiries and provide technical assistance</li>
                                <li><strong className="text-white">Service Communications:</strong> To send important updates about service changes, security alerts, and billing</li>
                                <li><strong className="text-white">Security:</strong> To detect and prevent fraud, security threats, and terms violations</li>
                                <li><strong className="text-white">Legal Compliance:</strong> To comply with legal obligations and enforce our Terms of Service</li>
                                <li><strong className="text-white">Product Development:</strong> To develop new features and improve existing functionality</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 3 */}
                    <section id="data-storage" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            3. Data Storage and Security
                        </h2>

                        <h3 className="text-xl font-light mb-4 text-cyan">3.1 Data Storage Infrastructure</h3>
                        <div className="mb-6 text-gray-300 space-y-3">
                            <p><strong className="text-white">Databases:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>PostgreSQL for user accounts and subscription data</li>
                                <li>SQLite for x402 payment tracking (temporary, 30-day retention)</li>
                                <li>Redis for session management and API caching (ephemeral)</li>
                            </ul>
                            <p><strong className="text-white">Location:</strong> All data is stored in secure data centers in the United States.</p>
                        </div>

                        <h3 className="text-xl font-light mb-4 text-cyan">3.2 Security Measures</h3>
                        <div className="text-gray-300 space-y-3">
                            <p>We implement industry-standard security measures to protect your data:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Encryption in Transit:</strong> All data transmitted between your device and our servers is encrypted using TLS 1.3</li>
                                <li><strong className="text-white">Encryption at Rest:</strong> Sensitive data is encrypted in our databases</li>
                                <li><strong className="text-white">Password Security:</strong> Passwords are hashed using bcrypt with salt</li>
                                <li><strong className="text-white">API Authentication:</strong> Secure API keys with prefix "kmy_" and JWT-based session tokens</li>
                                <li><strong className="text-white">CSRF Protection:</strong> Cross-Site Request Forgery protection on all state-changing operations</li>
                                <li><strong className="text-white">Rate Limiting:</strong> API rate limiting to prevent abuse and DDoS attacks</li>
                                <li><strong className="text-white">Access Controls:</strong> Role-based access control (RBAC) for internal systems</li>
                                <li><strong className="text-white">Monitoring:</strong> Continuous security monitoring via Sentry error tracking</li>
                                <li><strong className="text-white">Regular Audits:</strong> Periodic security audits and vulnerability assessments</li>
                            </ul>
                            <p className="text-sm italic mt-4">
                                While we strive to protect your data, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
                            </p>
                        </div>
                    </section>

                    {/* Section 4 */}
                    <section id="third-party-services" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            4. Third-Party Services
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>We use the following third-party service providers who may process your data:</p>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                <h4 className="font-semibold text-white mb-2">Stripe (Payment Processing)</h4>
                                <p className="text-sm mb-2">Processes subscription payments and stores payment information</p>
                                <p className="text-xs text-gray-500">Privacy Policy: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">https://stripe.com/privacy</a></p>
                                <p className="text-xs text-gray-500">PCI DSS Level 1 Certified</p>
                            </div>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                <h4 className="font-semibold text-white mb-2">Sentry (Error Monitoring)</h4>
                                <p className="text-sm mb-2">Monitors application errors and performance issues</p>
                                <p className="text-xs text-gray-500">Privacy Policy: <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">https://sentry.io/privacy/</a></p>
                                <p className="text-xs text-gray-500">Data collected: Error logs, stack traces, user context (anonymized)</p>
                            </div>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                <h4 className="font-semibold text-white mb-2">RPC Providers (Blockchain Verification)</h4>
                                <p className="text-sm mb-2">Alchemy, Helius, and other RPC providers verify x402 payments</p>
                                <p className="text-xs text-gray-500">Data shared: Transaction hashes, wallet addresses (public blockchain data)</p>
                                <p className="text-xs text-gray-500">No personal information is transmitted to RPC providers</p>
                            </div>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                <h4 className="font-semibold text-white mb-2">Vercel (Hosting)</h4>
                                <p className="text-sm mb-2">Hosts our frontend application and serves content</p>
                                <p className="text-xs text-gray-500">Privacy Policy: <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">https://vercel.com/legal/privacy-policy</a></p>
                                <p className="text-xs text-gray-500">Data collected: Access logs, IP addresses (automatic, standard web hosting)</p>
                            </div>
                        </div>
                    </section>

                    {/* Section 5 */}
                    <section id="cookies" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            5. Cookies and Tracking Technologies
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>We use cookies and similar tracking technologies to enhance your experience:</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Essential Cookies (Required)</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Session Cookies:</strong> Maintain your logged-in state (expires when browser closes)</li>
                                <li><strong className="text-white">CSRF Tokens:</strong> Protect against cross-site request forgery attacks</li>
                                <li><strong className="text-white">Authentication Tokens:</strong> Verify your identity for API requests</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Functional Cookies (Optional)</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Preferences:</strong> Remember your dashboard settings and preferences</li>
                                <li><strong className="text-white">Language:</strong> Store your preferred language settings</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Analytics Cookies (Optional)</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Usage Analytics:</strong> Understand how you use our Service to improve performance</li>
                                <li><strong className="text-white">Feature Tracking:</strong> Measure feature adoption and user engagement</li>
                            </ul>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4 mt-6">
                                <h4 className="font-semibold text-white mb-2">Managing Cookies</h4>
                                <p className="text-sm">You can control cookies through your browser settings. Note that disabling essential cookies may affect Service functionality. Most browsers allow you to:</p>
                                <ul className="list-disc list-inside ml-4 mt-2 text-sm space-y-1">
                                    <li>View cookies stored on your device</li>
                                    <li>Delete cookies individually or all at once</li>
                                    <li>Block third-party cookies</li>
                                    <li>Block all cookies from specific websites</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Section 6 */}
                    <section id="data-sharing" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            6. Data Sharing and Disclosure
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>We do not sell your personal information. We may share your information in the following circumstances:</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Service Providers</h3>
                            <p>We share data with third-party service providers who perform services on our behalf (see Section 4).</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Business Transfers</h3>
                            <p>If KAMIYO is involved in a merger, acquisition, or sale of assets, your information may be transferred. We will provide notice before your information is transferred and becomes subject to a different privacy policy.</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Legal Requirements</h3>
                            <p>We may disclose your information if required to do so by law or in response to valid requests by public authorities, including to:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Comply with legal obligations</li>
                                <li>Protect and defend our rights or property</li>
                                <li>Prevent or investigate possible wrongdoing</li>
                                <li>Protect personal safety of users or the public</li>
                                <li>Protect against legal liability</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Aggregated Data</h3>
                            <p>We may share aggregated, anonymized data that does not personally identify you for research, marketing, or analytics purposes.</p>
                        </div>
                    </section>

                    {/* Section 7 */}
                    <section id="your-rights" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            7. Your Privacy Rights
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>You have the following rights regarding your personal information:</p>

                            <div className="space-y-4">
                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Access</h4>
                                    <p className="text-sm">Request a copy of the personal information we hold about you</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Correction</h4>
                                    <p className="text-sm">Request correction of inaccurate or incomplete information</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Deletion</h4>
                                    <p className="text-sm">Request deletion of your personal information (subject to legal retention requirements)</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Data Portability</h4>
                                    <p className="text-sm">Request a machine-readable export of your data</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Objection</h4>
                                    <p className="text-sm">Object to processing of your information for certain purposes</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Restriction</h4>
                                    <p className="text-sm">Request restriction of processing in certain circumstances</p>
                                </div>

                                <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-4">
                                    <h4 className="font-semibold text-white mb-2">Withdraw Consent</h4>
                                    <p className="text-sm">Withdraw consent for data processing where consent is the legal basis</p>
                                </div>
                            </div>

                            <p className="mt-6">
                                To exercise any of these rights, please contact us at{" "}
                                <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a>.
                                We will respond to your request within 30 days.
                            </p>
                        </div>
                    </section>

                    {/* Section 8 */}
                    <section id="data-retention" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            8. Data Retention
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>We retain your information for as long as necessary to provide the Service and fulfill the purposes outlined in this Privacy Policy:</p>

                            <ul className="list-disc list-inside ml-4 space-y-3">
                                <li>
                                    <strong className="text-white">Account Data:</strong> Retained while your account is active and for 90 days after account deletion (for recovery purposes)
                                </li>
                                <li>
                                    <strong className="text-white">Payment Records:</strong> Retained for 7 years (legal and tax compliance requirements)
                                </li>
                                <li>
                                    <strong className="text-white">API Usage Logs:</strong> Retained for 90 days (operational purposes)
                                </li>
                                <li>
                                    <strong className="text-white">x402 Payment Tokens:</strong> Retained for 30 days (fraud prevention)
                                </li>
                                <li>
                                    <strong className="text-white">Session Data:</strong> Deleted when session expires (typically 24 hours)
                                </li>
                                <li>
                                    <strong className="text-white">Analytics Data:</strong> Aggregated and anonymized after 12 months
                                </li>
                            </ul>

                            <p className="mt-4">
                                After the retention period, we securely delete or anonymize your information. Some information may be retained in encrypted backups for disaster recovery purposes but will not be used for any other purpose.
                            </p>
                        </div>
                    </section>

                    {/* Section 9 */}
                    <section id="international-transfers" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            9. International Data Transfers
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                Your information may be transferred to and processed in the United States and other countries where our service providers operate. These countries may have data protection laws that differ from those in your jurisdiction.
                            </p>
                            <p>
                                When we transfer personal data from the European Economic Area (EEA) to countries outside the EEA, we ensure appropriate safeguards are in place, including:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Standard Contractual Clauses approved by the European Commission</li>
                                <li>Adequacy decisions by the European Commission</li>
                                <li>Binding Corporate Rules</li>
                                <li>Service provider certifications (e.g., EU-U.S. Data Privacy Framework)</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 10 */}
                    <section id="children-privacy" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            10. Children's Privacy
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                Our Service is not intended for children under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at{" "}
                                <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a>.
                            </p>
                            <p>
                                If we become aware that we have collected personal information from a child under 18 without verification of parental consent, we will take steps to delete that information immediately.
                            </p>
                        </div>
                    </section>

                    {/* Section 11 */}
                    <section id="california-rights" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            11. California Privacy Rights (CCPA)
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">Right to Know</h3>
                            <p>You have the right to request information about the personal information we have collected, including:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Categories of personal information collected</li>
                                <li>Sources from which information was collected</li>
                                <li>Business or commercial purpose for collecting information</li>
                                <li>Categories of third parties with whom we share information</li>
                                <li>Specific pieces of personal information collected</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Right to Delete</h3>
                            <p>You have the right to request deletion of your personal information, subject to certain exceptions.</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Right to Opt-Out of Sale</h3>
                            <p className="font-semibold text-white">We do not sell your personal information.</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Non-Discrimination</h3>
                            <p>We will not discriminate against you for exercising your CCPA rights.</p>

                            <h3 className="text-lg font-light text-cyan mt-6">Exercising Your Rights</h3>
                            <p>
                                To exercise your CCPA rights, email us at{" "}
                                <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a> or call us at{" "}
                                <a href="tel:+1-XXX-XXX-XXXX" className="text-cyan hover:underline">+1-XXX-XXX-XXXX</a>.
                                We will verify your identity before processing your request.
                            </p>
                        </div>
                    </section>

                    {/* Section 12 */}
                    <section id="gdpr-rights" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            12. GDPR Rights (EU Users)
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, you have rights under the General Data Protection Regulation (GDPR):
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">Legal Basis for Processing</h3>
                            <p>We process your personal data under the following legal bases:</p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li><strong className="text-white">Contract:</strong> Processing necessary to provide the Service you requested</li>
                                <li><strong className="text-white">Legitimate Interests:</strong> Fraud prevention, security, and service improvement</li>
                                <li><strong className="text-white">Legal Obligation:</strong> Compliance with applicable laws and regulations</li>
                                <li><strong className="text-white">Consent:</strong> Where you have given explicit consent (e.g., marketing communications)</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Your GDPR Rights</h3>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Right of access to your personal data</li>
                                <li>Right to rectification of inaccurate data</li>
                                <li>Right to erasure ("right to be forgotten")</li>
                                <li>Right to restriction of processing</li>
                                <li>Right to data portability</li>
                                <li>Right to object to processing</li>
                                <li>Right to withdraw consent</li>
                                <li>Right to lodge a complaint with a supervisory authority</li>
                            </ul>

                            <h3 className="text-lg font-light text-cyan mt-6">Data Controller</h3>
                            <p>
                                Kamiyo.ai is the data controller responsible for your personal information. Contact us at{" "}
                                <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a>.
                            </p>

                            <h3 className="text-lg font-light text-cyan mt-6">Supervisory Authority</h3>
                            <p>
                                You have the right to lodge a complaint with your local data protection authority if you believe we have violated your privacy rights.
                            </p>
                        </div>
                    </section>

                    {/* Section 13 */}
                    <section id="changes" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            13. Changes to This Privacy Policy
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:
                            </p>
                            <ul className="list-disc list-inside ml-4 space-y-2">
                                <li>Posting the updated Privacy Policy on this page</li>
                                <li>Updating the "Last Updated" date at the top of this policy</li>
                                <li>Sending an email notification to your registered email address (for material changes)</li>
                                <li>Displaying a prominent notice on our Service</li>
                            </ul>
                            <p className="mt-4">
                                Your continued use of the Service after the effective date of the updated Privacy Policy constitutes your acceptance of the changes. If you do not agree to the updated policy, please discontinue use of the Service.
                            </p>
                        </div>
                    </section>

                    {/* Section 14 */}
                    <section id="contact" className="mb-12">
                        <h2 className="text-2xl font-light mb-6 border-b border-gray-500 border-opacity-25 pb-3">
                            14. Contact Us
                        </h2>
                        <div className="text-gray-300 space-y-4">
                            <p>
                                If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
                            </p>

                            <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 mt-4">
                                <p className="font-semibold text-white mb-3">Kamiyo.ai</p>
                                <p className="text-sm space-y-1">
                                    <span className="block"><strong className="text-white">Email:</strong>{" "}
                                        <a href="mailto:privacy@kamiyo.ai" className="text-cyan hover:underline">privacy@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Support:</strong>{" "}
                                        <a href="mailto:support@kamiyo.ai" className="text-cyan hover:underline">support@kamiyo.ai</a>
                                    </span>
                                    <span className="block"><strong className="text-white">Website:</strong>{" "}
                                        <a href="https://kamiyo.io" className="text-cyan hover:underline">https://kamiyo.io</a>
                                    </span>
                                </p>
                                <p className="text-xs text-gray-500 mt-4">
                                    We will respond to all requests within 30 days.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="mt-16 pt-8 border-t border-gray-500 border-opacity-25">
                        <div className="text-center text-sm text-gray-500">
                            <p>This Privacy Policy was last updated on {lastUpdated}</p>
                            <p className="mt-2">
                                <a href="/terms" className="text-cyan hover:underline">Terms of Service</a>
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
