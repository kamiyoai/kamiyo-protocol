import Head from 'next/head';

export default function Features() {
    return (
        <div className="min-h-screen bg-black text-white">
            <Head>
                <title>Features - KAMIYO x402 Infrastructure</title>
                <meta name="description" content="x402 features: multi-chain payment verification for Solana, Base, Ethereum and more." />
            </Head>

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;機能</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">x402 Infrastructure Features</h1>
                    <p className="text-gray-400 mt-4 text-xl">Multi-chain USDC payment verification for your APIs</p>
                </div>

                {/* x402 Infrastructure Features */}
                <div className="mb-20 pb-20">
                    <div className="border-dotted border-b border-gray-500/25 mb-8 pb-4">
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">X402 INFRASTRUCTURE</p>
                        <h2 className="text-3xl md:text-4xl font-light">Multi-Chain Payment Verification</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mb-12">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4 font-light">Universal USDC Verification</h3>
                            <p className="mb-4 text-gray-400">Verify USDC payments across 8+ blockchain networks with a single API call. Support for Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, and more.</p>
                            <p className="mb-4 text-gray-400">99.9% uptime, responses under 500ms.</p>
                            <p className="text-sm text-gray-400">Available: All tiers from Free onwards</p>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4 font-light">Simple Integration</h3>
                            <p className="mb-4 text-gray-400">Add payment verification to your API in 10 minutes.</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Python SDK:</strong> pip install x402</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">JavaScript SDK:</strong> npm install @x402/sdk</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">REST API:</strong> Direct HTTP integration</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-400">TypeScript support included</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                        <div>
                            <h3 className="text-xl md:text-2xl mb-4 font-light">Flexible Pricing Tiers</h3>
                            <p className="mb-4 text-gray-400">Start with 1,000 free verifications per month. Scale up as your usage grows:</p>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Free:</strong> 1,000 verifications/mo, 2 chains</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Starter ($99/mo):</strong> 50,000 verifications/mo, 3 chains</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Pro ($299/mo):</strong> 500,000 verifications/mo, 6 chains</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Enterprise ($999/mo):</strong> Unlimited verifications, all chains</span>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-xl md:text-2xl mb-4 font-light">Advanced Features</h3>
                            <ul className="space-y-2 mb-4 text-sm">
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Risk Scoring:</strong> Fraud detection and transaction analysis (Pro+)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Usage Analytics:</strong> Dashboard with real-time usage tracking</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">ERC-8004 Support:</strong> AI agent payment standard compliance</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <svg className="w-3 h-3 text-cyan mt-1 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-400"><strong className="text-white">Custom Integration:</strong> Dedicated support for Enterprise customers</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

            </section>

        </div>
    );
}
