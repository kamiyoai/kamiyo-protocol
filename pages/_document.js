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
                "legalName": "KAMIYO",
                "description": "x402 Infrastructure - Multi-chain USDC payment verification API. Verify payments across Solana, Base, Ethereum and more. 99.9% uptime, responses under 500ms.",
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
                    "@type": "AggregateOffer",
                    "description": "Multi-chain USDC payment verification API with pricing from free tier (1,000 verifications/month) to Enterprise (unlimited verifications)",
                    "lowPrice": "0",
                    "highPrice": "999",
                    "priceCurrency": "USD",
                    "offerCount": "4"
                }
            },
            {
                "@type": "WebSite",
                "@id": "https://kamiyo.ai/#website",
                "name": "KAMIYO x402 Infrastructure",
                "url": "https://kamiyo.ai",
                "description": "Multi-chain USDC payment verification API for Solana, Base, Ethereum, Polygon, Arbitrum, Optimism and more",
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
                "description": "Main navigation for x402 payment verification infrastructure",
                "itemListElement": [
                    {
                        "@type": "SiteNavigationElement",
                        "position": 1,
                        "name": "Features",
                        "description": "Multi-chain USDC payment verification features",
                        "url": "https://kamiyo.ai/features"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 2,
                        "name": "Pricing",
                        "description": "x402 pricing plans from free tier to Enterprise",
                        "url": "https://kamiyo.ai/pricing"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 3,
                        "name": "API Documentation",
                        "description": "x402 payment verification API documentation",
                        "url": "https://kamiyo.ai/api-docs"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 4,
                        "name": "About",
                        "description": "Learn about x402 payment verification infrastructure",
                        "url": "https://kamiyo.ai/about"
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
                <meta name="keywords" content="USDC payment verification, crypto payment API, blockchain payment verification, multi-chain payment API, Solana payment verification, Base payment verification, Ethereum payment verification, crypto micropayments, API monetization, pay per use API, blockchain transaction verification, USDC API, crypto payment infrastructure, payment verification service, AI agent payments, ERC-8004 payments, x402 API, transaction verification API, crypto payment gateway, blockchain payment confirmation" />

                {/* Mobile Optimization */}
                <meta name="theme-color" content="#000000" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

                {/* Open Graph (Facebook, LinkedIn, etc.) */}
                <meta property="og:title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification" />
                <meta property="og:description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms." />
                <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification" />
                <meta name="twitter:description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms." />
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
