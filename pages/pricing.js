// pages/pricing.js
import Head from "next/head";
import X402PricingTiers from "../components/X402PricingTiers";

export default function PricingPage() {
    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-5 mx-auto text-white bg-black max-w-[1400px]">
            <Head>
                <title>KAMIYO Pricing - x402 Infrastructure</title>
            </Head>

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
