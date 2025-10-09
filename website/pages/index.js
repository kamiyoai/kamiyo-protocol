// pages/index.js
import { useState, useEffect } from "react";
import StatsCard from "../components/dashboard/StatsCard";
import ExploitsTable from "../components/dashboard/ExploitsTable";
import DashboardFilters from "../components/dashboard/DashboardFilters";
import PayButton from "../components/PayButton";

export default function Home() {
    const [stats, setStats] = useState({
        totalExploits: '-',
        totalLoss: '-',
        chainsTracked: '-',
        activeSources: '-'
    });
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({});

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
                                <h2 className="text-5xl md:text-5xl font-light mb-4">
                                    Real-time Blockchain Exploit Intelligence
                                </h2>
                                <p className="text-gray-400 text-lg">
                                    Kamiyo brings real-time exploit tracking, helping you stay informed with verified intelligence and comprehensive coverage.
                                </p>
                            </div>

                            {/* CTA Button */}
                            <div>
                                <PayButton
                                    textOverride="Subscribe for Alerts"
                                    onClickOverride={() => {
                                        window.location.href = '/auth/signin';
                                    }}
                                />
                            </div>

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
                                style={{ height: '24rem', filter: 'saturate(2.5) contrast(1.2)' }}
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

            {/* Dashboard Section */}
            <section className="w-full px-5 mx-auto py-12" style={{ maxWidth: '1400px' }}>
                {/* Filters */}
                <div className="mb-8">
                    <DashboardFilters onFiltersChange={setFilters} />
                </div>

                {/* Exploits Table */}
                <div>
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-xl font-light text-gray-400 uppercase tracking-wider">
                            Recent Exploits
                        </h2>
                        <span className="text-xs text-cyan border border-cyan border-opacity-50 px-2 py-1 rounded">
                            24 hour delay
                        </span>
                    </div>
                    <ExploitsTable filters={filters} />
                </div>
            </section>

            {/* Features Section */}
            <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
            </section>
        </div>
    );
}
