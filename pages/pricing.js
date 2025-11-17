// pages/pricing.js
import SEO from "../components/SEO";
import X402PricingTiers from "../components/X402PricingTiers";
import { MinusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export default function PricingPage() {
    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-5 mx-auto text-white bg-black max-w-[1400px]">
            <SEO
                title="Pricing - x402 Multi-Chain Payment Verification API | KAMIYO"
                description="x402 pricing: Free tier with 1,000 verifications/month. Starter $99/mo for 50K verifications. Pro $299/mo for 500K verifications. Enterprise $999/mo for unlimited verifications. All plans include Python and JavaScript SDKs."
                canonical="https://kamiyo.ai/pricing"
            />

            {/* x402 Infrastructure Pricing */}
            <div className="w-full mb-16">
                <div className="w-full flex flex-col items-start border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-left text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;料金プラン</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-left leading-[1.25]">x402 Infrastructure Pricing</h1>
                    <h4 className="text-xl md:text-2xl mt-4 text-cyan">Multi-Chain Payment Verification</h4>
                </div>
                <p className="text-gray-400 text-sm mb-12 text-left max-w-2xl">
                    Add crypto micropayments to any API in 10 minutes. Production-ready payment verification across Solana, Base, Ethereum and more.
                </p>
                <X402PricingTiers showTitle={false} />
            </div>

            {/* Feature Comparison Table */}
            <div className="mt-16 w-full">
                <h4 className="text-2xl mb-6 font-light">Feature Comparison</h4>
                <div className="overflow-x-auto border border-gray-500 border-opacity-25 rounded-lg">
                    <table className="w-full text-left">
                        <thead>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <th className="p-4 text-white">Features</th>
                            <th className="p-4 text-white">Free</th>
                            <th className="p-4 text-white">Starter</th>
                            <th className="p-4 text-white">Pro</th>
                            <th className="p-4 text-white">Enterprise</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Verifications per Month</td>
                            <td className="p-4 text-gray-400">1,000</td>
                            <td className="p-4 text-gray-400">50,000</td>
                            <td className="p-4 text-gray-400">500,000</td>
                            <td className="p-4 text-gray-400">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Supported Blockchains</td>
                            <td className="p-4 text-gray-400">Solana, Base</td>
                            <td className="p-4 text-gray-400">Solana, Base, Ethereum</td>
                            <td className="p-4 text-gray-400">6 chains</td>
                            <td className="p-4 text-gray-400">All chains</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Transaction History</td>
                            <td className="p-4 text-gray-400">7 days</td>
                            <td className="p-4 text-gray-400">30 days</td>
                            <td className="p-4 text-gray-400">90 days</td>
                            <td className="p-4 text-gray-400">Unlimited</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Response Time SLA</td>
                            <td className="p-4 text-gray-400">Best effort</td>
                            <td className="p-4 text-gray-400">&lt;500ms</td>
                            <td className="p-4 text-gray-400">&lt;500ms</td>
                            <td className="p-4 text-gray-400">&lt;300ms</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Uptime SLA</td>
                            <td className="p-4 text-gray-400">Best effort</td>
                            <td className="p-4 text-gray-400">99.9%</td>
                            <td className="p-4 text-gray-400">99.95%</td>
                            <td className="p-4 text-gray-400">99.99%</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Risk Scoring</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Webhook Integration</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Python & JavaScript SDKs</td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">ERC-8004 Support</td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Support</td>
                            <td className="p-4 text-gray-400 text-xs">Community</td>
                            <td className="p-4 text-gray-400 text-xs">Email (48h)</td>
                            <td className="p-4 text-gray-400 text-xs">Priority (24h)</td>
                            <td className="p-4 text-gray-400 text-xs">24/7 Dedicated</td>
                        </tr>
                        <tr className="border-b border-gray-500 border-opacity-25">
                            <td className="p-4 font-light text-sm">Custom Integration</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        <tr>
                            <td className="p-4 font-light text-sm">On-Premise Deployment</td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><MinusIcon className="h-5 w-5 text-gray-500"/></td>
                            <td className="p-4"><CheckCircleIcon className="h-5 w-5 text-cyan"/></td>
                        </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
