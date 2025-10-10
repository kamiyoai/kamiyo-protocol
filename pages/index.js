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
                    <h1 className="sr-only">Kamiyo - Real-time blockchain exploit intelligence</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <div className="space-y-8">
                            {/* Heading */}
                            <div>
                                <h2 className="text-5xl md:text-6xl font-light mb-4 leading-tight text-white">
                                    DeFi Exploit Alerts In 4 Minutes, Not 4 Hours
                                </h2>
                                <p className="text-gray-400 text-lg leading-relaxed">
                                    Track exploits across 54 chains from 20+ verified sources.<br/>
                                    Get instant alerts. Skip the Twitter hunt.
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
                                Free tier: 24h delay • Pro: Real-time • Upgrade anytime
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    {/* Free Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 card hover:-translate-y-1 transition-all duration-300">
                        <h3 className="text-2xl font-light mb-2">Free</h3>
                        <div className="mb-4">
                            <span className="text-5xl font-light gradient-text">$0</span>
                            <span className="text-gray-500 text-sm ml-2">forever</span>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">Perfect for staying informed</p>

                        <ul className="space-y-3 mb-8 text-sm">
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Exploit alerts <span className="text-gray-500">(24h delay)</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Public dashboard access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Email notifications</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-gray-600 mt-1">−</span>
                                <span className="text-gray-600">API access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-gray-600 mt-1">−</span>
                                <span className="text-gray-600">WebSocket feed</span>
                            </li>
                        </ul>

                        <div className="flex justify-center">
                            <PayButton
                                textOverride="Sign Up Free"
                                onClickOverride={() => {
                                    window.location.href = '/auth/signin';
                                }}
                            />
                        </div>
                    </div>

                    {/* Pro Tier - Highlighted */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 card card-highlighted -translate-y-1 transition-all duration-300">
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-4 py-1 rounded-full">
                                Most Popular
                            </span>
                        </div>
                        <h3 className="text-2xl font-light mb-2">Pro</h3>
                        <div className="mb-4">
                            <span className="text-5xl font-light gradient-text">$29</span>
                            <span className="text-gray-500 text-sm ml-2">/month</span>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">For developers and traders</p>

                        <ul className="space-y-3 mb-8 text-sm">
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Real-time alerts <span className="text-cyan">&lt; 5 minutes</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Full dashboard access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Instant notifications</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">API access <span className="text-gray-500">(1,000 req/day)</span></span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">WebSocket feed</span>
                            </li>
                        </ul>

                        <div className="flex justify-center">
                            <PayButton
                                textOverride="Start Free Trial"
                                onClickOverride={() => {
                                    window.location.href = '/pricing';
                                }}
                            />
                        </div>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 card hover:-translate-y-1 transition-all duration-300">
                        <h3 className="text-2xl font-light mb-2">Enterprise</h3>
                        <div className="mb-4">
                            <span className="text-gray-400 text-sm">starts at </span>
                            <span className="text-5xl font-light gradient-text">$399</span>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">For teams and protocols</p>

                        <ul className="space-y-3 mb-8 text-sm">
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Pro</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Dedicated support</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Custom integrations</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">SLA guarantees</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-4 h-4 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">White-label alerts</span>
                            </li>
                        </ul>

                        <div className="flex justify-center">
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
                            <h4 className="text-lg mb-4 text-gray-400">Twitter Alerts</h4>
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
                            <h4 className="text-lg mb-4 text-gray-400">Kamiyo</h4>
                            <ul className="space-y-2 text-sm text-gray-300">
                                <li>• Consistent 4-minute alerts</li>
                                <li>• Full API + WebSocket</li>
                                <li>• All sources in one place</li>
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
                            <span className="text-sm text-gray-400">Trading Bot Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">DeFi Traders</span>
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
                        <h3 className="text-lg font-light mb-3 gradient-text">Fast Aggregation</h3>
                        <p className="text-gray-500 text-sm">
                            Exploits from 20+ verified sources aggregated in real-time
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

                {/* Testimonials */}
                <div className="border-t border-gray-500 border-opacity-25 pt-16">
                    <h3 className="text-3xl font-light text-center mb-12">What Users Say</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <p className="text-gray-300 mb-4 italic">
                                "Got alerted to the exploit 3 minutes after it happened. Saved me from depositing."
                            </p>
                            <div>
                                <div className="text-sm font-medium text-gray-400">Anonymous Pro User</div>
                                <div className="text-xs text-gray-600">DeFi Trader</div>
                            </div>
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <p className="text-gray-300 mb-4 italic">
                                "Finally, a reliable API for exploit data. The WebSocket feed is a game-changer."
                            </p>
                            <div>
                                <div className="text-sm font-medium text-gray-400">Dev Team</div>
                                <div className="text-xs text-gray-600">Trading Bot Developer</div>
                            </div>
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                            <p className="text-gray-300 mb-4 italic">
                                "We use Kamiyo to monitor our protocol forks. Worth every penny."
                            </p>
                            <div>
                                <div className="text-sm font-medium text-gray-400">Security Team</div>
                                <div className="text-xs text-gray-600">Protocol Foundation</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <FAQ />
        </div>
    );
}
