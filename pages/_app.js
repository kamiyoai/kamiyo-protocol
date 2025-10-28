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
          <title>Security Intelligence for AI Agents | MCP & x402 | KAMIYO</title>
          <meta name="title" content="Security Intelligence for AI Agents | MCP & x402 | KAMIYO" />
          <meta name="description" content="Real-time crypto exploit intelligence for AI agents. Access via MCP subscriptions (Claude Desktop) or x402 API ($0.01/query). Aggregating security data from 20+ sources including CertiK, PeckShield, BlockSec." />

          {/* Open Graph / Facebook */}
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://kamiyo.io/" />
          <meta property="og:title" content="Security Intelligence for AI Agents | MCP & x402" />
          <meta property="og:description" content="Real-time crypto exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources. $0.01 per query or unlimited with MCP." />
          <meta property="og:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />

          {/* Twitter */}
          <meta property="twitter:card" content="summary_large_image" />
          <meta property="twitter:url" content="https://kamiyo.io/" />
          <meta property="twitter:title" content="Security Intelligence for AI Agents | MCP & x402" />
          <meta property="twitter:description" content="Real-time crypto exploit intelligence for AI agents. Access via MCP subscriptions or x402 API. Aggregating security data from 20+ sources. $0.01 per query or unlimited with MCP." />
          <meta property="twitter:image" content="https://kamiyo.io/media/KAMIYO_OpenGraphImage.png" />
          <meta name="twitter:site" content="@KAMIYO" />
          <meta name="twitter:creator" content="@KAMIYO" />
        </Head>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </MenuProvider>
    </SessionProvider>
  );
}

export default MyApp;
