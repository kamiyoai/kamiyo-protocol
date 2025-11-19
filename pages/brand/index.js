// pages/brand/index.js
import SEO from '../../components/SEO';
import BrandLayout from '../../components/brand/BrandLayout';
import PayButton from '../../components/PayButton';

export default function BrandPage() {
    return (
        <>
            <SEO
                title="Brand Guidelines - KAMIYO"
                description="Official brand guidelines for KAMIYO, including logos, colors, typography, and UI components for the x402 payment infrastructure."
            />

            <BrandLayout>
                {/* Hero Section */}
                <header className="mb-16">
                    <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">
                        — &nbsp;ブランドスタイルガイド
                    </p>
                    <h1 className="text-4xl md:text-5xl font-light mb-6 leading-tight text-white">
                        KAMIYO Brand Guidelines
                    </h1>
                    <div className="space-y-4 text-gray-400 text-base leading-relaxed mb-8">
                        <p>
                            KAMIYO began as infrastructure to protect against crypto exploits and has evolved
                            into the payment verification layer for the onchain economy.
                        </p>
                        <p>
                            These guidelines serve as a foundation, not restrictions. We built KAMIYO for
                            developers who value technical precision and production reliability. Whether you're
                            building AI agents, payment APIs, or onchain infrastructure, these elements maintain
                            the cyberpunk aesthetic and developer-first approach that define KAMIYO.
                        </p>
                        <p className="text-white font-medium">
                            Adapt them. Remix them. Build with them.
                        </p>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-6 items-start ml-5">
                        <PayButton
                            textOverride="Download Brand Assets"
                            onClickOverride={() => window.location.href = '/kamiyo-brand.zip'}
                        />
                    </div>
                </header>

                {/* Additional Info */}
                <section className="mt-16 pt-16 border-t border-gray-500/25">
                    <h2 className="text-2xl font-light mb-6 text-white">Using These Guidelines</h2>
                    <div className="space-y-4 text-gray-400 text-sm leading-relaxed">
                        <p>
                            These brand guidelines are designed for developers, designers, partners, and community
                            members building with or integrating KAMIYO. All assets are provided in web-optimized
                            formats with code examples for immediate implementation.
                        </p>
                        <p>
                            For questions about brand usage or partnership opportunities, contact us at{' '}
                            <a href="mailto:brand@kamiyo.ai" className="text-magenta hover:opacity-80">
                                brand@kamiyo.ai
                            </a>
                        </p>
                    </div>
                </section>
            </BrandLayout>
        </>
    );
}
