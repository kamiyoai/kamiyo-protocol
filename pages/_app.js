import Head from 'next/head';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Head>
        {/* Primary Meta Tags */}
        <title>KAMIYO - Blockchain exploit alerts within 4 minutes</title>
        <meta name="title" content="KAMIYO - Blockchain exploit alerts within 4 minutes" />
        <meta name="description" content="Get verified exploit data from 20+ trusted security sources across 54 blockchain networks. Instant alerts without manual monitoring." />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://kamiyo.ai/" />
        <meta property="og:title" content="KAMIYO - Blockchain exploit alerts within 4 minutes" />
        <meta property="og:description" content="Get verified exploit data from 20+ trusted security sources across 54 blockchain networks. Instant alerts without manual monitoring." />
        <meta property="og:image" content="https://kamiyo.ai/media/opengraph.jpeg" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://kamiyo.ai/" />
        <meta property="twitter:title" content="KAMIYO - Blockchain exploit alerts within 4 minutes" />
        <meta property="twitter:description" content="Get verified exploit data from 20+ trusted security sources across 54 blockchain networks. Instant alerts without manual monitoring." />
        <meta property="twitter:image" content="https://kamiyo.ai/media/opengraph.jpeg" />
        <meta name="twitter:site" content="@KamiyoAI" />
        <meta name="twitter:creator" content="@KamiyoAI" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}

export default MyApp;
