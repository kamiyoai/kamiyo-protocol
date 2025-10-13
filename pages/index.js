// pages/index.js
import { useState, useEffect } from "react";
import StatsCard from "../components/dashboard/StatsCard";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";

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
        // Refresh stats every 30 seconds
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
                totalLoss: statsData.total_loss_usd
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
            {/* Hero Section */}
            <section className="w-full border-b border-gray-500 border-opacity-25 bg-black">
                <div className="w-full px-5 mx-auto py-16" style={{ maxWidth: '1400px' }}>
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only">KAMIYO - Real-time blockchain exploit intelligence</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <div className="space-y-8">
                            {/* Heading */}
                            <div>
                                <h2 className="text-4xl md:text-6xl font-light mb-4 leading-tight text-white">
                                    Blockchain Exploit Intelligence,<br />Aggregated & Organized
                                </h2>
                                <p className="text-gray-400 text-lg leading-relaxed">
                                    Track verified exploits from trusted security sources.<br/>
                                    Get organized alerts. One dashboard for all chains.
                                </p>
                            </div>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Free tier available
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Real-time alerts (Pro)
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    No credit card required
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-wrap gap-6 items-center">
                                <div className="scale-110 origin-left ml-8">
                                    <PayButton
                                        textOverride="Get Free Alerts"
                                        onClickOverride={() => {
                                            window.location.href = '/auth/signin';
                                        }}
                                    />
                                </div>
                            </div>

                            <p className="text-sm text-gray-500">
                                Free: 10 alerts/month • Pro: Unlimited • Webhooks start at Team tier
                            </p>

                            <button
                                onClick={() => {
                                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="text-xs uppercase tracking-wider hover:opacity-80 transition-opacity duration-300"
                                style={{ color: '#ff44f5', marginRight: '40px' }}
                            >
                                View Pricing
                            </button>

                            {/* Stats Row */}
                            <div className="pt-8">
                                <div className="text-gray-500 text-sm uppercase tracking-wider mb-4">
                                    Total Exploits Tracked
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-4xl font-light gradient-text">
                                        {loading ? '-' : stats.totalExploits}
                                    </span>
                                    <div className="flex gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
                                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
                                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400"></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right column: Video */}
                        <div className="flex justify-center md:justify-end">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-auto"
                                style={{ height: '24rem', filter: 'saturate(2.0) contrast(1.2)' }}
                                aria-label="Kamiyo"
                            >
                                <source src="/media/pfn_x_42.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <StatsCard
                            label="Total Exploits"
                            value={stats.totalExploits}
                            loading={loading}
                        />
                        <StatsCard
                            label="Total Loss (7 Days)"
                            value={stats.totalLoss}
                            loading={loading}
                        />
                        <StatsCard
                            label="Chains Tracked"
                            value={stats.chainsTracked}
                            loading={loading}
                        />
                        <StatsCard
                            label="Active Sources"
                            value={stats.activeSources}
                            loading={loading}
                        />
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }}>
                <div className="text-center mb-12">
                    <h2 className="text-4xl md:text-5xl font-light mb-4">Simple Pricing</h2>
                    <p className="text-gray-400 text-lg">Start free. Upgrade when you need real-time alerts.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                    {/* Free Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Free</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$0</span>
                            <span className="text-gray-500 text-xs ml-1">forever</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">24-hour delayed data</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">10 alerts/month</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Public dashboard</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Email only</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Sign Up Free"
                                onClickOverride={() => {
                                    window.location.href = '/auth/signin';
                                }}
                            />
                        </div>
                    </div>

                    {/* Pro Tier - Highlighted */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card card-highlighted -translate-y-1 transition-all duration-300 flex flex-col">
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                                Most Popular
                            </span>
                        </div>
                        <h3 className="text-xl font-light mb-2">Pro</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$99</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Unlimited real-time alerts</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">50K API req/day</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">WebSocket feed</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Discord/Telegram/Email</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Historical data (90 days)</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Start Free Trial"
                                onClickOverride={() => {
                                    window.location.href = '/pricing';
                                }}
                            />
                        </div>
                    </div>

                    {/* Team Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Team</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$299</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Pro</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">5 webhook endpoints</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Slack integration</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Fork detection <span className="text-yellow-500 text-xs">(Beta)</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Pattern clustering <span className="text-yellow-500 text-xs">(Beta)</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Priority support</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Start Free Trial"
                                onClickOverride={() => {
                                    window.location.href = '/pricing';
                                }}
                            />
                        </div>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Enterprise</h3>
                        <div className="mb-6">
                            <span className="text-gray-400 text-xs">from </span>
                            <span className="text-4xl font-light gradient-text">$999</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Team</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">50 webhook endpoints</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Protocol watchlists</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Fork graph visualization <span className="text-yellow-500 text-xs">(Beta)</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Historical data (2+ years)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Dedicated support</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Contact Sales"
                                onClickOverride={() => {
                                    window.location.href = '/inquiries';
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Comparison Section */}
                <div className="border-t border-gray-500 border-opacity-25 pt-12">
                    <h3 className="text-2xl font-light text-center mb-8">Compared to Alternatives</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <h4 className="text-lg mb-4 text-gray-400">X Alerts</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li>• Random timing (15 mins - 4 hours)</li>
                                <li>• No API access</li>
                                <li>• Follow multiple accounts</li>
                                <li>• No filtering</li>
                            </ul>
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <h4 className="text-lg mb-4 text-gray-400">Security Firms</h4>
                            <ul className="space-y-2 text-sm text-gray-500">
                                <li>• $50k+ audits only</li>
                                <li>• Enterprise sales process</li>
                                <li>• No self-serve access</li>
                                <li>• Weeks to get started</li>
                            </ul>
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <h4 className="text-lg mb-4 text-white">KAMIYO</h4>
                            <ul className="space-y-2 text-sm text-gray-300">
                                <li>• Organized exploit tracking</li>
                                <li>• Full API + WebSocket</li>
                                <li>• Multi-channel alerts</li>
                                <li>• Sign up in 30 seconds</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Social Proof & Features Section */}
            <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }}>
                {/* Trusted By */}
                <div className="text-center mb-16">
                    <h3 className="text-gray-500 text-sm uppercase tracking-wider mb-6">Trusted By</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Traders</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Security Researchers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Protocol Teams</span>
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Organized Aggregation</h3>
                        <p className="text-gray-500 text-sm">
                            Exploits from verified security sources organized in one place
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Verified Only</h3>
                        <p className="text-gray-500 text-sm">
                            Only confirmed exploits with transaction hashes from trusted sources
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Developer API</h3>
                        <p className="text-gray-500 text-sm">
                            REST API and WebSocket support for integration into your tools
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <FAQ />
        </div>
    );
}
