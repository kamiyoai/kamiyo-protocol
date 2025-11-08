// pages/index.js
import { useState, useEffect } from "react";
import Link from "next/link";
import StatsCard from "../components/dashboard/StatsCard";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import X402PricingTiers from "../components/X402PricingTiers";
import SEO from "../components/SEO";

export default function Home() {
    const [stats, setStats] = useState({
        totalExploits: '-',
        totalLoss: '-',
        chainsTracked: '-',
        activeSources: '-'
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadStats = async () => {
        try {
            const [healthRes, statsRes] = await Promise.all([
                fetch('/api/health'),
                fetch('/api/stats?days=7')
            ]);

            const healthData = await healthRes.json();
            const statsData = await statsRes.json();

            setStats({
                totalExploits: healthData.database_exploits?.toLocaleString() || '-',
                totalLoss: statsData.total_loss_usd != null
                    ? `$${(statsData.total_loss_usd / 1000000).toFixed(1)}M`
                    : '-',
                chainsTracked: healthData.tracked_chains || '-',
                activeSources: `${healthData.active_sources || 0}/${healthData.total_sources || 0}`
            });
            setLoading(false);
        } catch (error) {
            console.error('Error loading stats:', error);
            setLoading(false);
        }
    };

    return (
        <div className="text-white bg-black min-h-screen">
            <SEO />
            {/* Hero Section - x402 Infrastructure */}
            <section className="w-full border-b border-gray-500 border-opacity-25 bg-black">
                <div className="w-full px-5 mx-auto py-20" style={{ maxWidth: '1400px' }}>
                    <h1 className="sr-only">KAMIYO - x402 Infrastructure & Blockchain Security Intelligence</h1>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-20">
                        {/* Left: x402 Infrastructure */}
                        <div className="space-y-8">
                            <div className="inline-block">
                                <span className="text-xs text-blue-400 border border-blue-500 border-opacity-50 px-3 py-1.5 rounded-full uppercase tracking-wider">
                                    New Product Launch
                                </span>
                            </div>

                            <div>
                                <h2 className="text-5xl md:text-6xl font-light mb-6 leading-tight text-white">
                                    x402 Infrastructure
                                </h2>
                                <p className="text-2xl text-gray-300 mb-4 font-light">
                                    Multi-chain USDC payment verification for your APIs
                                </p>
                                <p className="text-gray-400 text-lg leading-relaxed">
                                    Add crypto micropayments to any API in 10 minutes. Production-ready payment verification across Solana, Base, Ethereum and more.
                                </p>
                            </div>

                            {/* x402 Features */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Free tier: 1,000 verifications/mo
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Multi-chain support
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    5 min integration
                                </span>
                            </div>

                            {/* x402 CTA */}
                            <div className="flex flex-wrap gap-6 items-center pt-4">
                                <Link
                                    href="/x402"
                                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-lg"
                                >
                                    Get Started Free
                                </Link>
                                <Link
                                    href="/x402/docs"
                                    className="px-8 py-4 border border-gray-500 hover:border-gray-400 text-white rounded-lg font-medium transition-colors"
                                >
                                    View Documentation
                                </Link>
                            </div>

                            {/* Quick integration preview */}
                            <div className="pt-8">
                                <p className="text-sm text-gray-500 mb-3 uppercase tracking-wider">Quick Integration:</p>
                                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
                                    <code className="text-blue-400">from</code> x402 <code className="text-blue-400">import</code> X402Client<br/>
                                    <br/>
                                    client = X402Client(api_key=<span className="text-green-400">"x402_live_..."</span>)<br/>
                                    result = client.verify_payment(tx_hash=<span className="text-green-400">"..."</span>, chain=<span className="text-green-400">"solana"</span>)
                                </div>
                            </div>
                        </div>

                        {/* Right: Key Benefits */}
                        <div className="space-y-8 bg-gray-900 bg-opacity-30 border border-gray-800 rounded-2xl p-8">
                            <div>
                                <h3 className="text-3xl md:text-4xl font-light mb-4 text-white">
                                    Why x402 Infrastructure
                                </h3>
                                <p className="text-gray-400 text-base leading-relaxed mb-6">
                                    Production-ready payment verification without the blockchain complexity.
                                </p>
                            </div>

                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <svg className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <div>
                                        <p className="text-white font-medium">No Blockchain Expertise Required</p>
                                        <p className="text-gray-400 text-sm">We handle RPC endpoints, transaction parsing, and confirmations</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <div>
                                        <p className="text-white font-medium">Works Across All Chains</p>
                                        <p className="text-gray-400 text-sm">Solana, Base, Ethereum - one API for everything</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <svg className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <div>
                                        <p className="text-white font-medium">Battle-Tested Infrastructure</p>
                                        <p className="text-gray-400 text-sm">99.9% uptime SLA with sub-500ms response times</p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* x402 Stats Section */}
            <section className="w-full border-b border-gray-500 border-opacity-25 py-16">
                <div className="w-full px-5 mx-auto" style={{ maxWidth: '1400px' }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <div className="text-center">
                            <div className="text-4xl font-light text-white mb-2">8+</div>
                            <div className="text-sm text-gray-500 uppercase tracking-wider">Blockchains</div>
                        </div>
                        <div className="text-center">
                            <div className="text-4xl font-light text-white mb-2">99.9%</div>
                            <div className="text-sm text-gray-500 uppercase tracking-wider">Uptime SLA</div>
                        </div>
                        <div className="text-center">
                            <div className="text-4xl font-light text-white mb-2">&lt;500ms</div>
                            <div className="text-sm text-gray-500 uppercase tracking-wider">Avg Response</div>
                        </div>
                        <div className="text-center">
                            <div className="text-4xl font-light text-white mb-2">$99</div>
                            <div className="text-sm text-gray-500 uppercase tracking-wider">Starting Price</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* x402 Use Cases */}
            <section className="w-full border-b border-gray-500 border-opacity-25 py-20">
                <div className="w-full px-5 mx-auto" style={{ maxWidth: '1400px' }}>
                    <h3 className="text-3xl font-light text-center mb-12 text-white">Built for Developers</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="border border-gray-800 rounded-lg p-8 space-y-4">
                            <div className="text-blue-400 text-4xl">💰</div>
                            <h4 className="text-xl font-medium text-white">API Monetization</h4>
                            <p className="text-gray-400">
                                Add pay-per-use pricing to any API. Verify USDC payments before granting access.
                            </p>
                        </div>

                        <div className="border border-gray-800 rounded-lg p-8 space-y-4">
                            <div className="text-blue-400 text-4xl">🤖</div>
                            <h4 className="text-xl font-medium text-white">AI Agent Payments</h4>
                            <p className="text-gray-400">
                                Enable autonomous AI agents to pay for services via the ERC-8004 standard.
                            </p>
                        </div>

                        <div className="border border-gray-800 rounded-lg p-8 space-y-4">
                            <div className="text-blue-400 text-4xl">🔐</div>
                            <h4 className="text-xl font-medium text-white">Micropayment Walls</h4>
                            <p className="text-gray-400">
                                Replace subscriptions with micro-transactions. Pay only for what you use.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* x402 Pricing */}
            <section className="w-full border-b border-gray-500 border-opacity-25 py-20">
                <div className="w-full px-5 mx-auto" style={{ maxWidth: '1400px' }}>
                    <X402PricingTiers />
                </div>
            </section>

            {/* Trusted By Developers */}
            <section className="w-full border-b border-gray-500 border-opacity-25 py-16">
                <div className="w-full px-5 mx-auto" style={{ maxWidth: '1400px' }}>
                    <h3 className="text-2xl font-light text-center mb-8 text-white">Trusted by Developers Worldwide</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <StatsCard
                            title="Verifications/Month"
                            value="10M+"
                            loading={false}
                        />
                        <StatsCard
                            title="API Uptime"
                            value="99.9%"
                            loading={false}
                        />
                        <StatsCard
                            title="Avg Response Time"
                            value="<500ms"
                            loading={false}
                        />
                        <StatsCard
                            title="Supported Chains"
                            value="8+"
                            loading={false}
                        />
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="w-full py-20">
                <div className="w-full px-5 mx-auto text-center" style={{ maxWidth: '900px' }}>
                    <h3 className="text-4xl font-light mb-6 text-white">
                        Ready to add crypto payments to your API?
                    </h3>
                    <p className="text-gray-400 text-lg mb-10">
                        Get started with 1,000 free verifications per month. No credit card required.
                    </p>

                    <div className="flex flex-wrap gap-6 justify-center">
                        <Link
                            href="/x402"
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-lg"
                        >
                            Start Building Free
                        </Link>
                        <Link
                            href="/pricing"
                            className="px-8 py-4 border border-gray-600 hover:border-gray-500 text-white rounded-lg font-medium transition-colors"
                        >
                            View Pricing
                        </Link>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="w-full border-t border-gray-500 border-opacity-25 py-16">
                <div className="w-full px-5 mx-auto" style={{ maxWidth: '1200px' }}>
                    <FAQ />
                </div>
            </section>
        </div>
    );
}
