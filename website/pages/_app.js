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
    const [initialLoad, setInitialLoad] = useState(router.pathname === "/");

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

    // Hide initial load spinner when homepage is loaded
    useEffect(() => {
        if (initialLoad && router.pathname === "/") {
            if (document.readyState === "complete") {
                setInitialLoad(false);
            } else {
                const handleLoad = () => setInitialLoad(false);
                window.addEventListener("load", handleLoad);

                // Fallback timeout in case load event doesn't fire
                const fallbackTimer = setTimeout(() => setInitialLoad(false), 3000);

                return () => {
                    window.removeEventListener("load", handleLoad);
                    clearTimeout(fallbackTimer);
                };
            }
        }
    }, [initialLoad, router.pathname]);

    return (
        <div className="relative min-h-screen">
            {children}
            {(status === "loading" || loading || initialLoad) && (
                <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-black bg-opacity-50 w-full h-full absolute inset-0" />
                    <div className="relative z-10">
                        <LoadingSpinner />
                    </div>
                </div>
            )}
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
                    <title>{Component.title ? `${Component.title} | Kamiyo.ai` : "Kamiyo.ai"}</title>
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