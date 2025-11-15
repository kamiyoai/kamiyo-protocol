import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function CheckoutSuccess() {
    const router = useRouter();
    const { session_id } = router.query;
    const [orderDetails, setOrderDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (session_id) {
            fetch(`/api/billing/checkout-session/${session_id}`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch session details');
                    return res.json();
                })
                .then(data => {
                    setOrderDetails(data);
                    setLoading(false);
                })
                .catch(err => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [session_id]);

    return (
        <div className="min-h-screen flex items-center justify-center p-5 bg-black text-white">
            <Head>
                <title>Subscription Successful | KAMIYO</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>

            <div className="max-w-2xl w-full">
                {loading && (
                    <div className="text-center">
                        <div className="animate-pulse mb-4">
                            <div className="h-8 bg-gray-800 rounded w-3/4 mx-auto mb-4"></div>
                            <div className="h-4 bg-gray-800 rounded w-1/2 mx-auto"></div>
                        </div>
                        <p className="text-gray-400">Loading order details...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900 bg-opacity-20 border border-red-500 /50 p-6 rounded-lg">
                        <h2 className="text-xl font-light mb-2 text-red-400">Error Loading Order</h2>
                        <p className="text-gray-300 mb-4">{error}</p>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="bg-cyan text-black px-6 py-2 rounded hover:bg-cyan-400 transition-colors text-sm uppercase tracking-wider"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                )}

                {orderDetails && (
                    <div className="animate-fade-in">
                        <div className="text-center mb-8">
                            <div className="inline-block p-4 bg-green-900 bg-opacity-20 border border-green-500 /50 rounded-full mb-4">
                                <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h1 className="text-3xl md:text-4xl font-light mb-4 leading-[1.25]">
                                Subscription Successful!
                            </h1>
                            <p className="text-gray-400">
                                Thank you for subscribing to KAMIYO MCP {orderDetails.tier}!
                            </p>
                        </div>

                        <div className="bg-gray-900 bg-opacity-50 border border-cyan /30 p-6 rounded-lg mb-8">
                            <h2 className="text-xl font-light mb-4 text-cyan">Next Steps:</h2>
                            <ol className="space-y-4 text-sm text-gray-300">
                                <li className="flex items-start gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-cyan text-black rounded-full flex items-center justify-center text-xs font-bold">1</span>
                                    <div>
                                        <div className="font-semibold text-white mb-1">Check your email</div>
                                        <div className="text-gray-400">You'll receive your MCP token and setup instructions at {orderDetails.customer_email || 'your registered email'}</div>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-cyan text-black rounded-full flex items-center justify-center text-xs font-bold">2</span>
                                    <div>
                                        <div className="font-semibold text-white mb-1">Add KAMIYO to Claude Desktop</div>
                                        <div className="text-gray-400">Follow the setup guide to configure your MCP server</div>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-cyan text-black rounded-full flex items-center justify-center text-xs font-bold">3</span>
                                    <div>
                                        <div className="font-semibold text-white mb-1">Start verifying payments</div>
                                        <div className="text-gray-400">Verify USDC payments across 12+ blockchains with one API call</div>
                                    </div>
                                </li>
                            </ol>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="flex-1 bg-cyan text-black px-6 py-3 rounded hover:bg-cyan-400 transition-colors text-sm uppercase tracking-wider font-semibold"
                            >
                                Go to Dashboard
                            </button>
                            <button
                                onClick={() => router.push('/mcp/setup')}
                                className="flex-1 border border-cyan text-cyan px-6 py-3 rounded hover:bg-cyan hover:text-black transition-colors text-sm uppercase tracking-wider font-semibold"
                            >
                                View Setup Guide
                            </button>
                        </div>

                        {orderDetails.subscription_id && (
                            <div className="mt-6 text-center text-xs text-gray-500">
                                <p>Order ID: {orderDetails.subscription_id}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
