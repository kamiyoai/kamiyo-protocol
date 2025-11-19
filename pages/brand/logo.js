// pages/brand/logo.js
import SEO from '../../components/SEO';
import BrandLayout from '../../components/brand/BrandLayout';
import PayButton from '../../components/PayButton';

export default function LogoPage() {
    return (
        <>
            <SEO
                title="Logo & Identity - KAMIYO Brand Guidelines"
                description="KAMIYO logo usage guidelines, sizing specifications, and brand identity elements for the x402 payment infrastructure."
            />

            <BrandLayout>
                {/* Page Header */}
                <header className="mb-12">
                    <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">
                        — &nbsp;ロゴとアイデンティティ
                    </p>
                    <h1 className="text-4xl font-light mb-4">Logo & Identity</h1>
                    <p className="text-gray-400 text-lg leading-relaxed">
                        The KAMIYO logo represents technical precision and cyberpunk aesthetics. Always use
                        provided files without modification to maintain brand consistency across all touchpoints.
                    </p>
                </header>

                {/* Primary Logo */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Primary Logo</h2>

                    <div className="border border-gray-500/25 rounded-lg p-12 mb-6 flex items-center justify-center">
                        <img
                            src="/media/KAMIYO_logomark.png"
                            alt="KAMIYO"
                            className="h-20 w-auto"
                        />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="border border-gray-500/20 rounded-lg p-6">
                            <h3 className="text-white text-sm mb-3">Files Available</h3>
                            <ul className="text-xs text-gray-400 space-y-2">
                                <li>• kamiyo-logo.png (wordmark, PNG)</li>
                                <li>• kamiyo-logo.svg (wordmark, SVG)</li>
                                <li>• kamiyo-icon.png (logomark icon)</li>
                                <li>• kamiyo-vertical.png (vertical lockup)</li>
                                <li>• kamiyo-animation.mp4 (animated logomark)</li>
                            </ul>
                        </div>
                        <div className="border border-gray-500/20 rounded-lg p-6">
                            <h3 className="text-white text-sm mb-3">Usage Guidelines</h3>
                            <ul className="text-xs text-gray-400 space-y-2">
                                <li>• Use on dark backgrounds only</li>
                                <li>• Always maintain aspect ratio</li>
                                <li>• Ensure adequate clear space</li>
                                <li>• Do not modify or recreate</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Clear Space */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Clear Space</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Maintain minimum clear space around the logo to ensure visibility and impact.
                        Use 20px on all sides, or 0.5x the logo height, whichever is greater.
                    </p>

                    <div className="border border-gray-500/20 rounded-lg p-12 mb-6 flex items-center justify-center relative">
                        <div className="border border-dashed border-magenta/30 p-8">
                            <img
                                src="/media/KAMIYO_logomark.png"
                                alt="KAMIYO"
                                className="h-16 w-auto"
                            />
                        </div>
                        <div className="absolute top-4 left-4 text-xs text-magenta">
                            20px minimum clear space
                        </div>
                    </div>
                </section>

                {/* Vertical Layout */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Vertical Stacking</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        The icon and wordmark can be stacked vertically with centered alignment.
                        This pattern works well for footers, mobile layouts, and branding lockups.
                    </p>

                    <div className="border border-gray-500/20 rounded-lg p-12 mb-6 bg-black">
                        <div className="flex flex-col items-center text-center">
                            <img
                                src="https://kamiyo.ai/x402resolve/media/footer-logo.png"
                                alt="KAMIYO Vertical Lockup"
                                className="w-auto h-48"
                            />
                        </div>
                    </div>

                    <div className="border border-gray-500/20 rounded-lg p-6">
                        <h3 className="text-white text-sm mb-3">Best Practices</h3>
                        <ul className="text-xs text-gray-400 space-y-2">
                            <li>• Stack icon, wordmark, and optional tagline vertically</li>
                            <li>• Center-align all elements</li>
                            <li>• Maintain proportional spacing between elements</li>
                            <li>• Use on dark backgrounds</li>
                        </ul>
                    </div>
                </section>

                {/* Dos and Don'ts */}
                <section className="mb-16 pt-12 border-t border-gray-500/25">
                    <h2 className="text-2xl font-light mb-6 text-white">Logo Usage Guidelines</h2>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* DO */}
                        <div>
                            <h3 className="text-white mb-4 flex items-center gap-2 text-lg">
                                <svg className="w-5 h-5 text-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Do
                            </h3>
                            <ul className="space-y-3 text-sm text-gray-400">
                                <li>✓ Use on black or dark backgrounds</li>
                                <li>✓ Maintain aspect ratio</li>
                                <li>✓ Use provided files only</li>
                                <li>✓ Ensure adequate clear space</li>
                                <li>✓ Scale proportionally</li>
                            </ul>
                        </div>

                        {/* DON'T */}
                        <div>
                            <h3 className="text-white mb-4 flex items-center gap-2 text-lg">
                                <svg className="w-5 h-5 text-magenta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Don't
                            </h3>
                            <ul className="space-y-3 text-sm text-gray-400">
                                <li>✗ Don't rotate or skew the logo</li>
                                <li>✗ Don't apply effects or filters</li>
                                <li>✗ Don't change colors</li>
                                <li>✗ Don't use on light backgrounds</li>
                                <li>✗ Don't recreate or redraw</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Download Section */}
                <section className="border border-gray-500/25 rounded-lg p-8">
                    <h2 className="text-2xl font-light mb-4 text-white">Download Logo Files</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        All logo files are available in the brand assets package.
                    </p>
                    <div className="ml-5">
                        <PayButton
                            textOverride="Download Brand Assets"
                            onClickOverride={() => window.location.href = '/kamiyo-brand.zip'}
                        />
                    </div>
                </section>
            </BrandLayout>
        </>
    );
}
