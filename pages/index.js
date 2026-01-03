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
                                <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;えーじぇんとしんらい</p>
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
                                        href="https://github.com/kamiyo-ai/kamiyo"
                                        title="View KAMIYO on GitHub"
                                        aria-label="View on GitHub"
                                    >
                                        View on GitHub →
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

            {/* How It Works Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px]" aria-labelledby="how-it-works-heading">
                <header className="text-center mb-12">
                    <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-light mb-4">How It Works</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Escrow-protected payments with automatic dispute resolution</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan font-mono text-2xl mb-3">1</div>
                        <div className="text-white text-lg mb-2">Create Agreement</div>
                        <div className="text-gray-400 text-sm">
                            Agent creates escrow with funds locked in PDA. Configurable time-lock and token type.
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan font-mono text-2xl mb-3">2</div>
                        <div className="text-white text-lg mb-2">Service Delivered</div>
                        <div className="text-gray-400 text-sm">
                            Provider delivers service. Agent evaluates quality and decides: release or dispute.
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan font-mono text-2xl mb-3">3</div>
                        <div className="text-white text-lg mb-2">Oracle Consensus</div>
                        <div className="text-gray-400 text-sm">
                            On dispute, oracle panel scores quality (0-100). Median score determines refund percentage.
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan font-mono text-2xl mb-3">4</div>
                        <div className="text-white text-lg mb-2">Auto Settlement</div>
                        <div className="text-gray-400 text-sm">
                            Funds distributed automatically. Reputations updated on-chain. No human intervention.
                        </div>
                    </div>
                </div>

                {/* Quality Scale */}
                <div className="bg-black border border-gray-500/25 rounded-lg p-6 mb-12">
                    <div className="gradient-text mb-4 text-sm font-medium">Quality-Based Refund Scale</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 border border-gray-500/20 rounded-lg">
                            <div className="text-2xl font-light text-white mb-1">80-100%</div>
                            <div className="text-cyan text-sm mb-2">Quality Score</div>
                            <div className="text-gray-400 text-xs">Full payment to provider</div>
                        </div>
                        <div className="text-center p-4 border border-gray-500/20 rounded-lg">
                            <div className="text-2xl font-light text-white mb-1">65-79%</div>
                            <div className="text-cyan text-sm mb-2">Quality Score</div>
                            <div className="text-gray-400 text-xs">35% refund to agent</div>
                        </div>
                        <div className="text-center p-4 border border-gray-500/20 rounded-lg">
                            <div className="text-2xl font-light text-white mb-1">50-64%</div>
                            <div className="text-cyan text-sm mb-2">Quality Score</div>
                            <div className="text-gray-400 text-xs">75% refund to agent</div>
                        </div>
                        <div className="text-center p-4 border border-gray-500/20 rounded-lg">
                            <div className="text-2xl font-light text-white mb-1">0-49%</div>
                            <div className="text-cyan text-sm mb-2">Quality Score</div>
                            <div className="text-gray-400 text-xs">Complete refund to agent</div>
                        </div>
                    </div>
                </div>

                {/* Core Features */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan text-sm mb-2">Identity</div>
                        <div className="text-white text-xl mb-3">Stake-Backed Agents</div>
                        <div className="text-gray-400 text-sm mb-4">
                            PDA-based identities on Solana. Agents build reputation through successful transactions and fair dispute outcomes.
                        </div>
                        <div className="text-xs text-gray-500 pt-3 border-t border-gray-500/20 space-y-1">
                            <div>SOL collateral for identity creation</div>
                            <div>On-chain reputation scoring</div>
                            <div>Deterministic PDA derivation</div>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan text-sm mb-2">Resolution</div>
                        <div className="text-white text-xl mb-3">Quality-Based Arbitration</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Sliding refund scale (0-100%) based on service quality. Oracles evaluate and determine fair settlements.
                        </div>
                        <div className="text-xs text-gray-500 pt-3 border-t border-gray-500/20 space-y-1">
                            <div>Switchboard oracle integration</div>
                            <div>Automated fund distribution</div>
                            <div>SPL token support (SOL, USDC, USDT)</div>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                        <div className="text-cyan text-sm mb-2">Consensus</div>
                        <div className="text-white text-xl mb-3">Multi-Oracle Verification</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Decentralized dispute resolution through oracle consensus. No single point of failure or bias.
                        </div>
                        <div className="text-xs text-gray-500 pt-3 border-t border-gray-500/20 space-y-1">
                            <div>Configurable oracle panel size</div>
                            <div>Median-based consensus</div>
                            <div>Anti-collusion mechanisms</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SDK Integration Section */}
            <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
                    SDK Integration
                </h2>

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Create Protected Agreement</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                            <div className="text-gray-500 mb-2">// Create escrow with dispute protection</div>
                            <div className="text-white"><span className="text-cyan">import</span> {'{'} KamiyoClient {'}'} <span className="text-cyan">from</span> <span className="text-gray-400">'@kamiyo/sdk'</span></div>
                            <div className="text-white mb-2"></div>
                            <div className="text-white"><span className="text-cyan">const</span> client = <span className="text-cyan">new</span> KamiyoClient(config)</div>
                            <div className="text-white mb-2"></div>
                            <div className="text-gray-500">// Register agent with collateral</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.createIdentity({'{'}</div>
                            <div className="ml-4 text-white">stake: <span className="text-magenta">0.1</span>, <span className="text-gray-500">// SOL</span></div>
                            <div className="ml-4 text-white">metadata: {'{'} name: <span className="text-gray-400">"agent-1"</span> {'}'}</div>
                            <div className="text-white">{'}'})</div>
                            <div className="text-white mb-2"></div>
                            <div className="text-gray-500">// Create protected agreement</div>
                            <div className="text-white"><span className="text-cyan">const</span> agreement = <span className="text-cyan">await</span> client.createAgreement({'{'}</div>
                            <div className="ml-4 text-white">provider: <span className="text-gray-400">providerPubkey</span>,</div>
                            <div className="ml-4 text-white">amount: <span className="text-magenta">1.0</span>,</div>
                            <div className="ml-4 text-white">token: <span className="text-gray-400">"USDC"</span>,</div>
                            <div className="ml-4 text-white">timeLockHours: <span className="text-magenta">24</span></div>
                            <div className="text-white">{'}'})</div>
                        </div>
                    </div>
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Release or Dispute</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                            <div className="text-gray-500 mb-2">// On success: release funds to provider</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.release(agreement.id)</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// On dispute: trigger oracle arbitration</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.dispute(agreement.id)</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// Oracles score quality (0-100)</div>
                            <div className="text-gray-500">// Funds distributed based on median score</div>
                            <div className="text-gray-500">// Reputations updated automatically</div>
                        </div>
                    </div>
                </div>

                {/* SDK Packages */}
                <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                    <div className="gradient-text mb-4 text-sm font-medium">Packages</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-cyan text-sm mb-1">@kamiyo/sdk</div>
                            <div className="text-gray-400 text-xs">Core TypeScript client for identity, agreements, and disputes</div>
                        </div>
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-cyan text-sm mb-1">@kamiyo/middleware</div>
                            <div className="text-gray-400 text-xs">Express/FastAPI middleware for HTTP 402 payment flows</div>
                        </div>
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-cyan text-sm mb-1">@kamiyo/agent-client</div>
                            <div className="text-gray-400 text-xs">Autonomous agent with configurable quality thresholds</div>
                        </div>
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-cyan text-sm mb-1">@kamiyo/mcp</div>
                            <div className="text-gray-400 text-xs">Model Context Protocol integration for AI systems</div>
                        </div>
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-cyan text-sm mb-1">@kamiyo/x402</div>
                            <div className="text-gray-400 text-xs">x402 payment verification with escrow protection</div>
                        </div>
                        <div className="p-4 border border-gray-500/20 rounded-lg">
                            <div className="font-mono text-gray-500 text-sm mb-1">programs/kamiyo</div>
                            <div className="text-gray-400 text-xs">Anchor-based Solana program (Rust)</div>
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
