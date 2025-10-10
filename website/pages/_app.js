// pages/_app.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SessionProvider, useSession } from "next-auth/react";
import Head from "next/head";
import Layout from "../components/Layout";
import { MenuProvider } from "../context/MenuContext";
import LoadingSpinner from "../components/LoadingSpinner";
import "../styles/globals.css";
import { trackEvent } from "../utils/eventTracker";

function LoadingWrapper({ children }) {
    const { status } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(router.pathname === "/"); // Only true on initial load of homepage

    useEffect(() => {
        const handleStart = () => setLoading(true);
        const handleComplete = () => setLoading(false);

        router.events.on("routeChangeStart", handleStart);
        router.events.on("routeChangeComplete", handleComplete);
        router.events.on("routeChangeError", handleComplete);

        return () => {
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

    useEffect(() => {
        if (router.pathname === "/") {
            // Use DOMContentLoaded which fires when HTML is fully loaded and parsed
            // This typically represents above-the-fold content being ready
            if (document.readyState === "interactive" || document.readyState === "complete") {
                setPageLoading(false);
            } else {
                const handleDOMContentLoaded = () => setPageLoading(false);
                document.addEventListener("DOMContentLoaded", handleDOMContentLoaded);

                // Fallback timer to ensure spinner doesn't get stuck
                const fallbackTimer = setTimeout(() => setPageLoading(false), 2500);

                return () => {
                    document.removeEventListener("DOMContentLoaded", handleDOMContentLoaded);
                    clearTimeout(fallbackTimer);
                };
            }

            // Monitor critical elements loading (optional enhancement)
            const observeAboveFoldElements = () => {
                // Target elements that are above the fold on homepage - adjust these selectors as needed
                const criticalSelectors = [
                    'header',
                    '.hero-section',
                    '.main-navigation',
                    '.featured-content'
                ];

                let loadedElements = 0;
                const totalElements = criticalSelectors.length;

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            loadedElements++;
                            observer.unobserve(entry.target);

                            // When most critical elements are visible, hide spinner
                            if (loadedElements >= Math.min(2, totalElements)) {
                                setPageLoading(false);
                            }
                        }
                    });
                });

                // Start observing critical elements
                criticalSelectors.forEach(selector => {
                    const element = document.querySelector(selector);
                    if (element) observer.observe(element);
                });

                return observer;
            };

            // Initialize observer after a short delay to ensure DOM is ready
            const observerTimer = setTimeout(observeAboveFoldElements, 100);

            return () => clearTimeout(observerTimer);
        }
    }, [router.pathname]);

    return (
        <div className="relative min-h-screen">
            {children}
            {(status === "loading" || loading || pageLoading) && <LoadingSpinner />}
        </div>
    );
}

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
    useEffect(() => {
        trackEvent("page_view", { path: window.location.pathname });
    }, []);
    return (
        <SessionProvider session={session}>
            <MenuProvider>
                <Head>
                    <link rel="icon" href="/favicon.png" />
                    <meta charSet="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>{Component.title ? `${Component.title} | Kamiyo.ai` : "KAMIYO - Real-time Blockchain Exploit Intelligence"}</title>
                    <meta name="description" content="Real-time blockchain exploit aggregation from 20+ verified sources. Track DeFi hacks, monitor security incidents, and protect your protocols." />
                    <meta property="og:title" content="KAMIYO - Real-time Blockchain Exploit Intelligence" />
                    <meta property="og:description" content="Real-time aggregation of blockchain exploits from 20+ verified sources." />
                    <meta property="og:image" content="/og-image.png" />
                    <meta property="twitter:card" content="summary_large_image" />
                </Head>
                <LoadingWrapper>
                    <Layout>
                        <Component {...pageProps} />
                    </Layout>
                </LoadingWrapper>
            </MenuProvider>
        </SessionProvider>
    );
}

export default MyApp;
