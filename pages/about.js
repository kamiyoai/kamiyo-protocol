import SEO from '../components/SEO';
import { useEffect, useState, useRef } from 'react';
import Script from 'next/script';

export default function About() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        fetch('/api/protocol-stats')
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (stats?.distribution && chartRef.current && window.Chart) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            chartInstance.current = new window.Chart(chartRef.current.getContext('2d'), {
                type: 'line',
                data: {
                    labels: ['0-20', '20-40', '40-60', '60-80', '80-100'],
                    datasets: [{
                        label: 'Quality Score Distribution',
                        data: stats.distribution,
                        borderColor: 'rgb(79, 233, 234)',
                        backgroundColor: 'rgba(79, 233, 234, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: '#222' }, ticks: { color: '#888' } },
                        y: { grid: { color: '#222' }, ticks: { color: '#888' } }
                    }
                }
            });
        }
    }, [stats]);

    return (
        <div className="min-h-screen bg-black text-white">
            <SEO
                title="About KAMIYO - Trust Infrastructure for Autonomous Agents"
                description="KAMIYO provides decentralized SLA enforcement for machine-to-machine commerce. Escrow protection, oracle-based dispute resolution, and quality-based settlement for AI agent transactions."
                canonical="https://kamiyo.ai/about"
            />

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="subheading-border mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest gradient-text mb-4 md:mb-8">— &nbsp;About</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">Trust infrastructure for autonomous commerce</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mb-20">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">The challenge</h4>
                        <p className="mb-4 text-gray-400">Autonomous agents are executing transactions at machine speed. By 2028, AI-driven systems will manage an estimated $15 trillion in B2B commerce.</p>

                        <p className="mb-4 text-gray-400">Current payment infrastructure assumes human oversight. When a service degrades or an API fails, there's no automated path to resolution. Funds transfer instantly while quality verification remains manual.</p>

                        <p className="mb-4 text-gray-400">Existing dispute mechanisms—support tickets, chargebacks, arbitration—require human intervention at every step. This breaks down when systems process thousands of transactions per second.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Our approach</h4>
                        <p className="mb-4 text-gray-400">KAMIYO provides programmatic SLA enforcement for machine-to-machine transactions.</p>
                        <ol className="space-y-3 text-gray-400 list-decimal list-inside">
                            <li>Payment held in escrow until delivery verification</li>
                            <li>Service execution with defined quality parameters</li>
                            <li>Automatic dispute initiation on SLA violation</li>
                            <li>Decentralized oracle network scores delivery quality</li>
                            <li>Proportional settlement based on verified performance</li>
                        </ol>
                        <p className="mt-4 text-gray-400">Services exist on a spectrum. KAMIYO enables settlement that reflects actual delivery quality rather than binary pass/fail outcomes.</p>
                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">Core components</h4>
                        <ul className="space-y-4 text-gray-400">
                            <li>
                                <p><strong className="text-white">Escrow Protocol</strong><br/>Funds secured until service delivery is verified. Settlement graduated based on quality score.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Dispute Engine</strong><br/>SLA violations trigger automated disputes. Evidence submitted to oracle network for evaluation.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Quality Scoring</strong><br/>Oracle consensus determines service quality on a 0-100 scale. Partial delivery results in proportional payment.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Collusion Resistance</strong><br/>ZK commit-reveal voting with stake-weighted consensus. All votes verified on-chain.</p>
                            </li>
                        </ul>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Comparison</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-gray-400">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-2 text-white font-light"></th>
                                        <th className="text-left py-2 text-white font-light">Legacy</th>
                                        <th className="text-left py-2 text-white font-light">KAMIYO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Payment</td>
                                        <td className="py-2">Immediate</td>
                                        <td className="py-2 text-cyan">Escrowed</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Disputes</td>
                                        <td className="py-2">Manual</td>
                                        <td className="py-2 text-cyan">Programmatic</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Resolution</td>
                                        <td className="py-2">Binary</td>
                                        <td className="py-2 text-cyan">Graduated</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Arbitration</td>
                                        <td className="py-2">Centralized</td>
                                        <td className="py-2 text-cyan">Decentralized</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2">Timeline</td>
                                        <td className="py-2">Days to weeks</td>
                                        <td className="py-2 text-cyan">Seconds</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-800 pt-12">
                    <h4 className="text-xl md:text-2xl mb-6 font-light text-center">Applications</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">Data Services</div>
                            <p className="text-gray-400 text-sm">Agent purchases market data feed. Provider delivers stale prices. Oracle network scores quality at 35/100. Proportional refund issued automatically.</p>
                        </div>
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">Compute</div>
                            <p className="text-gray-400 text-sm">Agent provisions GPU resources. Provider throttles at 60% completion. Partial delivery verified. Settlement reflects actual usage.</p>
                        </div>
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">Agent Networks</div>
                            <p className="text-gray-400 text-sm">Multi-agent system coordinates task execution. Provider fails delivery. Graduated settlement maintains network flow. Reputation updated on-chain.</p>
                        </div>
                    </div>
                </div>

                {/* Live Protocol Stats */}
                <div className="border-t border-gray-800 pt-12 mt-12">
                    <div className="flex items-center justify-between mb-8">
                        <h4 className="text-xl md:text-2xl font-light">Live Protocol Analytics</h4>
                        <a
                            href="https://protocol.kamiyo.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-500 hover:text-cyan transition-colors"
                        >
                            View Full Dashboard →
                        </a>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-gray-500">Loading protocol data...</div>
                    ) : stats ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Total Assessments</div>
                                    <div className="text-3xl font-light gradient-text">{stats.totalAssessments}</div>
                                </div>
                                <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Completed</div>
                                    <div className="text-3xl font-light gradient-text">{stats.completed}</div>
                                </div>
                                <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Avg Quality</div>
                                    <div className="text-3xl font-light gradient-text">{stats.avgQuality}</div>
                                </div>
                                <div className="text-center p-6 bg-[#0a0a0a] rounded-lg border border-gray-800">
                                    <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">Total Refunded</div>
                                    <div className="text-3xl font-light gradient-text">{stats.totalRefunded} SOL</div>
                                </div>
                            </div>

                            <div className="bg-[#0a0a0a] rounded-lg border border-gray-800 p-6">
                                <h5 className="text-sm text-gray-500 uppercase tracking-wider mb-4">Quality Score Distribution</h5>
                                <div className="h-64">
                                    <canvas ref={chartRef}></canvas>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            Unable to load protocol data.{' '}
                            <a href="https://protocol.kamiyo.ai" className="text-cyan hover:underline">
                                View live dashboard
                            </a>
                        </div>
                    )}
                </div>

            </section>

            <Script
                src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
                strategy="afterInteractive"
                onLoad={() => {
                    if (stats?.distribution && chartRef.current) {
                        chartInstance.current = new window.Chart(chartRef.current.getContext('2d'), {
                            type: 'line',
                            data: {
                                labels: ['0-20', '20-40', '40-60', '60-80', '80-100'],
                                datasets: [{
                                    label: 'Quality Score Distribution',
                                    data: stats.distribution,
                                    borderColor: 'rgb(79, 233, 234)',
                                    backgroundColor: 'rgba(79, 233, 234, 0.1)',
                                    tension: 0.4,
                                    fill: true
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                    x: { grid: { color: '#222' }, ticks: { color: '#888' } },
                                    y: { grid: { color: '#222' }, ticks: { color: '#888' } }
                                }
                            }
                        });
                    }
                }}
            />
        </div>
    );
}
