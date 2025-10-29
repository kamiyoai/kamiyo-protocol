// pages/index.js
import { useState, useEffect } from "react";
import StatsCard from "../components/dashboard/StatsCard";
import PayButton from "../components/PayButton";
import PricingCard from "../components/PricingCard";
import FAQ from "../components/FAQ";
import SEO from "../components/SEO";
import { mcpPlans } from "../config/pricingPlans";

export default function Home() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        // Fetch homepage stats on mount
        fetch('/api/homepage-stats')
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error('Failed to fetch stats:', err));
    }, []);

    return (
        <>
            <SEO />
            <div className="text-white bg-black min-h-screen">
                {/* Hero Section */}
                <section className="w-full border-b border-gray-500/25 bg-black">
                <div className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 max-w-[1400px]">
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only leading-[1.25]">KAMIYO: Security Intelligence for AI Agents via MCP & x402</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;ブロックチェーン脆弱情報</p>
                                <h2 className="text-3xl md:text-4xl lg:text-5xl font-light mb-4 leading-tight text-white">
                                    Give Your AI Agents a Security Brain
                                </h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed">
                                    Subscribe via MCP for unlimited queries, or pay $0.01 per query with x402. Aggregating exploits from 20+ sources. $2.1B stolen in H1 2025 - know before you deploy.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    20+ Exploit Sources
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    Real-Time Alerts
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    $0.01 per Query via x402
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    No API Keys Required
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="scale-110 md:origin-left md:ml-8">
                                    <PayButton
                                        textOverride="Subscribe to MCP"
                                        onClickOverride={() => {
                                            window.location.href = '/pricing';
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        window.location.href = '/api-docs';
                                    }}
                                    className="text-xs text-magenta hover:opacity-80 transition-opacity duration-300"
                                    style={{ paddingLeft: '4rem', paddingTop: '13px' }}
                                    title="View API documentation for MCP and x402"
                                    aria-label="View API documentation"
                                >
                                    View Documentation →
                                </button>
                            </div>

                        </article>

                        {/* Right column: Video (hidden on mobile) */}
                        <div className="hidden md:flex justify-center md:justify-end">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-auto h-96 saturate-[2.0] contrast-[1.2]"
                                aria-label="KAMIYO Security Intelligence demonstration for AI agents via MCP and x402"
                                title="Security intelligence for AI agents via MCP and x402"
                            >
                                <source src="/media/pfn_x_42.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Grid */}
            <section className="w-full px-5 mx-auto pt-8 pb-8 max-w-[1400px]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatsCard
                        label="Total Exploits"
                        value={stats ? stats.totalExploits : '-'}
                        loading={!stats}
                    />
                    <StatsCard
                        label="Stolen H1 2025"
                        value={stats ? stats.totalStolenH1.formatted : '-'}
                        loading={!stats}
                    />
                    <StatsCard
                        label="Chains Tracked"
                        value={stats ? stats.activeChains : '-'}
                        loading={!stats}
                    />
                    <StatsCard
                        label="Active Sources"
                        value={stats ? stats.sources.formatted : '-'}
                        loading={!stats}
                    />
                    <StatsCard
                        label="Response Time"
                        value={stats ? stats.responseTime.formatted : '-'}
                        loading={!stats}
                    />
                    <StatsCard
                        label="API Uptime"
                        value={stats ? stats.uptime.formatted : '-'}
                        loading={!stats}
                    />
                </div>
            </section>

            {/* Real Security Intelligence in Action Section */}
            <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
                    Real Security Intelligence in Action
                </h2>

                {/* Example: Recent Exploit Alert */}
                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">What Happened</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                            <div className="text-white text-lg mb-3">Curve Finance <span className="text-magenta">Reentrancy</span></div>
                            <div className="text-gray-400 text-sm mb-4 space-y-1">
                                <div><strong className="text-cyan">Detected:</strong> 2024-07-30 14:23 UTC</div>
                                <div><strong className="text-cyan">Chain:</strong> Ethereum Mainnet</div>
                                <div><strong className="text-magenta">Lost:</strong> $61.7M USDC/USDT</div>
                                <div><strong className="text-cyan">Vector:</strong> Vyper compiler 0.2.15-0.3.0 reentrancy</div>
                            </div>
                            <div className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-500/20">
                                <strong className="text-cyan">Source:</strong> CertiK, PeckShield, BlockSec (3 confirmations)
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Your AI Agent Gets This</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                            <div className="text-gray-500 mb-2">// Real API response (sanitized)</div>
                            <div className="text-white">{'{'}</div>
                            <div className="ml-4"><span className="text-cyan">"id"</span><span className="text-white">: </span><span className="text-gray-400">"exploit_curve_2024_07_30"</span><span className="text-white">,</span></div>
                            <div className="ml-4"><span className="text-cyan">"protocol"</span><span className="text-white">: </span><span className="text-gray-400">"Curve Finance"</span><span className="text-white">,</span></div>
                            <div className="ml-4"><span className="text-cyan">"severity"</span><span className="text-white">: </span><span className="text-magenta">"critical"</span><span className="text-white">,</span></div>
                            <div className="ml-4"><span className="text-cyan">"amount_usd"</span><span className="text-white">: </span><span className="text-magenta">61700000</span><span className="text-white">,</span></div>
                            <div className="ml-4"><span className="text-cyan">"vulnerability_type"</span><span className="text-white">: </span><span className="text-gray-400">"reentrancy"</span><span className="text-white">,</span></div>
                            <div className="ml-4"><span className="text-cyan">"affected_versions"</span><span className="text-white">: </span><span className="text-white">[</span><span className="text-gray-400">"vyper_0.2.15-0.3.0"</span><span className="text-white">]</span></div>
                            <div className="text-white">{'}'}</div>
                        </div>
                    </div>
                </div>

                {/* Example: Agent Making Smart Decisions */}
                <div className="bg-black border border-gray-500/20 rounded-lg p-8">
                    <div className="text-center mb-6">
                        <div className="text-xl font-light text-white mb-2">Claude with KAMIYO MCP</div>
                        <div className="text-sm text-gray-400">Making security-aware decisions automatically</div>
                    </div>

                    {/* Two-column layout: Code example + Interaction */}
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Left column: Claude Desktop Integration Code Example */}
                        <div>
                            <div className="bg-black border border-gray-500/20 rounded-lg p-6 font-mono text-sm">
                                <div className="text-gray-500 text-xs mb-4">// Claude Desktop Integration (30 seconds)</div>
                                <div className="text-white mb-2">
                                    <span className="text-cyan">const</span> kamiyo = <span className="text-cyan">await</span> claude.mcp.<span className="text-cyan">add</span>({'{'}
                                </div>
                                <div className="text-white ml-4 mb-2">
                                    <span className="text-cyan">name</span>: <span className="text-gray-400">"kamiyo-security"</span>,
                                </div>
                                <div className="text-white ml-4 mb-2">
                                    <span className="text-cyan">token</span>: process.env.<span className="text-white">MCP_TOKEN</span>
                                </div>
                                <div className="text-white mb-4">{'}'});</div>

                                <div className="text-gray-500 text-xs mb-2">// Now your agent knows about exploits</div>
                                <div className="text-white mb-2">
                                    <span className="text-cyan">await</span> claude.<span className="text-cyan">ask</span>(
                                </div>
                                <div className="text-white ml-4 mb-2">
                                    <span className="text-gray-400">"Is Uniswap V3 safe to deploy on?"</span>
                                </div>
                                <div className="text-white mb-4">);</div>

                                <div className="text-gray-500 text-xs mb-2">// Claude checks KAMIYO automatically</div>
                                <div className="text-gray-400 italic">
                                    "Based on KAMIYO: 2 incidents, last 145 days ago. Risk score: 0.32 (moderate). Safe to proceed with monitoring."
                                </div>
                            </div>
                        </div>

                        {/* Right column: Interaction examples stacked vertically */}
                        <div className="space-y-4">
                            <div className="bg-black border border-gray-500/20 rounded p-4">
                                <div className="text-white text-sm mb-2">User asks Claude:</div>
                                <div className="text-gray-300 text-sm italic">
                                    "Should I deploy my NFT marketplace to Polygon zkEVM?"
                                </div>
                            </div>
                            <div className="bg-black border border-gray-500/20 rounded p-4">
                                <div className="text-white text-sm mb-2">Claude checks KAMIYO:</div>
                                <div className="text-gray-300 text-xs font-mono">
                                    <span className="text-cyan">search_crypto_exploits</span>(<br/>
                                    &nbsp;&nbsp;<span className="text-cyan">chain</span>=<span className="text-gray-400">"polygon-zkevm"</span>,<br/>
                                    &nbsp;&nbsp;<span className="text-cyan">since</span>=<span className="text-gray-400">"2024-01-01"</span><br/>
                                    )
                                </div>
                            </div>
                            <div className="bg-black border border-gray-500/20 rounded p-4">
                                <div className="text-white text-sm mb-2">Claude's Response:</div>
                                <div className="text-gray-300 text-sm">
                                    "Based on KAMIYO data, Polygon zkEVM has had <strong className="text-white">2 minor incidents</strong> in 2024,
                                    both patched within 48 hours. <strong className="text-white">Risk score: 0.23/1.0 (low-moderate)</strong>.
                                    The most recent incident was 87 days ago. I'd recommend proceeding with deployment,
                                    but implement rate limiting and start with a $50K TVL cap for the first 30 days."
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="pricing-heading">
                <header className="text-center mb-12">
                    <h2 id="pricing-heading" className="text-2xl md:text-3xl font-light mb-4">Pricing</h2>
                    <p className="text-gray-400 text-sm md:text-lg">MCP subscriptions for unlimited AI agent access, or x402 API for pay-per-query</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                    {mcpPlans.map((plan, index) => (
                        <PricingCard
                            key={plan.tier}
                            plan={plan}
                            isHighlighted={plan.tier === 'team'}
                        />
                    ))}
                </div>

            </section>

            {/* Security Intelligence Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="ai-agents-heading">
                <header className="text-center mb-12">
                    <h2 id="ai-agents-heading" className="text-3xl md:text-4xl lg:text-5xl font-light mb-4">Built for AI Agents</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Option 1: Add to Claude Desktop (MCP) | Option 2: Pay per query (x402)</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">1. Try It Now (No Payment)</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-gray-500/10 border border-gray-500/30 rounded text-xs text-gray-400 mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
                            </svg>
                            <span>10 seconds</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Make a request to see payment details and what you'll pay
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono mb-3">
                            <div className="text-gray-500">$ <span className="text-cyan">curl</span> https://api.kamiyo.ai/v1/exploits</div>
                            <div className="text-white mt-2">HTTP/1.1 402 Payment Required</div>
                            <div className="text-cyan mt-1">X-Payment-Amount: <span className="text-white">0.01 USDC</span></div>
                            <div className="text-cyan">X-Payment-Chain: <span className="text-white">base</span></div>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">2. Send 1 USDC, Get 100 Queries</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-gray-500/10 border border-gray-500/30 rounded text-xs text-gray-400 mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
                            </svg>
                            <span>~30 seconds</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Agent sends USDC payment. No account signup required
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono mb-2">
                            <div className="text-white">Transfer <span className="text-white">0.01 USDC</span></div>
                            <div className="text-cyan mt-1">To: <span className="text-gray-400">0x742d...7b7b7</span></div>
                            <div className="text-cyan">Chain: <span className="text-white">Base</span></div>
                        </div>
                        <div className="text-xs text-gray-500">
                            Base: ~30s | Ethereum: ~3min | Solana: ~13s
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">3. First Query in 60 Seconds</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-cyan/10 border border-cyan/30 rounded text-xs text-cyan mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Live access</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Receive access token. 100 queries, valid 24 hours
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono">
                            <div className="text-gray-500">// Automatic verification</div>
                            <div className="text-cyan mt-1">X-Payment-Token: <span className="text-white">kmy_...</span></div>
                            <div className="text-cyan">Requests: <span className="text-white">100</span></div>
                            <div className="text-cyan">Expires: <span className="text-white">24h</span></div>
                        </div>
                    </div>
                </div>

                <article className="text-center mb-16">
                    <h3 className="text-2xl font-light mb-6">Why Security Intelligence via MCP & x402?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">MCP Integration</div>
                                <div className="text-gray-500 text-sm">Add to Claude Desktop for unlimited security queries</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">x402 Pay-Per-Query</div>
                                <div className="text-gray-500 text-sm">No account needed, pay $0.01 per query with USDC</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Real-Time Security Data</div>
                                <div className="text-gray-500 text-sm">20+ exploit sources, $0.01 per query, 100 queries per $1 USDC</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Multi-chain support</div>
                                <div className="text-gray-500 text-sm">Base, Ethereum, Solana – agent chooses</div>
                            </div>
                        </div>
                    </div>
                </article>

                <article className="bg-black border border-gray-500/25 rounded-lg p-8 max-w-3xl mx-auto">
                    <h3 className="text-2xl font-light mb-4 text-center">For AI Agent Developers</h3>
                    <p className="text-gray-400 text-center mb-6">
                        Integrate KAMIYO security intelligence via MCP or x402
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <div className="text-white mb-2 font-semibold">Option 1: MCP Integration</div>
                            <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500">// Add to Claude Desktop</div>
                                <div className="text-white">claude <span className="text-cyan">mcp</span> <span className="text-cyan">add</span> kamiyo</div>
                                <br/>
                                <div className="text-gray-500">// Unlimited queries</div>
                                <div className="text-white">$19-299/mo</div>
                            </div>
                        </div>
                        <div>
                            <div className="text-white mb-2 font-semibold">Option 2: x402 API</div>
                            <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500">// Install SDK</div>
                                <div className="text-white"><span className="text-cyan">npm</span> <span className="text-cyan">install</span> kamiyo-x402-sdk</div>
                                <br/>
                                <div className="text-gray-500">// Pay per query</div>
                                <div className="text-white">$0.01 per query</div>
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-6">
                        <a
                            href="/api-docs"
                            className="text-magenta hover:opacity-80 transition-opacity"
                            title="View complete API documentation for MCP and x402"
                            aria-label="Navigate to KAMIYO API documentation"
                        >
                            View API Documentation →
                        </a>
                    </div>
                </article>
            </section>

            {/* Social Proof & Features Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="features-heading">
                {/* Trusted By */}
                <div className="text-center mb-16">
                    <h3 className="text-gray-500 text-sm uppercase tracking-wider mb-6">Trusted By</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                        <div className="px-4 py-2 border border-gray-500/25 rounded-full">
                            <span className="text-sm text-gray-400">AI Agent Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500/25 rounded-full">
                            <span className="text-sm text-gray-400">API Providers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500/25 rounded-full">
                            <span className="text-sm text-gray-400">Autonomous System Builders</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500/25 rounded-full">
                            <span className="text-sm text-gray-400">Web3 Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500/25 rounded-full">
                            <span className="text-sm text-gray-400">Blockchain Infrastructure Teams</span>
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Instant API Access</h3>
                        <p className="text-gray-500 text-sm">
                            AI agents discover APIs, pay with USDC on-chain, and get instant access without signup or API keys
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">On-Chain Verification</h3>
                        <p className="text-gray-500 text-sm">
                            Cryptographic payment proof via blockchain transactions eliminates chargebacks and credential leaks
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Developer-Friendly SDK</h3>
                        <p className="text-gray-500 text-sm">
                            JavaScript SDK handles 402 responses and USDC payments automatically - just install and integrate
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <FAQ />

            {/* Hidden SEO Content - Visually hidden but crawlable */}
            <section className="sr-only" aria-hidden="true">
                <h2>Security Intelligence for AI Agents via MCP and x402</h2>
                <article>
                    <h3>MCP Server for Claude Desktop</h3>
                    <p>
                        KAMIYO provides security intelligence for AI agents through MCP (Model Context Protocol) integration.
                        Add KAMIYO to Claude Desktop as an MCP server for unlimited access to real-time exploit data from 20+ sources.
                        MCP subscriptions start at $19/month for personal use, $99/month for teams, and $299/month for enterprises.
                        Perfect for AI agents that need continuous security monitoring without pay-per-query limitations.
                    </p>
                </article>
                <article>
                    <h3>x402 API for Direct Access</h3>
                    <p>
                        For developers who prefer pay-per-query pricing, KAMIYO offers x402 API access at $0.01 per query.
                        The x402 protocol enables autonomous AI agents to access security intelligence without account creation.
                        Pay with USDC on Base, Ethereum, or Solana blockchains. No API keys required, just on-chain payments.
                        Each payment token provides 100 queries valid for 24 hours.
                    </p>
                </article>
                <article>
                    <h3>Real-Time Crypto Exploit Intelligence</h3>
                    <p>
                        KAMIYO aggregates security intelligence from 20+ exploit sources including blockchain security firms,
                        on-chain analytics, and vulnerability databases. With $2.1B stolen in H1 2025, AI agents need real-time
                        exploit data before deploying smart contracts or interacting with DeFi protocols. KAMIYO provides this
                        critical security intelligence through both MCP subscriptions and x402 pay-per-query access.
                    </p>
                </article>
                <article>
                    <h3>Benefits for AI Agent Developers</h3>
                    <p>
                        AI agent security intelligence through MCP and x402 offers flexibility: Choose MCP for unlimited queries
                        with monthly billing, or x402 for pay-per-use at $0.01 per query. Both options provide the same real-time
                        exploit data from 20+ sources. MCP integrates directly into Claude Desktop, while x402 works with any
                        AI framework through our JavaScript SDK. Multi-chain support across Base, Ethereum, and Solana.
                    </p>
                </article>
                <article>
                    <h3>Claude Desktop Integration via MCP</h3>
                    <p>
                        KAMIYO's MCP server enables Claude Desktop users to access security intelligence directly within their
                        AI agent workflows. Simply add the KAMIYO MCP server to Claude Desktop and your AI agents gain unlimited
                        access to exploit data, vulnerability reports, and on-chain security analytics. Perfect for AI agent
                        developers building autonomous security monitoring systems.
                    </p>
                </article>
            </section>
        </div>
        </>
    );
}
