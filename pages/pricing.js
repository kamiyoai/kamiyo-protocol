// pages/pricing.js
import SEO from "../components/SEO";
import X402PricingTiers from "../components/X402PricingTiers";

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
        </div>
    );
}
