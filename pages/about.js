import SEO from '../components/SEO';

export default function About() {
    return (
        <div className="min-h-screen bg-black text-white">
            <SEO
                title="About x402 Infrastructure - Multi-Chain USDC Payment Verification | KAMIYO"
                description="x402 is an API for verifying USDC payments across blockchains. When a user sends USDC, submit the transaction hash to our API. We check the blockchain and return whether the payment is valid. Works on Solana, Base, Ethereum, Polygon, Arbitrum, Optimism and more."
                canonical="https://kamiyo.ai/about"
            />

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;私たちについて</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">What is KAMIYO</h1>
                    <h4 className="text-xl md:text-2xl mt-4 text-cyan">Multi-Chain Payment Verification</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mb-20">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">Payment Verification Infrastructure</h4>
                        <p className="mb-4 text-gray-400">x402 is an API for verifying USDC payments across blockchains. Developers use it to confirm payments before granting API access.</p>

                        <p className="mb-4 text-gray-400">When a user sends USDC, submit the transaction hash to our API. We check the blockchain and return whether the payment is valid.</p>

                        <p className="mb-4 text-gray-400">Works on Solana, Base, Ethereum, Polygon, Arbitrum, Optimism and more. One API endpoint for all chains. 99.9% uptime, responses under 500ms.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Core Capabilities</h4>
                        <ol className="space-y-3 text-gray-400">
                            <li>
                                <p><strong className="text-white">Transaction Verification:</strong> Check USDC payments on-chain with correct amount and recipient.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Multi-Chain Support:</strong> One API for 8+ blockchains.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Developer SDKs:</strong> Python and JavaScript libraries with TypeScript support.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Risk Scoring:</strong> Fraud detection on Pro and Enterprise plans.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Usage-Based Pricing:</strong> Free tier: 1,000 verifications/month. Paid plans up to unlimited.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">ERC-8004 Support:</strong> AI agents can verify their own payments.</p>
                            </li>
                        </ol>
                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">How It Works</h4>
                        <ul className="space-y-4 text-gray-400">
                            <li>
                                <p><strong className="text-white">User Makes Payment:</strong><br/>Your customer sends USDC to your wallet address on any supported blockchain. They receive a transaction hash from their wallet.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Submit for Verification:</strong><br/>Your API receives the transaction hash. Call x402 to verify the payment.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Instant Confirmation:</strong><br/>We check the blockchain and return results in under 500ms.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Grant Access:</strong><br/>If verified, grant access. If not, reject the request.</p>
                            </li>
                        </ul>
                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Our Mission</h4>
                        <p className="mb-4 text-gray-400">x402 was built to eliminate the complexity of multi-chain payment verification. Every blockchain has different RPC endpoints, transaction formats, and confirmation rules.</p>
                        <p className="text-gray-400">Our infrastructure handles the blockchain complexity. You just make one API call with a transaction hash and get back whether it's valid.</p>
                    </div>
                </div>

            </section>

        </div>
    );
}
