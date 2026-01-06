// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    const csp =
        process.env.NODE_ENV === 'development'
            ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' http://localhost:* https://accounts.google.com https://api.dexscreener.com https://rpc-devnet.helius.xyz https://api.devnet.solana.com https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://rpc.ankr.com https://mainnet.helius-rpc.com https://cdn.jsdelivr.net wss://api.devnet.solana.com wss://api.mainnet-beta.solana.com ws://localhost:* wss://localhost:*;"
            : "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.kamiyo.ai https://accounts.google.com https://api.dexscreener.com https://rpc-devnet.helius.xyz https://api.devnet.solana.com https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://rpc.ankr.com https://mainnet.helius-rpc.com https://cdn.jsdelivr.net wss://api.devnet.solana.com wss://api.mainnet-beta.solana.com;";

    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": "https://kamiyo.ai/#organization",
                "name": "KAMIYO",
                "legalName": "KAMIYO",
                "description": "Trust infrastructure for autonomous agents. Decentralized escrow and multi-oracle dispute resolution for machine-to-machine commerce.",
                "url": "https://kamiyo.ai",
                "logo": "https://kamiyo.ai/favicon.png",
                "foundingDate": "2024",
                "sameAs": [
                    "https://twitter.com/KamiyoAI",
                    "https://github.com/kamiyo-ai/kamiyo-protocol",
                    "https://discord.gg/6yX8kd2UpC"
                ],
                "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "Customer Support",
                    "email": "support@kamiyo.ai",
                    "url": "https://kamiyo.ai"
                }
            },
            {
                "@type": "WebSite",
                "@id": "https://kamiyo.ai/#website",
                "name": "KAMIYO - Trust Layer for the Agentic Economy",
                "url": "https://kamiyo.ai",
                "description": "Decentralized SLA enforcement for machine-to-machine commerce. Escrow-protected payments with multi-oracle dispute resolution.",
                "publisher": {
                    "@id": "https://kamiyo.ai/#organization"
                },
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                        "@type": "EntryPoint",
                        "urlTemplate": "https://kamiyo.ai/docs?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                },
                "inLanguage": "en-US"
            },
            {
                "@type": "ItemList",
                "@id": "https://kamiyo.ai/#sitenavigatation",
                "name": "KAMIYO Site Navigation",
                "description": "Main navigation for KAMIYO trust infrastructure",
                "itemListElement": [
                    {
                        "@type": "SiteNavigationElement",
                        "position": 1,
                        "name": "About",
                        "description": "Learn about KAMIYO trust infrastructure for autonomous agents",
                        "url": "https://kamiyo.ai/about"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 2,
                        "name": "Pricing",
                        "description": "KAMIYO pricing plans for escrow and dispute resolution",
                        "url": "https://kamiyo.ai/pricing"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 3,
                        "name": "Documentation",
                        "description": "KAMIYO protocol documentation",
                        "url": "https://kamiyo.ai/docs"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 4,
                        "name": "Protocol",
                        "description": "KAMIYO on-chain escrow and dispute resolution protocol",
                        "url": "https://protocol.kamiyo.ai"
                    }
                ]
            }
        ]
    };

    return (
        <Html lang="en">
            <Head>
                {/* Google Fonts */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;700&display=swap" rel="stylesheet" />

                {/* Favicon */}
                <link rel="icon" type="image/png" href="/favicon.png" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.ai" />

                {/* Content Security Policy */}
                <meta httpEquiv="Content-Security-Policy" content={csp} />

                {/* Primary Meta Tags */}
                <meta name="author" content="KAMIYO" />
                <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
                <meta name="keywords" content="AI agent trust infrastructure, decentralized escrow, multi-oracle dispute resolution, machine-to-machine commerce, agentic economy, SLA enforcement, quality-based settlement, autonomous agent accountability, on-chain escrow, oracle consensus, AI agent disputes, stake-backed agents, Solana escrow protocol, agent reputation, x402 payments, crypto escrow API, automated dispute resolution" />

                {/* Mobile Optimization */}
                <meta name="theme-color" content="#000000" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

                {/* Open Graph (Facebook, LinkedIn, etc.) */}
                <meta property="og:title" content="Trust Layer for the Agentic Economy | KAMIYO" />
                <meta property="og:description" content="Decentralized SLA enforcement for machine-to-machine commerce. Escrow-protected payments with multi-oracle dispute resolution." />
                <meta property="og:image" content="https://kamiyo.ai/media/kamiyo_open-graph.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Trust Layer for the Agentic Economy | KAMIYO" />
                <meta name="twitter:description" content="Decentralized SLA enforcement for machine-to-machine commerce. Escrow-protected payments with multi-oracle dispute resolution." />
                <meta name="twitter:image" content="https://kamiyo.ai/media/kamiyo_open-graph.png" />
                <meta name="twitter:site" content="@KamiyoAI" />
                <meta name="twitter:creator" content="@KamiyoAI" />

                {/* JSON-LD Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />

            </Head>
            <body>
            <Main />
            <NextScript />
            </body>
        </Html>
    );
}
