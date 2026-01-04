import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from 'next/head';
import { SessionProvider, useSession } from 'next-auth/react';
import { MenuProvider } from '../context/MenuContext';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/globals.css';

function LoadingWrapper({ children }) {
    const { status } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let timeout;
        const handleStart = () => setLoading(true);
        const handleComplete = () => {
            // Minimum 400ms display time
            timeout = setTimeout(() => setLoading(false), 400);
        };

        router.events.on("routeChangeStart", handleStart);
        router.events.on("routeChangeComplete", handleComplete);
        router.events.on("routeChangeError", handleComplete);

        return () => {
            clearTimeout(timeout);
            router.events.off("routeChangeStart", handleStart);
            router.events.off("routeChangeComplete", handleComplete);
            router.events.off("routeChangeError", handleComplete);
        };
    }, [router]);

    useEffect(() => {
        if (status === "authenticated" && router.pathname === "/auth/signin") {
            const callbackUrl = router.query.callbackUrl || "/";
            router.replace(callbackUrl);
        }
    }, [status, router]);

    return (
        <>
            {children}
            {(status === "loading" || loading) && <LoadingSpinner />}
        </>
    );
}

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <>
      <SessionProvider session={session}>
        <MenuProvider>
          <Head>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;700&display=swap" rel="stylesheet" />

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
          <LoadingWrapper>
            <Layout>
              <Component {...pageProps} />
            </Layout>
          </LoadingWrapper>
        </MenuProvider>
      </SessionProvider>
    </>
  );
}

export default MyApp;
