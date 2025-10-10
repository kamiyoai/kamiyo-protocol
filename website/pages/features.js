import Head from 'next/head';

export default function Features() {
    return (
        <div className="min-h-screen">
            <Head>
                <title>Features - KAMIYO Blockchain Exploit Intelligence</title>
                <meta name="description" content="Explore KAMIYO's comprehensive feature set: real-time alerts, API access, webhook integrations, fork detection, pattern clustering, and more." />
            </Head>

            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;Features</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">Complete Feature Overview</h1>
                </div>

                {/* Alert & Notification Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">ALERTING</p>
                        <h2 className="text-2xl md:text-3xl font-light">Real-time Notifications</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Real-time Alerts</h3>
                            <p className="mb-4">Receive instant notifications when new exploits are detected across the blockchain ecosystem. KAMIYO monitors 20+ verified sources continuously and delivers alerts within an average of 4 minutes from initial detection.</p>
                            <p className="mb-4">Available on all tiers, with the Free tier providing up to 10 alerts per month and Pro/Team/Enterprise tiers offering unlimited alerts.</p>
                            <p className="text-sm text-gray-500">Available: Free (10/month), Pro+</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Multi-Channel Delivery</h3>
                            <p className="mb-4">Choose how you want to receive exploit intelligence:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Email notifications:</strong> Clean, formatted alerts delivered to your inbox (Free tier)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Discord integration:</strong> Direct notifications to your Discord server (Pro+)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Telegram bots:</strong> Instant mobile and desktop alerts (Pro+)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Slack integration:</strong> Team-wide notifications in your workspace (Team+)</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Email: Free tier | Discord/Telegram: Pro+ | Slack: Team+</p>
                        </div>
                    </div>
                </div>

                {/* API & Integration Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">DEVELOPER TOOLS</p>
                        <h2 className="text-2xl md:text-3xl font-light">API & Integrations</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">REST API Access</h3>
                            <p className="mb-4">Integrate KAMIYO's exploit intelligence directly into your applications, monitoring tools, or security workflows with our comprehensive REST API.</p>
                            <p className="mb-4">Query historical exploits, filter by chain/protocol/type, and retrieve detailed incident data programmatically. The Pro tier includes 50,000 API requests per day.</p>
                            <p className="text-sm text-gray-500">Available: Pro+ (50K req/day)</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">WebSocket Feed</h3>
                            <p className="mb-4">Subscribe to real-time exploit data streams via WebSocket connections. Perfect for building live dashboards, monitoring systems, or automated trading bots that need instant exploit awareness.</p>
                            <p className="mb-4">WebSocket connections provide lower latency than polling the REST API and ensure you never miss a critical security event.</p>
                            <p className="text-sm text-gray-500">Available: Pro+</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Webhook Endpoints</h3>
                            <p className="mb-4">Configure custom webhook endpoints to receive POST requests when new exploits match your filters. Webhooks enable seamless integration with your existing infrastructure without requiring continuous polling.</p>
                            <p className="mb-4">Team tier includes 5 webhook endpoints, Enterprise tier provides 50 webhook endpoints with custom retry policies and delivery guarantees.</p>
                            <p className="text-sm text-gray-500">Available: Team (5 endpoints), Enterprise (50 endpoints)</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">Feature Extraction API</h3>
                            <p className="mb-4">Access our exploit feature extraction system to analyze confirmed historical exploits. Extract technical features including bytecode patterns, function signatures, contract structures, and attack vectors.</p>
                            <p className="mb-4">Useful for security research, academic analysis, and building custom anomaly detection models based on historical exploit patterns.</p>
                            <p className="text-sm text-gray-500">Available: Pro+</p>
                        </div>
                    </div>
                </div>

                {/* Dashboard & Data Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">DATA ACCESS</p>
                        <h2 className="text-2xl md:text-3xl font-light">Dashboard & Historical Data</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Public Dashboard</h3>
                            <p className="mb-4">Access the KAMIYO public dashboard to browse recent exploits, view statistics, and search historical incidents. Available on all tiers including Free.</p>
                            <p className="mb-4">The dashboard provides filtering by chain, protocol, exploit type, and time range. See real-time statistics on total exploits tracked, total value lost, and active monitoring sources.</p>
                            <p className="text-sm text-gray-500">Available: All tiers</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">Historical Data Access</h3>
                            <p className="mb-4">Query historical exploit data to understand patterns, research past incidents, and build your own analysis workflows:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Pro tier:</strong> 90 days of historical data</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span><strong>Enterprise tier:</strong> 2+ years of comprehensive exploit history</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Pro: 90 days | Enterprise: 2+ years</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Chain Coverage</h3>
                            <p className="mb-4">KAMIYO tracks exploits across 54 blockchain networks including:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Ethereum mainnet and Layer 2s (Arbitrum, Optimism, Base, zkSync)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Alternative Layer 1s (Solana, BSC, Avalanche, Polygon)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Cosmos ecosystem chains</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Emerging networks and testnets</span>
                                </li>
                            </ul>
                            <p className="mb-4">All data is verified with on-chain transaction hashes from blockchain explorers.</p>
                            <p className="text-sm text-gray-500">Available: All tiers</p>
                        </div>
                    </div>
                </div>

                {/* Advanced Analysis Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">ADVANCED FEATURES</p>
                        <h2 className="text-2xl md:text-3xl font-light">Pattern Recognition & Analysis</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Fork Detection Analysis</h3>
                            <p className="mb-4">Identify when exploited contracts are forks or copies of other vulnerable contracts. Our bytecode analysis system detects structural similarities between contracts to map exploit family trees.</p>
                            <p className="mb-4">Understanding fork relationships helps security researchers identify systemic vulnerabilities that affect multiple protocols and predict where similar attacks might occur.</p>
                            <p className="mb-4">The fork detection system uses advanced bytecode comparison algorithms to identify clones, forks, and derivative contracts even when source code isn't available.</p>
                            <p className="text-sm text-gray-500">Available: Team+</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">Pattern Clustering</h3>
                            <p className="mb-4">Group historical exploits by similarity using machine learning clustering algorithms. Pattern clustering identifies common attack vectors, similar bytecode patterns, and shared exploit characteristics.</p>
                            <p className="mb-4">Useful for identifying exploit trends, understanding attacker methodologies, and researching systemic vulnerabilities across the DeFi ecosystem.</p>
                            <p className="text-sm text-gray-500">Available: Team+</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Fork Graph Visualization</h3>
                            <p className="mb-4">Interactive graph visualizations showing relationships between forked contracts and exploit families. See how vulnerabilities spread through the ecosystem when developers fork vulnerable code.</p>
                            <p className="mb-4">The fork graph helps identify:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Common ancestor contracts that spawned multiple exploited forks</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Protocols at risk from forking known-vulnerable code</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Clusters of related exploits sharing similar code structures</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Available: Enterprise</p>
                        </div>
                    </div>
                </div>

                {/* Team & Enterprise Features */}
                <div className="mb-20">
                    <div className="border-dotted border-b border-gray-500 border-opacity-25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">COLLABORATION</p>
                        <h2 className="text-2xl md:text-3xl font-light">Team & Enterprise Tools</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Protocol Watchlists</h3>
                            <p className="mb-4">Create custom watchlists for specific protocols, contracts, or addresses you want to monitor closely. Receive priority alerts when any activity is detected related to your watchlist items.</p>
                            <p className="mb-4">Perfect for DeFi protocols monitoring their own security posture and competitors, or for investors tracking their portfolio holdings.</p>
                            <p className="text-sm text-gray-500">Available: Enterprise</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4">Priority Support</h3>
                            <p className="mb-4">Team tier includes priority email support with guaranteed response times. Get help with API integrations, webhook configurations, and custom alert setups.</p>
                            <p className="text-sm text-gray-500">Available: Team+</p>

                            <h3 className="text-xl md:text-2xl mb-4 mt-8">Dedicated Support</h3>
                            <p className="mb-4">Enterprise customers receive dedicated support including:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Direct Slack/Discord channel with engineering team</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Custom integration assistance</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Quarterly business reviews</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Feature prioritization for custom needs</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-500">Available: Enterprise</p>
                        </div>
                    </div>
                </div>

                {/* What We Don't Do */}
                <div className="mb-20 border border-gray-500 border-opacity-25 rounded-lg p-8">
                    <h2 className="text-2xl md:text-3xl font-light mb-6">Important: What KAMIYO Does NOT Do</h2>
                    <p className="mb-4">KAMIYO is an exploit intelligence <strong>aggregator</strong>, not a security analysis tool. We want to be transparent about what we don't offer:</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <ul className="space-y-3 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No vulnerability scanning:</strong> We don't analyze your smart contracts for vulnerabilities</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No security scoring:</strong> We don't evaluate or rate the security of protocols</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No predictive analysis:</strong> We report confirmed exploits, not predictions</span>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <ul className="space-y-3 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No code auditing:</strong> We aggregate external reports, not perform audits</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No security consulting:</strong> We provide data, not security advice</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-gray-400"><strong>No bug discovery:</strong> We aggregate confirmed incidents from trusted sources</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <p className="mt-6 text-sm text-gray-500">Our value is in being <strong>fast</strong> to aggregate and organize scattered exploit intelligence from trusted sources. For vulnerability detection and security audits, consult professional security firms.</p>
                </div>

            </section>

        </div>
    );
}
