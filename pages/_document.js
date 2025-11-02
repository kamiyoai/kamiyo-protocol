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
                "legalName": "KAMIYO Security Intelligence",
                "description": "KAMIYO provides real-time cryptocurrency exploit intelligence for AI agents. Access via MCP subscriptions (Claude Desktop) or x402 API. Aggregating security data from 20+ sources including CertiK, PeckShield, BlockSec, and SlowMist.",
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
                    "description": "Security intelligence via MCP subscriptions ($19-299/mo) or x402 API ($0.01/query) for real-time exploit detection and protocol risk assessment"
                }
            },
            {
                "@type": "WebSite",
                "@id": "https://kamiyo.ai/#website",
                "name": "KAMIYO",
                "url": "https://kamiyo.ai",
                "description": "Security intelligence platform for AI agents delivering real-time crypto exploit data via MCP and x402",
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
                "description": "Main navigation elements for KAMIYO Security Intelligence platform",
                "itemListElement": [
                    {
                        "@type": "SiteNavigationElement",
                        "position": 1,
                        "name": "Features",
                        "description": "Explore security intelligence features: 20+ source aggregation, MCP integration, protocol risk scoring",
                        "url": "https://kamiyo.ai/features"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 2,
                        "name": "Pricing",
                        "description": "View pricing for MCP subscriptions and x402 API access to security intelligence",
                        "url": "https://kamiyo.ai/pricing"
                    },
                    {
                        "@type": "SiteNavigationElement",
                        "position": 3,
                        "name": "API Documentation",
                        "description": "Complete API documentation for MCP integration and x402 security intelligence access",
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
                <meta name="keywords" content="crypto exploit intelligence, AI agent security, MCP server security, Claude Desktop security, real-time exploit detection, DeFi security intelligence, blockchain exploit database, protocol risk assessment, security intelligence API, CertiK API alternative, crypto threat intelligence, smart contract exploits, DeFi hack database, on-chain security monitoring, x402 API, blockchain security alerts, protocol vulnerability tracking, AI security agents, crypto security MCP" />

                {/* Mobile Optimization */}
                <meta name="theme-color" content="#000000" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

                {/* Open Graph (Facebook, LinkedIn, etc.) */}
                <meta property="og:title" content="KAMIYO - Security Intelligence for AI Agents | MCP & x402" />
                <meta property="og:description" content="Real-time crypto exploit intelligence for AI agents. Access via MCP subscriptions (Claude Desktop) or x402 API ($0.01/query). Aggregating security data from 20+ sources including CertiK, PeckShield, BlockSec." />
                <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="KAMIYO" />
                <meta property="og:locale" content="en_US" />

                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="KAMIYO - Security Intelligence for AI Agents | MCP & x402" />
                <meta name="twitter:description" content="Real-time crypto exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources. $0.01 per query or unlimited with MCP." />
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
