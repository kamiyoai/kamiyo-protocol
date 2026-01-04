import SEO from '../components/SEO';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen">
            <SEO
                title="Privacy Policy - x402 Infrastructure | KAMIYO"
                description="Privacy policy for x402 Infrastructure payment verification service. Learn how we collect, use, and protect your information."
                canonical="https://kamiyo.ai/privacy-policy"
                noindex={true}
            />

            <section className="py-10 px-5 md:px-1 mx-auto max-w-[1400px]">
                <div className="subheading-border mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest gradient-text mb-4 md:mb-8">— &nbsp;プライバシーポリシー</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Privacy Policy</h1>
                </div>

                <div className="grid grid-cols-1 gap-8 md:gap-16">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">1. Introduction</h4>
                        <p className="mb-10">KAMIYO (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates x402 Infrastructure, a payment verification API. This Privacy Policy explains how we collect, use, and protect your information when you use our services. By accessing KAMIYO, you agree to the terms outlined in this policy.</p>

                        <h4 className="text-xl md:text-2xl mb-4">2. Data Collection & Usage</h4>
                        <p>We collect and process user data to provide API payment services and maintain platform functionality:</p>
                        <ul className="text-xs mb-10">
                            <li>Account information: Email address, username, and authentication credentials</li>
                            <li>Payment information: Processed securely through Stripe (we do not store complete payment card details)</li>
                            <li>Usage data: API requests, alert preferences, webhook configurations, and dashboard interactions</li>
                            <li>Technical data: IP addresses, browser information, and device identifiers for security and analytics</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">3. How We Use Your Data</h4>
                        <p>We use collected information to:</p>
                        <ul className="text-xs mb-10">
                            <li>Deliver payment notifications and API access confirmations</li>
                            <li>Process API requests and maintain service uptime</li>
                            <li>Manage subscriptions and billing through Stripe</li>
                            <li>Improve platform features and user experience</li>
                            <li>Ensure platform security and prevent abuse</li>
                            <li>Communicate service updates and support</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">4. Data Storage & Retention</h4>
                        <ul className="text-xs mb-10">
                            <li>Account data is retained while your account remains active</li>
                            <li>API request logs are retained for 90 days for debugging and analytics</li>
                            <li>Payment records are retained per Stripe's data retention policies and tax regulations</li>
                            <li>Payment transaction data is retained per regulatory requirements and blockchain records</li>
                            <li>You may request account deletion at any time, which removes personal data within 30 days</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">5. Data Sharing & Third-Party Services</h4>
                        <p>We do not sell or share personal data. We share data only with:</p>
                        <ul className="text-xs mb-10">
                            <li><strong>Stripe:</strong> For payment processing (subject to Stripe's privacy policy)</li>
                            <li><strong>Render.com:</strong> Our hosting infrastructure provider (subject to their security standards)</li>
                            <li><strong>Legal requirements:</strong> When required by law or to protect our legal rights</li>
                            <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">6. International Data Transfers</h4>
                        <p className="mb-10">Our platform operates on infrastructure located in the United States. If you access our services from outside the US, your data will be transferred to and processed in the United States. We comply with GDPR and applicable data protection regulations.</p>

                        <h4 className="text-xl md:text-2xl mb-4">7. User Rights & Data Control</h4>
                        <p>You have the right to:</p>
                        <ul className="text-xs mb-10">
                            <li>Access your personal data and request a copy</li>
                            <li>Correct inaccurate or incomplete personal data</li>
                            <li>Request deletion of your personal data (right to be forgotten)</li>
                            <li>Object to processing of your personal data</li>
                            <li>Request data portability in machine-readable format</li>
                            <li>Withdraw consent for data processing at any time</li>
                        </ul>
                        <p className="text-xs mb-10">To exercise these rights, contact us at the email provided below.</p>

                        <h4 className="text-xl md:text-2xl mb-4">8. Security Measures</h4>
                        <p>We implement industry-standard security measures to protect your data:</p>
                        <ul className="text-xs mb-10">
                            <li>HTTPS/TLS encryption for all data transmission</li>
                            <li>Encrypted database storage with access controls</li>
                            <li>JWT-based authentication with secure token handling</li>
                            <li>Rate limiting and abuse prevention systems</li>
                            <li>Regular security audits and vulnerability assessments</li>
                            <li>PCI DSS compliant logging practices for payment data</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">9. Cookies & Tracking Technologies</h4>
                        <p>We use cookies and similar technologies for:</p>
                        <ul className="text-xs mb-10">
                            <li><strong>Essential cookies:</strong> Required for authentication and platform functionality</li>
                            <li><strong>Analytics cookies:</strong> To understand platform usage and improve services</li>
                            <li><strong>Preference cookies:</strong> To remember your settings and preferences</li>
                        </ul>
                        <p className="text-xs mb-10">You can control cookie preferences through your browser settings. Disabling essential cookies may impact platform functionality.</p>

                        <h4 className="text-xl md:text-2xl mb-4">10. Updates to This Policy</h4>
                        <p className="mb-10">We may update this Privacy Policy periodically to reflect changes in our practices, technology, legal requirements, or business operations. Material changes will be communicated via email to registered users. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>

                        <h4 className="text-xl md:text-2xl mb-4">11. Contact Information</h4>
                        <p className="mb-10">For privacy-related inquiries, data access requests, or to exercise your rights under this policy, contact us at: <strong>privacy@kamiyo.ai</strong></p>
                        <p className="text-xs text-gray-500">Last updated: October 14, 2025</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
