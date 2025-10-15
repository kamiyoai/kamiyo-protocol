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
                <meta property="og:title" content="KAMIYO - DeFi Exploit Intelligence" />
                <meta property="og:description" content="Real-time exploit alerts across 54+ chains. Get notified within 4 minutes of confirmed exploits. Track $200M+ in losses from 400+ verified sources." />
                <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta property="og:url" content="https://kamiyo.ai" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Kamiyo.ai" />

                {/* X Cards */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="KAMIYO - DeFi Exploit Intelligence" />
                <meta name="twitter:description" content="Real-time exploit alerts across 54+ chains. Get notified within 4 minutes of confirmed exploits. Track $200M+ in losses from 400+ verified sources." />
                <meta name="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
                <meta name="twitter:site" content="@KAMIYO" />

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
