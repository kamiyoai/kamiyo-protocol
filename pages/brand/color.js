// pages/brand/color.js
import SEO from '../../components/SEO';
import BrandLayout from '../../components/brand/BrandLayout';
import ColorSwatch from '../../components/brand/ColorSwatch';
import CodeBlock from '../../components/brand/CodeBlock';

export default function ColorPage() {
    const primaryColors = [
        {
            name: "Magenta",
            hex: "#ff00ff",
            rgb: "255, 0, 255",
            usage: "Primary CTAs, links, accents, interactive elements"
        },
        {
            name: "Cyan",
            hex: "#00ffff",
            rgb: "0, 255, 255",
            usage: "Secondary accents, highlights, code elements"
        },
        {
            name: "Orange",
            hex: "#ffb343",
            rgb: "255, 179, 67",
            usage: "Warning states, special highlights"
        }
    ];

    const neutralColors = [
        {
            name: "Black",
            hex: "#000000",
            rgb: "0, 0, 0",
            usage: "Primary background, main canvas"
        },
        {
            name: "Dark",
            hex: "#282d34",
            rgb: "40, 45, 52",
            usage: "Card backgrounds, containers"
        },
        {
            name: "Ash",
            hex: "#32363d",
            rgb: "50, 54, 61",
            usage: "Secondary backgrounds, hover states"
        },
        {
            name: "Chalk",
            hex: "#d1d5db",
            rgb: "209, 213, 219",
            usage: "Primary text, body copy"
        }
    ];

    const tailwindConfig = `// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        magenta: "#ff00ff",
        cyan: "#00ffff",
        orange: "#ffb343",
        dark: "#282d34",
        chalk: "#d1d5db",
        ash: "#32363d",
      },
    },
  },
}`;

    const cssVariables = `:root {
  --color-magenta: #ff00ff;
  --color-cyan: #00ffff;
  --color-orange: #ffb343;
  --color-dark: #282d34;
  --color-chalk: #d1d5db;
  --color-ash: #32363d;
}`;

    const gradientCSS = `/* Primary Gradient (Magenta → Cyan) */
background: linear-gradient(90deg, #ff44f5, #4fe9ea);

/* Animated Gradient */
background: linear-gradient(90deg, #4fe9ea, #ff44f5);
background-size: 200% 100%;
animation: gradientMove 3s linear infinite;

@keyframes gradientMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;

    return (
        <>
            <SEO
                title="Color Palette - KAMIYO Brand Guidelines"
                description="KAMIYO color system: magenta-cyan gradients, cyberpunk palette, and usage guidelines for the x402 payment infrastructure brand."
            />

            <BrandLayout>
                {/* Page Header */}
                <header className="mb-12">
                    <p className="font-light text-sm tracking-widest text-cyan mb-4 md:mb-8">
                        — &nbsp;カラーパレット
                    </p>
                    <h1 className="text-4xl font-light mb-4">Color</h1>
                    <p className="text-gray-400 text-lg leading-relaxed">
                        The KAMIYO color system balances cyberpunk aesthetics with technical readability.
                        Our signature magenta-cyan gradient represents the bridge between human creativity
                        and machine precision. All colors are optimized for dark backgrounds and terminal interfaces.
                    </p>
                </header>

                {/* Primary Colors */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Primary Colors</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {primaryColors.map((color) => (
                            <ColorSwatch
                                key={color.hex}
                                name={color.name}
                                hex={color.hex}
                                rgb={color.rgb}
                                usage={color.usage}
                            />
                        ))}
                    </div>
                </section>

                {/* Neutral Colors */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Neutral Colors</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {neutralColors.map((color) => (
                            <ColorSwatch
                                key={color.hex}
                                name={color.name}
                                hex={color.hex}
                                rgb={color.rgb}
                                usage={color.usage}
                            />
                        ))}
                    </div>
                </section>

                {/* Gradients */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Gradients</h2>

                    {/* Primary Gradient */}
                    <div className="mb-8">
                        <div
                            className="w-full h-24 rounded-lg mb-4"
                            style={{
                                background: "linear-gradient(90deg, #ff44f5, #4fe9ea)",
                            }}
                        />
                        <h3 className="text-white text-lg mb-2">Primary Gradient (Magenta → Cyan)</h3>
                        <p className="text-xs text-gray-500 mb-3">Use for: Buttons, borders, text highlights, loading states</p>
                        <CodeBlock
                            code="background: linear-gradient(90deg, #ff44f5, #4fe9ea);"
                            language="css"
                        />
                    </div>

                    {/* Animated Gradient */}
                    <div className="mb-8">
                        <div
                            className="w-full h-24 rounded-lg mb-4"
                            style={{
                                background: "linear-gradient(90deg, #4fe9ea, #ff44f5)",
                                backgroundSize: "200% 100%",
                                animation: "gradientMove 3s linear infinite"
                            }}
                        />
                        <h3 className="text-white text-lg mb-2">Animated Gradient</h3>
                        <p className="text-xs text-gray-500 mb-3">Use for: Live indicators, active states, loading animations</p>
                        <CodeBlock
                            code={gradientCSS}
                            language="css"
                        />
                    </div>
                </section>

                {/* Code Examples */}
                <section className="mb-16">
                    <h2 className="text-2xl font-light mb-6 text-white">Implementation</h2>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-white text-lg mb-3">Tailwind Configuration</h3>
                            <CodeBlock
                                code={tailwindConfig}
                                language="typescript"
                            />
                        </div>

                        <div>
                            <h3 className="text-white text-lg mb-3">CSS Custom Properties</h3>
                            <CodeBlock
                                code={cssVariables}
                                language="css"
                            />
                        </div>
                    </div>
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
                                <li>• Use magenta for primary interactive elements</li>
                                <li>• Use cyan for secondary accents and code highlights</li>
                                <li>• Always use colors on dark backgrounds</li>
                                <li>• Maintain high contrast for accessibility</li>
                                <li>• Use gradients for emphasis and motion</li>
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
                                <li>• Don't use colors on light backgrounds</li>
                                <li>• Don't modify hex values or create new shades</li>
                                <li>• Don't use gradients for body text</li>
                                <li>• Don't combine orange with magenta/cyan</li>
                                <li>• Don't reduce contrast below WCAG AA standards</li>
                            </ul>
                        </div>
                    </div>
                </section>
            </BrandLayout>
        </>
    );
}
