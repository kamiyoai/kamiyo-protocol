import SEO from '../components/SEO';

export default function About() {
    return (
        <div className="min-h-screen bg-black text-white">
            <SEO
                title="About KAMIYO - Trust Infrastructure for Autonomous Agents"
                description="KAMIYO provides decentralized SLA enforcement for machine-to-machine commerce. Escrow protection, oracle-based dispute resolution, and quality-based settlement for AI agent transactions."
                canonical="https://kamiyo.ai/about"
            />

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;私たちについて</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">The trust layer for the agentic economy</h1>
                    <h4 className="text-xl md:text-2xl mt-4 text-cyan">Decentralized SLA enforcement</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mb-20">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">The problem</h4>
                        <p className="mb-4 text-gray-400">AI agents are transacting autonomously at unprecedented scale. $15 trillion in B2B purchases are projected to be commanded by AI agents by 2028.</p>

                        <p className="mb-4 text-gray-400">But when something goes wrong—bad data, failed API calls, degraded service—there's no recourse. Payments happen instantly. Quality verification doesn't.</p>

                        <p className="mb-4 text-gray-400">Traditional dispute resolution assumes human involvement: customer support, chargebacks, legal proceedings. None of this works for autonomous systems making thousands of decisions per second.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">The solution</h4>
                        <p className="mb-4 text-gray-400">KAMIYO is decentralized SLA enforcement for machine-to-machine commerce.</p>
                        <ol className="space-y-3 text-gray-400 list-decimal list-inside">
                            <li>Agent pays for API access through KAMIYO escrow</li>
                            <li>Service delivers (or fails to deliver)</li>
                            <li>If SLA violated: automatic dispute triggered</li>
                            <li>Oracle network evaluates quality (0-100 score)</li>
                            <li>Graduated settlement: partial refund based on actual service quality</li>
                        </ol>
                        <p className="mt-4 text-gray-400">Real services are rarely perfect or complete failures. KAMIYO's quality-based arbitration enables proportional outcomes.</p>
                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">How it works</h4>
                        <ul className="space-y-4 text-gray-400">
                            <li>
                                <p><strong className="text-white">Escrowed Payments:</strong><br/>Funds held until service delivery is verified. Not binary release—graduated based on quality.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Automatic Disputes:</strong><br/>SLA violations trigger disputes without human intervention. Oracle network evaluates evidence.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Quality Scoring:</strong><br/>Oracles score service quality 0-100. Partial delivery means partial payment.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Privacy-Preserving:</strong><br/>ZK commit-reveal voting prevents oracle collusion. Votes verified on-chain.</p>
                            </li>
                        </ul>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Key differentiators</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-gray-400">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-2 text-white font-light">Feature</th>
                                        <th className="text-left py-2 text-white font-light">Traditional</th>
                                        <th className="text-left py-2 text-white font-light">KAMIYO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Payment</td>
                                        <td className="py-2">Instant</td>
                                        <td className="py-2 text-cyan">Escrowed</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Disputes</td>
                                        <td className="py-2">Customer support</td>
                                        <td className="py-2 text-cyan">Automatic</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Outcomes</td>
                                        <td className="py-2">Binary</td>
                                        <td className="py-2 text-cyan">Graduated (0-100)</td>
                                    </tr>
                                    <tr className="border-b border-gray-800">
                                        <td className="py-2">Arbitration</td>
                                        <td className="py-2">Centralized</td>
                                        <td className="py-2 text-cyan">Oracle network</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2">Settlement</td>
                                        <td className="py-2">Weeks</td>
                                        <td className="py-2 text-cyan">Quality-based</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-800 pt-12">
                    <h4 className="text-xl md:text-2xl mb-6 font-light text-center">Use cases</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">API Data Quality</div>
                            <p className="text-gray-400 text-sm">Trading agent pays for market data. API returns stale prices. Oracles score quality at 35/100. Agent receives 75% refund automatically.</p>
                        </div>
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">Compute Services</div>
                            <p className="text-gray-400 text-sm">ML agent requests GPU time. Provider throttles after 60% completion. Oracle verifies partial delivery. Agent receives proportional refund.</p>
                        </div>
                        <div className="border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-xs uppercase tracking-wider mb-2">Multi-Agent Coordination</div>
                            <p className="text-gray-400 text-sm">Agent swarm coordinates tasks. One provider fails. Graduated settlement keeps funds flowing. Bad actors flagged for reputation damage.</p>
                        </div>
                    </div>
                </div>

            </section>

        </div>
    );
}
