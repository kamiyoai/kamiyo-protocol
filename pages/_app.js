import Head from 'next/head';
import { SessionProvider } from 'next-auth/react';
import { MenuProvider } from '../context/MenuContext';
import Layout from '../components/Layout';
import { useEffect } from 'react';
import { initCsrfProtection } from '../utils/csrf';
import '../styles/globals.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  // Initialize CSRF protection on app load (BLOCKER 1)
  // Only initialize in browser, not during SSR
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initCsrfProtection().catch(err => {
        // Silently fail - token will be fetched on first API request
        console.debug('[App] CSRF initialization deferred:', err.message);
      });
    }
  }, []);

  return (
    <SessionProvider session={session}>
      <MenuProvider>
        <Head>
          {/* Primary Meta Tags */}
          <title>On-chain API payments with x402 for autonomous AI agents</title>
          <meta name="title" content="On-chain API payments with x402 for autonomous AI agents" />
          <meta name="description" content="HTTP 402 Payment Required implementation for AI agents. Pay with USDC on-chain without account signup. Blockchain exploit intelligence powered by x402 payments." />

          {/* Open Graph / Facebook */}
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://kamiyo.ai/" />
          <meta property="og:title" content="On-chain API payments with x402 for autonomous AI agents" />
          <meta property="og:description" content="HTTP 402 Payment Required implementation for AI agents. Pay with USDC on-chain without account signup. Blockchain exploit intelligence powered by x402 payments." />
          <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />

          {/* Twitter */}
          <meta property="twitter:card" content="summary_large_image" />
          <meta property="twitter:url" content="https://kamiyo.ai/" />
          <meta property="twitter:title" content="On-chain API payments with x402 for autonomous AI agents" />
          <meta property="twitter:description" content="HTTP 402 Payment Required implementation for AI agents. Pay with USDC on-chain without account signup. Blockchain exploit intelligence powered by x402 payments." />
          <meta property="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
          <meta name="twitter:site" content="@KamiyoAI" />
          <meta name="twitter:creator" content="@KamiyoAI" />
        </Head>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </MenuProvider>
    </SessionProvider>
  );
}

export default MyApp;
