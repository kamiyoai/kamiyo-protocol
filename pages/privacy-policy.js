import Head from 'next/head';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen">
            <Head>
                <title>Privacy Policy - KAMIYO</title>
            </Head>

            <section className="py-10 px-5 md:px-1 md:w-5/6 mx-auto">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;プライバシーポリシー</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Privacy Policy</h1>
                </div>

                <div className="grid grid-cols-1 gap-8 md:gap-16">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">1. Introduction</h4>
                        <p className="mb-10">Kamiyo.ai (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy and ensuring the confidentiality of your data. This Privacy Policy explains how we collect, use, and protect your information when you access our services, including AI agents deployed in Trusted Execution Environments (TEEs). By using Kamiyo.ai, you agree to the terms outlined in this policy.</p>

                        <h4 className="text-xl md:text-2xl mb-4">2. Data Collection & Usage</h4>
                        <p>We collect and process user data to provide secure AI interactions and enhance service functionality.</p>
                        <ul className="text-xs mb-10">
                            <li>Information you provide: Account details, payment information, and AI interaction data.</li>
                            <li>Automatically collected data: Device information, interaction logs, and cryptographic proofs.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">3. Secure Processing in Trusted Execution Environments (TEEs)</h4>
                        <p>Kamiyo.ai operates within TEEs to ensure:</p>
                        <ul className="text-xs mb-10">
                            <li>Confidential AI computing.</li>
                            <li>Data integrity guarantees.</li>
                            <li>Privacy-focused execution of AI models.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">4. Data Storage & Retention</h4>
                        <ul className="text-xs mb-10">
                            <li>Ephemeral AI sessions are processed in real-time and not stored.</li>
                            <li>Persistent AI instances may retain limited session continuity.</li>
                            <li>Cryptographic logs may be retained to verify TEE integrity.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">5. Data Sharing & Third-Party Services</h4>
                        <p>We do not sell or share personal data except:</p>
                        <ul className="text-xs mb-10">
                            <li>For regulatory compliance.</li>
                            <li>With third-party payment processors (e.g., Stripe).</li>
                            <li>With infrastructure providers under strict security controls.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">6. International Data Transfers</h4>
                        <p className="mb-10">Kamiyo.ai processes data in decentralized TEEs, ensuring compliance with GDPR and global data protection standards.</p>

                        <h4 className="text-xl md:text-2xl mb-4">7. User Rights & Data Control</h4>
                        <ul className="text-xs mb-10">
                            <li>Access, correct, or delete personal data.</li>
                            <li>Opt-out of non-essential tracking where applicable.</li>
                            <li>Request data portability where supported.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">8. Security Measures</h4>
                        <ul className="text-xs mb-10">
                            <li>End-to-end encryption.</li>
                            <li>TEE-based execution security.</li>
                            <li>Continuous integrity checks.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">9. Cookies & Tracking Technologies</h4>
                        <p>We minimize tracking but use:</p>
                        <ul className="text-xs mb-10">
                            <li>Essential cookies for authentication.</li>
                            <li>Performance analytics (privacy-friendly).</li>
                            <li>GDPR-compliant cookie settings for EU users.</li>
                        </ul>

                        <h4 className="text-xl md:text-2xl mb-4">10. Updates to This Policy</h4>
                        <p className="mb-10">We may revise this policy to reflect operational, legal, or regulatory changes.</p>

                        <h4 className="text-xl md:text-2xl mb-4">11. Contact Information</h4>
                        <p>For inquiries, contact us at: <strong>[Insert Contact Email]</strong></p>
                    </div>
                </div>
            </section>
        </div>
    );
}
