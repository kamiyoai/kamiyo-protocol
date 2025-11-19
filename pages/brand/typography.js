// pages/brand/typography.js
import SEO from '../../components/SEO';
import BrandLayout from '../../components/brand/BrandLayout';
import CodeBlock from '../../components/brand/CodeBlock';

export default function TypographyPage() {
    const typeScale = [
        { name: "H1 Hero", size: "3.1rem (49.6px)", lineHeight: "1.25", weight: "300", usage: "Landing page headlines", example: "Stop building. Start shipping." },
        { name: "H2 Section", size: "2.5rem (40px)", lineHeight: "1.3", weight: "300", usage: "Section titles", example: "Built for Developers" },
        { name: "H3 Subsection", size: "1.5rem (24px)", lineHeight: "1.4", weight: "400", usage: "Subsection headers", example: "Why Developers Choose KAMIYO" },
        { name: "Body Large", size: "1.125rem (18px)", lineHeight: "1.5", weight: "400", usage: "Intro paragraphs", example: "Multi-chain payment verification in one line of code. No infrastructure. No parsing." },
        { name: "Body", size: "0.8rem (12.8px)", lineHeight: "1.5", weight: "400", usage: "Standard text", example: "The quick brown fox jumps over the lazy dog. KAMIYO provides production-grade infrastructure." },
        { name: "Small", size: "0.75rem (12px)", lineHeight: "1.4", weight: "400", usage: "Captions, labels", example: "1,000 free verifications/month • 99.9% uptime SLA" },
        { name: "Code", size: "0.75rem (12px)", lineHeight: "1.6", weight: "400", usage: "Code blocks", example: "const result = client.verify_payment({ tx_hash, chain })" },
    ];

    const cssExample = `/* Typography System */
body, p, ul, ol, a, h1, h2, h3, h4, h5, h6,
span, button, input, ::placeholder {
  font-family: 'Atkinson Hyperlegible Mono', monospace;
  font-weight: 400;
  letter-spacing: -0.5px;
}

h1 {
  font-size: 3.1rem;
  line-height: 1.25;
  font-weight: 300;
}

p {
  font-size: 0.8rem;
  line-height: 1.5;
  color: #d1d5db;
}`;

    return (
        <>
            <SEO
                title="Typography - KAMIYO Brand Guidelines"
                description="KAMIYO typography system using Atkinson Hyperlegible Mono for developer-first interfaces and terminal aesthetics."
            />

            <BrandLayout>
                {/* Page Header */}
                <header className="mb-12">
                    <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">
                        — &nbsp;タイポグラフィ
                    </p>
                    <h1 className="text-4xl font-light mb-4">Typography</h1>
                    <p className="text-gray-400 text-lg leading-relaxed">
                        Typography is infrastructure. We use Atkinson Hyperlegible Mono exclusively—chosen
                        for its exceptional readability in code editors, terminals, and developer tools. Every
                        weight, size, and spacing decision prioritizes clarity at small sizes and extended
                        reading sessions.
                    </p>
                </header>

                {/* Primary Typeface */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Primary Typeface</h2>

                    <div className="border border-gray-500/25 rounded-lg p-8 mb-6">
                        <div className="mb-6">
                            <h3 className="text-3xl text-white mb-2">Atkinson Hyperlegible Mono</h3>
                            <p className="text-sm text-gray-400">Purpose-built for legibility in terminal and developer-focused interfaces</p>
                        </div>
                        <div className="text-4xl text-white mb-6">
                            ABCDEFGHIJKLMNOPQRSTUVWXYZ
                        </div>
                        <div className="text-4xl text-white mb-6">
                            abcdefghijklmnopqrstuvwxyz
                        </div>
                        <div className="text-4xl text-white">
                            0123456789 !@#$%^&*()
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                        <div className="border border-gray-500/20 rounded-lg p-4">
                            <div className="text-xs text-gray-400 mb-2">Weights Available</div>
                            <div className="space-y-2">
                                <div className="text-white">Regular (400) - Body text, UI</div>
                                <div className="text-white font-bold">Bold (700) - Strong emphasis</div>
                            </div>
                        </div>
                        <div className="border border-gray-500/20 rounded-lg p-4">
                            <div className="text-xs text-gray-400 mb-2">Letter Spacing</div>
                            <div className="text-white">-0.5px (default)</div>
                        </div>
                    </div>
                </section>

                {/* Type Scale */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Type Scale</h2>

                    <div className="space-y-8">
                        {typeScale.map((type) => (
                            <div key={type.name} className="border-b border-gray-500/25 pb-8 last:border-0">
                                <div className="grid md:grid-cols-3 gap-6">
                                    <div>
                                        <h3 className="text-sm text-gray-400 mb-3">{type.name}</h3>
                                        <ul className="text-xs text-gray-500 space-y-1">
                                            <li>Size: {type.size}</li>
                                            <li>Line Height: {type.lineHeight}</li>
                                            <li>Weight: {type.weight}</li>
                                            <li className="text-gray-400 mt-2">{type.usage}</li>
                                        </ul>
                                    </div>
                                    <div className="md:col-span-2">
                                        <div
                                            style={{
                                                fontSize: type.name === "H1 Hero" ? "2.5rem" :
                                                         type.name === "H2 Section" ? "2rem" :
                                                         type.name === "H3 Subsection" ? "1.5rem" :
                                                         type.name === "Body Large" ? "1.125rem" :
                                                         type.name === "Body" ? "0.875rem" :
                                                         type.name === "Small" ? "0.75rem" :
                                                         "0.75rem",
                                                lineHeight: type.lineHeight,
                                                fontWeight: type.weight
                                            }}
                                            className="text-white"
                                        >
                                            {type.example}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Code Formatting */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Code Formatting</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Code snippets use the same Atkinson Hyperlegible Mono typeface with syntax
                        highlighting for improved readability.
                    </p>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div className="border border-gray-500/20 rounded-lg p-4">
                            <div className="text-xs text-gray-400 mb-2">Syntax Highlighting</div>
                            <div className="space-y-1 text-xs">
                                <div><span className="text-cyan">Keywords:</span> <span className="text-white">Cyan (#00ffff)</span></div>
                                <div><span className="text-magenta">Values:</span> <span className="text-white">Magenta/White</span></div>
                                <div><span className="text-gray-500">Comments:</span> <span className="text-white">Gray-500</span></div>
                            </div>
                        </div>
                        <div className="border border-gray-500/20 rounded-lg p-4">
                            <div className="text-xs text-gray-400 mb-2">Code Block Styling</div>
                            <div className="space-y-1 text-xs text-white">
                                <div>Background: #000000</div>
                                <div>Border: 1px solid gray-500/20</div>
                                <div>Border Radius: 8px</div>
                            </div>
                        </div>
                    </div>

                    <CodeBlock
                        code={`# Python example
from x402 import X402Client

client = X402Client()
result = client.verify_payment(
    tx_hash="...",
    chain="solana",
    expected_amount=10.00
)

if result.verified:
    # Grant access
    print("Payment verified!")`}
                        language="python"
                        title="Code Block Example"
                    />
                </section>

                {/* Implementation */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Implementation</h2>
                    <CodeBlock
                        code={cssExample}
                        language="css"
                    />
                </section>

                {/* Usage Guidelines */}
                <section className="mb-16 pt-12 border-t border-gray-500/25">
                    <h2 className="text-2xl font-light mb-6 text-white">Usage Guidelines</h2>

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
                                <li>• Use Atkinson Hyperlegible Mono for all text</li>
                                <li>• Maintain -0.5px letter spacing</li>
                                <li>• Use light weights (300) for large headlines</li>
                                <li>• Follow the defined type scale</li>
                                <li>• Ensure sufficient line height for readability</li>
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
                                <li>• Don't use additional typefaces</li>
                                <li>• Don't use condensed or extended variants</li>
                                <li>• Don't modify letter spacing dramatically</li>
                                <li>• Don't use font sizes outside the scale</li>
                                <li>• Don't use light weights for small text</li>
                            </ul>
                        </div>
                    </div>
                </section>
            </BrandLayout>
        </>
    );
}
