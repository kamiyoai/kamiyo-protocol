// pages/index.js
import Link from "next/link";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import X402PricingTiers from "../components/X402PricingTiers";
import SEO from "../components/SEO";
import { LinkButton } from "../components/Button";
import GlitchLabel from "../components/GlitchLabel";

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
                                <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">— &nbsp;エージェント決済レール</p>
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
                                    8 blockchains supported
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
                            Call x402 API to verify the payment happened on-chain. No API key required.
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
                                <div className="text-gray-500 text-sm">Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, and BSC with a single integration</div>
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
                                <div className="text-white"><span className="text-cyan">pip</span> install x402-python</div>
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
                                <strong className="text-cyan">Chains:</strong> Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BSC
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="gradient-text mb-2 text-sm font-medium">Example</div>
                        <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                            <div className="text-gray-500 mb-2"># No API key required</div>
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

            {/* Mitama Section */}
            <section className="w-full border-t border-gray-500/25 py-16">
                <div className="w-full px-5 mx-auto max-w-[1400px]">
                    <header className="text-center mb-12">
                        <p className="font-light text-sm tracking-widest mb-2">ミタマプロトコル <span className="gradient-text">MITAMA</span></p>
                        <div className="mb-4"><GlitchLabel text="testing" /></div>
                        <h2 className="text-3xl md:text-4xl font-light mb-4">Agent Identity & Conflict Resolution</h2>
                        <p className="text-gray-400 text-sm md:text-lg max-w-2xl mx-auto">
                            On-chain identity and trustless dispute arbitration for autonomous agents. When payments go wrong, Mitama resolves conflicts through multi-oracle consensus.
                        </p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                        <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-sm mb-2">Identity</div>
                            <div className="text-white text-xl mb-3">PDA-Based Agent Identities</div>
                            <div className="text-gray-400 text-sm">
                                Stake-backed accountability on Solana. Agents build reputation through successful transactions and fair dispute outcomes.
                            </div>
                        </div>

                        <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-sm mb-2">Resolution</div>
                            <div className="text-white text-xl mb-3">Quality-Based Arbitration</div>
                            <div className="text-gray-400 text-sm">
                                Sliding refund scale (0-100%) based on service quality assessment. Oracles evaluate disputes and determine fair settlements.
                            </div>
                        </div>

                        <div className="bg-black border border-gray-500/25 rounded-lg p-6">
                            <div className="text-cyan text-sm mb-2">Consensus</div>
                            <div className="text-white text-xl mb-3">Multi-Oracle Verification</div>
                            <div className="text-gray-400 text-sm">
                                Decentralized dispute resolution through oracle consensus. No single point of failure or bias in conflict outcomes.
                            </div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 mb-12">
                        <div>
                            <div className="gradient-text mb-2 text-sm font-medium">Conflict Resolution Flow</div>
                            <div className="bg-black border border-gray-500/20 rounded-lg p-6">
                                <div className="space-y-3 text-sm">
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan font-mono">1</span>
                                        <div>
                                            <div className="text-white">Agent creates agreement</div>
                                            <div className="text-gray-500">Funds locked in escrow PDA</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan font-mono">2</span>
                                        <div>
                                            <div className="text-white">Provider delivers service</div>
                                            <div className="text-gray-500">Or agent marks as disputed</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan font-mono">3</span>
                                        <div>
                                            <div className="text-white">Oracle panel scores quality</div>
                                            <div className="text-gray-500">Consensus determines refund %</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan font-mono">4</span>
                                        <div>
                                            <div className="text-white">Funds distributed</div>
                                            <div className="text-gray-500">Reputations updated on-chain</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="gradient-text mb-2 text-sm font-medium">Integration</div>
                            <div className="bg-black border border-gray-500/20 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                                <div className="text-gray-500 mb-2">// Create protected agreement</div>
                                <div className="text-white"><span className="text-cyan">import</span> {'{'} MitamaClient {'}'} <span className="text-cyan">from</span> <span className="text-gray-400">'@mitama/sdk'</span></div>
                                <div className="text-white mb-2"></div>
                                <div className="text-white"><span className="text-cyan">const</span> client = <span className="text-cyan">new</span> MitamaClient(config)</div>
                                <div className="text-white mb-2"></div>
                                <div className="text-gray-500">// Lock funds with time-lock</div>
                                <div className="text-white"><span className="text-cyan">await</span> client.createAgreement({'{'}</div>
                                <div className="ml-4 text-white">provider: <span className="text-gray-400">providerPubkey</span>,</div>
                                <div className="ml-4 text-white">amount: <span className="text-magenta">1.0</span>, <span className="text-gray-500">// SOL</span></div>
                                <div className="ml-4 text-white">timeLockHours: <span className="text-magenta">24</span></div>
                                <div className="text-white">{'}'})</div>
                                <div className="text-white mb-2"></div>
                                <div className="text-gray-500">// Dispute if quality is poor</div>
                                <div className="text-white"><span className="text-cyan">await</span> client.dispute(txId)</div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <a
                            href="https://github.com/kamiyo-ai/mitama"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                            View on GitHub →
                        </a>
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
