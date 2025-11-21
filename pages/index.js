// pages/index.js
import Link from "next/link";
import StatsCard from "../components/dashboard/StatsCard";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import X402PricingTiers from "../components/X402PricingTiers";
import SEO from "../components/SEO";
import { LinkButton } from "../components/Button";

export default function Home() {

    return (
        <>
            <SEO />
            <div className="text-white bg-black min-h-screen">
                {/* Hero Section */}
                <section className="w-full border-b border-gray-500/25 bg-black">
                <div className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 max-w-[1400px]">
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only leading-[1.25]">KAMIYO: Multi-Chain Crypto Payment Verification API | x402 Infrastructure</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;x402決済基盤</p>
                                <h2 className="text-[2.2rem] md:text-[3.1rem] font-light mb-4 leading-tight text-white">
                                    Stop building payment infrastructure.<br />Start shipping features.
                                </h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed">
                                    Multi-chain payment verification in one line of code. No infrastructure. No parsing. No authentication.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    1,000 free verifications/month
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    12 blockchains supported
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    10-minute integration
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    99.9% uptime SLA
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="scale-110 md:origin-left md:ml-8">
                                    <PayButton
                                        textOverride="Get Started Free"
                                        onClickOverride={() => {
                                            window.location.href = '/x402';
                                        }}
                                    />
                                </div>
                                <div className="pt-[0.15rem] md:pl-16">
                                    <LinkButton
                                        href="/api-docs"
                                        title="View API documentation for x402 Infrastructure"
                                        aria-label="View API documentation"
                                    >
                                        View Documentation →
                                    </LinkButton>
                                </div>
                            </div>

                        </article>

                        {/* Right column: Video (hidden on mobile) */}
                        <div className="hidden md:flex justify-center md:justify-end">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                preload="metadata"
                                className="w-auto h-96 saturate-[2.0] contrast-[1.2]"
                                aria-label="x402 Infrastructure payment verification demonstration"
                                title="x402 Infrastructure multi-chain payment verification"
                            >
                                <source src="/media/kamiyo_logomark.mp4" type="video/mp4" />
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Grid */}
            <section className="w-full px-5 mx-auto pt-8 pb-8 max-w-[1400px]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatsCard
                        label="Supported Chains"
                        value="8+"
                        loading={false}
                    />
                    <StatsCard
                        label="Avg Response Time"
                        value="<500ms"
                        loading={false}
                    />
                    <StatsCard
                        label="API Uptime"
                        value="99.9%"
                        loading={false}
                    />
                    <StatsCard
                        label="Verifications/Month"
                        value="10M+"
                        loading={false}
                    />
                    <StatsCard
                        label="Starting Price"
                        value="$99"
                        loading={false}
                    />
                    <StatsCard
                        label="Free Tier"
                        value="1,000/mo"
                        loading={false}
                    />
                </div>
            </section>

            {/* How It Works Section */}
            <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
                    How It Works
                </h2>

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Setup</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                            <div className="text-white text-lg mb-3">Add to any API in <span className="text-cyan">10 minutes</span></div>
                            <div className="text-gray-400 text-sm mb-4 space-y-1">
                                <div><strong className="text-cyan">Step 1:</strong> User sends USDC to your wallet</div>
                                <div><strong className="text-cyan">Step 2:</strong> Submit tx hash to x402 API</div>
                                <div><strong className="text-cyan">Step 3:</strong> Get instant verification result</div>
                                <div><strong className="text-cyan">Step 4:</strong> Grant or deny access</div>
                            </div>
                            <div className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-500/20">
                                <strong className="text-cyan">Chains:</strong> Solana, Base, Ethereum, Polygon, Arbitrum, Optimism
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Example</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                            <div className="text-gray-500 mb-2"># No API key needed for agents</div>
                            <div className="text-white"><span className="text-cyan">from</span> x402 <span className="text-cyan">import</span> X402Client</div>
                            <div className="text-white mb-2"></div>
                            <div className="text-white">client = X402Client()</div>
                            <div className="text-white mb-2"></div>
                            <div className="text-white">result = client.verify_payment(</div>
                            <div className="ml-4 text-white">tx_hash=<span className="text-gray-400">"..."</span>,</div>
                            <div className="ml-4 text-white">chain=<span className="text-gray-400">"solana"</span>,</div>
                            <div className="ml-4 text-white">expected_amount=<span className="text-magenta">10.00</span></div>
                            <div className="text-white">)</div>
                            <div className="text-white mb-2"></div>
                            <div className="text-white"><span className="text-cyan">if</span> result.verified:</div>
                            <div className="ml-4 text-white"><span className="text-gray-500"># Grant access</span></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                <h2 className="text-3xl md:text-4xl font-light text-center mb-4">
                    Pricing
                </h2>
                <p className="text-center text-gray-400 mb-12">
                    Start free, scale as you grow
                </p>

                <X402PricingTiers showTitle={false} />
            </section>

            {/* Built for Developers Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="developers-heading">
                <header className="text-center mb-12">
                    <h2 id="developers-heading" className="text-3xl md:text-4xl font-light mb-4">Built for Developers</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Add crypto payments to your API in 3 steps</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">1. User Sends Payment</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-gray-500/10 border border-gray-500/30 rounded text-xs text-gray-400 mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
                            </svg>
                            <span>~30 seconds</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Customer sends USDC to your wallet on any supported chain
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono mb-3">
                            <div className="text-white">Transfer <span className="text-white">10.00 USDC</span></div>
                            <div className="text-cyan mt-1">To: <span className="text-gray-400">your_wallet_address</span></div>
                            <div className="text-cyan">Chain: <span className="text-white">Solana</span></div>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">2. Submit Transaction Hash</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-gray-500/10 border border-gray-500/30 rounded text-xs text-gray-400 mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
                            </svg>
                            <span>&lt;500ms</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Call x402 API to verify the payment happened on-chain. No API key needed.
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono mb-2">
                            <div className="text-gray-500">$ <span className="text-cyan">curl</span> -X POST api.kamiyo.ai/v1/x402/verify</div>
                            <div className="text-white mt-2">-H <span className="text-gray-400">"Content-Type: application/json"</span></div>
                            <div className="text-white">-d <span className="text-gray-400">'{`{`}"tx_hash":"..."{`}`}'</span></div>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                        <div className="text-white text-xl mb-2">3. Grant Access</div>
                        <div className="inline-flex items-center gap-2 px-2 py-1 bg-cyan/10 border border-cyan/30 rounded text-xs text-cyan mb-3">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Instant verification</span>
                        </div>
                        <div className="text-gray-400 text-sm mb-4">
                            Payment verified. Grant API access to your customer
                        </div>
                        <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono">
                            <div className="text-gray-500">// Verification response</div>
                            <div className="text-cyan mt-1">verified: <span className="text-white">true</span></div>
                            <div className="text-cyan">amount: <span className="text-white">10.00</span></div>
                            <div className="text-cyan">currency: <span className="text-white">"USDC"</span></div>
                        </div>
                    </div>
                </div>

                <article className="text-center mb-16">
                    <h3 className="text-2xl font-light mb-6">Why Developers Choose KAMIYO</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Skip the Blockchain Learning Curve</div>
                                <div className="text-gray-500 text-sm">We handle RPC endpoints, transaction parsing, and confirmations across all chains</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">One API, Every Chain</div>
                                <div className="text-gray-500 text-sm">Solana, Base, Ethereum, Polygon, Avalanche, and 7 more chains with a single integration</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Production-Grade from Day One</div>
                                <div className="text-gray-500 text-sm">99.9% uptime SLA, sub-500ms responses, automatic RPC failover</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-white flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Built for AI Agents</div>
                                <div className="text-gray-500 text-sm">ERC-8004 compatible for autonomous payments, pay-per-use pricing</div>
                            </div>
                        </div>
                    </div>
                </article>

                <article className="bg-black border border-gray-500/25 rounded-lg p-8 max-w-3xl mx-auto">
                    <h3 className="text-2xl font-light mb-4 text-center">Developer-Friendly SDKs</h3>
                    <p className="text-gray-400 text-center mb-6">
                        Official Python and JavaScript SDKs. TypeScript definitions included. 5-minute quick start.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <div className="text-white mb-2 font-semibold">Python SDK</div>
                            <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500"># Install SDK</div>
                                <div className="text-white"><span className="text-cyan">pip</span> install x402</div>
                                <br/>
                                <div className="text-gray-500"># Verify payment</div>
                                <div className="text-white">result = client.verify_payment(</div>
                                <div className="text-white ml-2">tx_hash=<span className="text-gray-400">"..."</span>,</div>
                                <div className="text-white ml-2">chain=<span className="text-gray-400">"solana"</span></div>
                                <div className="text-white">)</div>
                            </div>
                        </div>
                        <div>
                            <div className="text-white mb-2 font-semibold">JavaScript SDK</div>
                            <div className="bg-black border border-gray-500/20 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500">// Install SDK</div>
                                <div className="text-white"><span className="text-cyan">npm</span> install @x402/sdk</div>
                                <br/>
                                <div className="text-gray-500">// Verify payment</div>
                                <div className="text-white">const result = await client</div>
                                <div className="text-white ml-2">.verifyPayment({'{'}txHash: <span className="text-gray-400">"..."</span>{'}'})</div>
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-6">
                        <LinkButton
                            href="/api-docs"
                            title="View complete API documentation for x402 Infrastructure"
                            aria-label="Navigate to x402 API documentation"
                        >
                            View API Documentation →
                        </LinkButton>
                    </div>
                </article>
            </section>

            {/* Building For Section */}
            <section className="w-full border-t border-gray-500/25 py-16">
                <div className="w-full px-5 mx-auto max-w-[1400px]">
                    <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
                        Building for
                    </h2>
                    <div className="flex flex-wrap items-center justify-center gap-12 md:gap-16 lg:gap-20">
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/payai.svg"
                                alt="PayAI"
                                className="h-32 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/hyperliquid.svg"
                                alt="Hyperliquid"
                                className="h-8 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/daydreams.png"
                                alt="Daydreams"
                                className="h-12 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/solana.svg"
                                alt="Solana"
                                style={{ height: '1.65rem' }}
                                className="w-auto"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="w-full border-t border-gray-500/25 py-16">
                <div className="w-full px-5 mx-auto max-w-[1200px]">
                    <FAQ />
                </div>
            </section>
        </div>
        </>
    );
}
