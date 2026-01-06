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
    const [sessionTimeout, setSessionTimeout] = useState(false);

    // Timeout for session loading - don't block UI forever
    useEffect(() => {
        if (status === "loading") {
            const timeout = setTimeout(() => {
                setSessionTimeout(true);
            }, 3000); // 3 second max wait for session
            return () => clearTimeout(timeout);
        } else {
            setSessionTimeout(false);
        }
    }, [status]);

    useEffect(() => {
        let timeout;

        const handleStart = (url) => {
            if (url !== router.asPath) {
                setLoading(true);
                timeout = setTimeout(() => setLoading(false), 3000);
            }
        };

        const handleComplete = () => {
            clearTimeout(timeout);
            setLoading(false);
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

    // Show spinner for route changes, but not indefinitely for session loading
    const showSpinner = loading || (status === "loading" && !sessionTimeout);

    return (
        <>
            {children}
            {showSpinner && <LoadingSpinner />}
        </>
    );
}

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <>
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
            <meta property="og:image" content="https://kamiyo.ai/media/kamiyo_open-graph.png" />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content="https://kamiyo.ai/" />
            <meta property="twitter:title" content="x402 Infrastructure - Multi-Chain USDC Payment Verification" />
            <meta property="twitter:description" content="Verify USDC payments across Solana, Base, Ethereum and more. Simple API for payment verification. 99.9% uptime, responses under 500ms." />
            <meta property="twitter:image" content="https://kamiyo.ai/media/kamiyo_open-graph.png" />
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
