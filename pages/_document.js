// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    // In development, allow 'unsafe-eval' for hot reloading.
    // In production, remove 'unsafe-eval' to improve security.
    const csp =
        process.env.NODE_ENV === 'development'
            ? "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://accounts.google.com;"
            : "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;";

    const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": "https://kamiyo.ai/#organization",
                "name": "KAMIYO",
                "legalName": "KAMIYO x402 Payment Facilitator",
                "description": "KAMIYO is an x402 Payment Facilitator platform enabling HTTP 402 Payment Required implementation for autonomous AI agents. On-chain API payments using USDC on Base, Ethereum, and Solana blockchains without account signup.",
                "url": "https://kamiyo.ai",
                "logo": "https://kamiyo.ai/favicon.png",
                "foundingDate": "2024",
                "sameAs": [
                    "https://twitter.com/KAMIYO",
                    "https://github.com/kamiyo-ai"
                ],
                "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "Customer Support",
                    "email": "support@kamiyo.ai",
                    "url": "https://kamiyo.ai"
                },
                "offers": {
                    "@type": "Offer",
                    "description": "x402 protocol implementation for blockchain API billing and autonomous agent payments"
                }
            },
            {
                "@type": "WebSite",
                "@id": "https://kamiyo.ai/#website",
                "name": "KAMIYO",
                "url": "https://kamiyo.ai",
                "description": "x402 Payment Facilitator enabling HTTP 402 Payment Required for autonomous AI agents with on-chain API payments",
                "publisher": {
                    "@id": "https://kamiyo.ai/#organization"
                },
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                        "@type": "EntryPoint",
                        "urlTemplate": "https://kamiyo.ai/api-docs?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                },
                "inLanguage": "en-US"
            },
            {
                "@type": "ItemList",
                "@id": "https://kamiyo.ai/#sitenavigatation",
                "name": "KAMIYO Site Navigation",
                "description": "Main navigation elements for KAMIYO x402 Payment Facilitator",
                "itemListElement": [
                    {
                        "@type": "SiteNavigationElement",
                        "position": 1,
                        "name": "Features",
                        "description": "Explore x402 payment protocol features and capabilities",
                        "url": "https://kamiyo.ai/features"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 2,
                        "name": "Pricing",
                        "description": "View pricing for x402 API access and payment processing",
                        "url": "https://kamiyo.ai/pricing"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 3,
                        "name": "API Documentation",
                        "description": "Complete API documentation for x402 payment implementation",
                        "url": "https://kamiyo.ai/api-docs"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 4,
                        "name": "Fork Analysis",
                        "description": "Analyze blockchain forks for payment verification",
                        "url": "https://kamiyo.ai/fork-analysis"
                    }
                ]
            }
        ]
    };

    return (
        <Html lang="en">
            <Head>
                {/* Favicon */}
                <link rel="icon" type="image/png" href="/favicon.png" />

                {/* Canonical URL */}
                <link rel="canonical" href="https://kamiyo.ai" />

                {/* Content Security Policy */}
                <meta httpEquiv="Content-Security-Policy" content={csp} />

                {/* Primary Meta Tags */}
                <meta name="author" content="KAMIYO" />
                <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
                <meta name="keywords" content="HTTP 402 Payment Required implementation, x402 protocol, AI agent payments, on-chain API payments, autonomous agent payments, blockchain API billing, USDC API payments, payment facilitator, blockchain payments, crypto API, Web3 payments, decentralized payments, smart contract payments, Base blockchain, Ethereum payments, Solana payments" />

                {/* Mobile Optimization */}
                <meta name="theme-color" content="#000000" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

                {/* Open Graph (Facebook, LinkedIn, etc.) */}
                <meta property="og:title" content="KAMIYO - x402 Payment Facilitator | HTTP 402 Payment Required for AI Agents" />
                <meta property="og:description" content="HTTP 402 Payment Required implementation for autonomous AI agents. On-chain API payments with USDC on Base, Ethereum, or Solana. x402 protocol for blockchain API billing without account signup." />
                <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="KAMIYO - x402 Payment Facilitator | HTTP 402 Payment Required for AI Agents" />
                <meta name="twitter:description" content="HTTP 402 Payment Required implementation for autonomous AI agents. On-chain API payments with USDC on Base, Ethereum, or Solana. x402 protocol for blockchain API billing." />
                <meta name="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta name="twitter:site" content="@KAMIYO" />
                <meta name="twitter:creator" content="@KAMIYO" />

                {/* JSON-LD Structured Data */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />

                {/* Preconnect to Google Fonts */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
                {/* Google Fonts: Atkinson Hyperlegible Mono */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:ital,wght@0,200..800;1,200..800&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <body>
            <Main />
            <NextScript />
            </body>
        </Html>
    );
}
