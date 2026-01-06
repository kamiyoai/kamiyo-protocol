import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from 'next/head';
import { MenuProvider } from '../context/MenuContext';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/globals.css';

function LoadingWrapper({ children }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let completeTimeout;
        let maxTimeout;

        const handleStart = () => {
            setLoading(true);
            maxTimeout = setTimeout(() => setLoading(false), 5000);
        };
        const handleComplete = () => {
            clearTimeout(maxTimeout);
            completeTimeout = setTimeout(() => setLoading(false), 400);
        };

        router.events.on("routeChangeStart", handleStart);
        router.events.on("routeChangeComplete", handleComplete);
        router.events.on("routeChangeError", handleComplete);

        return () => {
            clearTimeout(completeTimeout);
            clearTimeout(maxTimeout);
            router.events.off("routeChangeStart", handleStart);
            router.events.off("routeChangeComplete", handleComplete);
            router.events.off("routeChangeError", handleComplete);
        };
    }, [router]);

    return (
        <>
            {children}
            {loading && <LoadingSpinner />}
        </>
    );
}

function MyApp({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => <Layout>{page}</Layout>);

  return (
    <MenuProvider>
      <Head>
        <title>Trust Layer for the Agentic Economy | KAMIYO</title>
        <meta name="title" content="Trust Layer for the Agentic Economy | KAMIYO" />
        <meta name="description" content="Escrow protection and dispute resolution for autonomous agent transactions. Multi-oracle consensus for quality-based settlement." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://kamiyo.ai/" />
        <meta property="og:title" content="Trust Layer for the Agentic Economy | KAMIYO" />
        <meta property="og:description" content="Escrow protection and dispute resolution for autonomous agent transactions." />
        <meta property="og:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://kamiyo.ai/" />
        <meta property="twitter:title" content="Trust Layer for the Agentic Economy | KAMIYO" />
        <meta property="twitter:description" content="Escrow protection and dispute resolution for autonomous agent transactions." />
        <meta property="twitter:image" content="https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png" />
        <meta name="twitter:site" content="@KamiyoAI" />
        <meta name="twitter:creator" content="@KamiyoAI" />
      </Head>
      <LoadingWrapper>
        {getLayout(<Component {...pageProps} />)}
      </LoadingWrapper>
    </MenuProvider>
  );
}

export default MyApp;
