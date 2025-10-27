// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    // In development, allow 'unsafe-eval' for hot reloading.
    // In production, remove 'unsafe-eval' to improve security.
    const csp =
        process.env.NODE_ENV === 'development'
            ? "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://accounts.google.com;"
            : "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;";

    return (
        <Html lang="en">
            <Head>
                {/* Content Security Policy */}
                <meta httpEquiv="Content-Security-Policy" content={csp} />

                {/* Open Graph (Facebook, LinkedIn, etc.) */}
                <meta property="og:title" content="KamiyoAI - Autonomous AI Ecosystem" />
                <meta property="og:description" content="Kamiyo.ai is an evolving AI swarm built on Phala Network, using TEE-secured agents to interact and innovate." />
                <meta property="og:image" content="https://kamiyo.ai/media/KamiyoAI_OpenGraphImage.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Kamiyo.ai" />

                {/* Twitter Cards */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="KamiyoAI - Autonomous AI Ecosystem" />
                <meta name="twitter:description" content="Kamiyo.ai is an evolving AI swarm built on Phala Network, using TEE-secured agents to interact and innovate." />
                <meta name="twitter:image" content="https://kamiyo.ai/media/KamiyoAI_OpenGraphImage.png" />
                <meta name="twitter:site" content="@KamiyoAI" />

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
