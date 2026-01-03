// pages/index.js
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
                    <h1 className="sr-only leading-[1.25]">KAMIYO: Trust Infrastructure for Autonomous Agents | Escrow & Dispute Resolution</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;自律エージェント信頼基盤</p>
                                <h2 className="text-[2.2rem] md:text-[3.1rem] font-light mb-4 leading-tight text-white">
                                    Trust infrastructure for autonomous agents
                                </h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed">
                                    Escrow-protected payments with on-chain dispute resolution. Multi-oracle consensus settles conflicts automatically.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    On-chain escrow
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    Multi-oracle disputes
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    Quality-based refunds
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    x402 compatible
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="scale-110 md:origin-left md:ml-8">
                                    <PayButton
                                        textOverride="Get Started"
                                        onClickOverride={() => {
                                            window.location.href = '/api-docs';
                                        }}
                                    />
                                </div>
                                <div className="pt-[0.15rem] md:pl-16">
                                    <LinkButton
                                        href="/api-docs"
                                        title="View API Documentation"
                                        aria-label="View Documentation"
                                    >
                                        View docs →
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
                                aria-label="KAMIYO trust infrastructure demonstration"
                                title="KAMIYO escrow and dispute resolution"
                            >
                                <source src="/media/kamiyo_logomark.mp4" type="video/mp4" />
                                Your browser does not support the video tag.
                            </video>
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

            {/* How It Works Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="how-it-works-heading">
                <header className="text-center mb-16">
                    <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-light mb-4">How It Works</h2>
                    <p className="text-gray-400 text-sm md:text-lg">From agreement to settlement in four steps</p>
                </header>

                {/* Timeline with connecting line */}
                <div className="relative mb-16">
                    {/* Connecting line - hidden on mobile */}
                    <div className="hidden md:block absolute top-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" style={{ left: '12.5%', right: '12.5%' }}></div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
                        {/* Step 1 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full border-2 border-cyan bg-black flex items-center justify-center mb-4 relative z-10">
                                <svg className="w-7 h-7 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-light mb-2">Create Agreement</div>
                            <div className="text-gray-500 text-sm">
                                Funds locked in escrow PDA with configurable time-lock
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full border-2 border-cyan bg-black flex items-center justify-center mb-4 relative z-10">
                                <svg className="w-7 h-7 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-light mb-2">Service Delivered</div>
                            <div className="text-gray-500 text-sm">
                                Provider delivers, agent evaluates quality
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full border-2 border-cyan bg-black flex items-center justify-center mb-4 relative z-10">
                                <svg className="w-7 h-7 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-light mb-2">Oracle Consensus</div>
                            <div className="text-gray-500 text-sm">
                                Multi-oracle panel scores quality (0-100)
                            </div>
                        </div>

                        {/* Step 4 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full border-2 border-cyan bg-black flex items-center justify-center mb-4 relative z-10">
                                <svg className="w-7 h-7 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-light mb-2">Auto Settlement</div>
                            <div className="text-gray-500 text-sm">
                                Funds distributed, reputations updated on-chain
                            </div>
                        </div>
                    </div>
                </div>

                {/* Collapsible Quality Scale */}
                <details className="group mb-12">
                    <summary className="flex items-center justify-between cursor-pointer bg-black border border-gray-500/25 rounded-lg p-4 hover:border-gray-500/50 transition-colors">
                        <span className="text-gray-400 text-sm">View quality-based refund scale</span>
                        <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <div className="mt-4 grid grid-cols-4 gap-px bg-gray-800 rounded-lg overflow-hidden">
                        <div className="bg-black p-4 text-center">
                            <div className="text-xl font-light text-white mb-1">80-100%</div>
                            <div className="text-cyan text-xs mb-1">Quality</div>
                            <div className="text-gray-500 text-xs">100% to provider</div>
                        </div>
                        <div className="bg-black p-4 text-center">
                            <div className="text-xl font-light text-white mb-1">65-79%</div>
                            <div className="text-cyan text-xs mb-1">Quality</div>
                            <div className="text-gray-500 text-xs">35% refund</div>
                        </div>
                        <div className="bg-black p-4 text-center">
                            <div className="text-xl font-light text-white mb-1">50-64%</div>
                            <div className="text-cyan text-xs mb-1">Quality</div>
                            <div className="text-gray-500 text-xs">75% refund</div>
                        </div>
                        <div className="bg-black p-4 text-center">
                            <div className="text-xl font-light text-white mb-1">0-49%</div>
                            <div className="text-cyan text-xs mb-1">Quality</div>
                            <div className="text-gray-500 text-xs">100% refund</div>
                        </div>
                    </div>
                </details>

                {/* Core Features - more compact */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="text-cyan text-xs uppercase tracking-wider mb-2">Identity</div>
                        <div className="text-white text-lg font-light mb-2">Stake-Backed Agents</div>
                        <div className="text-gray-500 text-sm">
                            PDA-based identities with SOL collateral. On-chain reputation scoring.
                        </div>
                    </div>

                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="text-cyan text-xs uppercase tracking-wider mb-2">Resolution</div>
                        <div className="text-white text-lg font-light mb-2">Quality-Based Arbitration</div>
                        <div className="text-gray-500 text-sm">
                            Sliding refund scale based on oracle-determined quality scores.
                        </div>
                    </div>

                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="text-cyan text-xs uppercase tracking-wider mb-2">Consensus</div>
                        <div className="text-white text-lg font-light mb-2">Multi-Oracle Verification</div>
                        <div className="text-gray-500 text-sm">
                            Decentralized dispute resolution. Median-based, anti-collusion.
                        </div>
                    </div>
                </div>
            </section>

            {/* SDK Integration Section */}
            <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                <h2 className="text-3xl md:text-4xl font-light text-center mb-4">
                    SDK Integration
                </h2>
                <p className="text-gray-400 text-center mb-12">Three lines to protect your first transaction</p>

                {/* Single unified code block */}
                <div className="max-w-3xl mx-auto mb-12">
                    <div className="rounded-lg overflow-hidden border border-gray-500/25">
                        {/* Code block header */}
                        <div className="bg-gray-900/50 px-4 py-2 flex items-center justify-between border-b border-gray-500/25">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">typescript</span>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`import { KAMIYOClient } from '@kamiyo/sdk'

const client = new KAMIYOClient({ connection, wallet })

// 1. Create agent identity with stake
await client.createAgent({
  name: 'MyAgent',
  stakeAmount: 500_000_000
})

// 2. Lock funds in escrow
const agreement = await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,
  timeLockSeconds: 86400
})

