import Head from 'next/head';

export default function About() {
    return (
        <div className="min-h-screen bg-black text-white">
            <Head>
                <title>About KAMIYO - x402 Infrastructure</title>
            </Head>

            <section className="py-10 px-5 mx-auto max-w-[1400px]">
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;私たちについて</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light leading-[1.25]">What is KAMIYO</h1>
                    <h4 className="text-xl md:text-2xl mt-4 text-cyan">Multi-Chain Payment Verification</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 mb-20">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4 font-light">Payment Verification Infrastructure</h4>
                        <p className="mb-4 text-gray-400">x402 Infrastructure is a production-ready API for verifying on-chain USDC payments across multiple blockchains. Developers use our service to confirm that payments have been made before granting access to APIs, data, or services.</p>

                        <p className="mb-4 text-gray-400">Add pay-per-use pricing to any API in 10 minutes. When a user makes a USDC payment on-chain, submit the transaction hash to our API for instant verification. We handle all blockchain complexity - you get a simple yes/no answer with payment details.</p>

                        <p className="mb-4 text-gray-400">Verify payments across Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, and more with a single API endpoint. Production-grade infrastructure with 99.9% uptime SLA and sub-500ms response times.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Core Capabilities</h4>
                        <ol className="space-y-3 text-gray-400">
                            <li>
                                <p><strong className="text-white">Transaction Verification:</strong> Confirm USDC payments happened on-chain with the correct amount and recipient.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Multi-Chain Support:</strong> Single API works across 8+ blockchains - no need to integrate with each network separately.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Developer SDKs:</strong> Python and JavaScript clients with TypeScript support for rapid integration.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Risk Scoring:</strong> Transaction analysis and fraud detection to protect against payment manipulation (Pro+ tiers).</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Usage-Based Pricing:</strong> Free tier with 1,000 verifications/month. Scale up to unlimited with transparent pricing.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">ERC-8004 Ready:</strong> Support for AI agent payment verification enabling autonomous service payments.</p>
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
                                <p><strong className="text-white">Submit for Verification:</strong><br/>Your API receives the transaction hash from the user. You call x402 Infrastructure to verify the payment actually happened.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Instant Confirmation:</strong><br/>We query the blockchain, confirm the payment amount and recipient, check confirmations, and return verification results in under 500ms.</p>
                            </li>
                            <li>
                                <p><strong className="text-white">Grant Access:</strong><br/>If verification succeeds, you grant access to your API/data. If it fails, you reject the request. Simple pay-per-use model.</p>
                            </li>
                        </ul>
                        <h4 className="pt-6 text-xl md:text-2xl mb-4 font-light">Our Mission</h4>
                        <p className="mb-4 text-gray-400">We built x402 Infrastructure to solve a specific problem: verifying crypto micropayments is complex and error-prone. Each blockchain has different RPC endpoints, transaction formats, and confirmation requirements.</p>
                        <p className="text-gray-400">Our service handles all blockchain complexity so developers can add crypto payments to their APIs without managing nodes, parsing transactions, or learning blockchain protocols. One API call, any supported chain, instant verification.</p>
                    </div>
                </div>

            </section>

        </div>
    );
}
