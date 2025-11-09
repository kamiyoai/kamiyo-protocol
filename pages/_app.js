import Head from 'next/head';
import { SessionProvider } from 'next-auth/react';
import { MenuProvider } from '../context/MenuContext';
import Layout from '../components/Layout';
import { JetBrains_Mono } from 'next/font/google';
import '../styles/globals.css';

const jetbrainsMono = JetBrains_Mono({
  weight: ['300', '400'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  // CSRF protection disabled - not needed for Next.js API routes
  // The billing flow uses Next.js API routes (/api/billing/*) which are server-side
  // and don't require CSRF tokens from the frontend.
  // If direct Python backend API calls are needed in the future, use csrfFetch() from utils/csrf.js

  return (
    <div className={`${jetbrainsMono.variable} ${jetbrainsMono.className}`}>
      <SessionProvider session={session}>
        <MenuProvider>
          <Head>
            {/* Primary Meta Tags */}
            <title>x402 Infrastructure - Multi-Chain USDC Payment Verification | KAMIYO</title>
            <meta name="title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification | KAMIYO" />
            <meta name="description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms. Start with 1,000 free verifications per month." />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:url" content="https://kamiyo.ai/" />
            <meta property="og:title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification" />
            <meta property="og:description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms." />
            <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content="https://kamiyo.ai/" />
            <meta property="twitter:title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification" />
            <meta property="twitter:description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms." />
            <meta property="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
            <meta name="twitter:site" content="@KAMIYO" />
            <meta name="twitter:creator" content="@KAMIYO" />
          </Head>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </MenuProvider>
      </SessionProvider>
    </div>
  );
}

export default MyApp;