// 3. Release on success, or dispute
await client.releaseFunds(agreement.id)
// or: await client.markDisputed(agreement.id)`);
                                }}
                                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy
                            </button>
                        </div>
                        {/* Code content */}
                        <div className="bg-black p-6 font-mono text-sm overflow-x-auto">
                            <div className="text-white"><span className="text-cyan">import</span> {'{'} KAMIYOClient {'}'} <span className="text-cyan">from</span> <span className="text-gray-400">'@kamiyo/sdk'</span></div>
                            <div className="text-white mb-4"></div>
                            <div className="text-white"><span className="text-cyan">const</span> client = <span className="text-cyan">new</span> KAMIYOClient({'{'} connection, wallet {'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 1. Create agent identity with stake</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.createAgent({'{'}</div>
                            <div className="ml-4 text-white">name: <span className="text-gray-400">'MyAgent'</span>,</div>
                            <div className="ml-4 text-white">stakeAmount: <span className="text-magenta">500_000_000</span></div>
                            <div className="text-white">{'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 2. Lock funds in escrow</div>
                            <div className="text-white"><span className="text-cyan">const</span> agreement = <span className="text-cyan">await</span> client.createAgreement({'{'}</div>
                            <div className="ml-4 text-white">provider: <span className="text-gray-400">providerPubkey</span>,</div>
                            <div className="ml-4 text-white">amount: <span className="text-magenta">100_000_000</span>,</div>
                            <div className="ml-4 text-white">timeLockSeconds: <span className="text-magenta">86400</span></div>
                            <div className="text-white">{'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 3. Release on success, or dispute</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.releaseFunds(agreement.id)</div>
                            <div className="text-gray-500">// or: await client.markDisputed(agreement.id)</div>
                        </div>
                    </div>
                </div>

                {/* SDK Packages */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/sdk</div>
                        <div className="text-gray-500 text-xs">Core client</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/agent-client</div>
                        <div className="text-gray-500 text-xs">Auto-dispute</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/middleware</div>
                        <div className="text-gray-500 text-xs">HTTP 402</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/mcp</div>
                        <div className="text-gray-500 text-xs">Claude/LLMs</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/langchain</div>
                        <div className="text-gray-500 text-xs">LangChain</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/x402-client</div>
                        <div className="text-gray-500 text-xs">x402 escrow</div>
                    </div>
                </div>
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
                                src="/media/monad.png"
                                alt="Monad"
                                className="h-6 w-auto"
                            />
                        </div>
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
