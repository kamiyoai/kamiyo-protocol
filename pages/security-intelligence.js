// pages/security-intelligence.js
import { useState } from "react";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import { useRouter } from "next/router";
import Head from "next/head";

export default function SecurityIntelligence() {
    const router = useRouter();

    return (
        <>
            <Head>
                <title>Security Intelligence API | KAMIYO - Real-Time Crypto Exploit Data</title>
                <meta name="description" content="Real-time cryptocurrency exploit intelligence via x402. Aggregating security data from 20+ sources. $0.01/query, no API keys required. Built for AI agents and DeFi traders." />
                <meta name="keywords" content="crypto exploit intelligence, security intelligence API, x402 exploit data, blockchain security, DeFi security, AI agent security, exploit detection" />
                <meta property="og:title" content="KAMIYO Security Intelligence - Real-Time Crypto Exploit Data via x402" />
                <meta property="og:description" content="$2.1B stolen in H1 2025. Get real-time exploit intelligence from 20+ sources. Pay per query with x402, no API keys." />
                <meta property="og:type" content="website" />
                <link rel="canonical" href="https://kamiyo.ai/security-intelligence" />
            </Head>

            <div className="text-white bg-black min-h-screen">
                {/* Hero Section */}
                <section className="w-full border-b border-gray-500 /25 bg-black">
                    <div className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 max-w-[1400px]">
                        <div className="max-w-4xl mx-auto text-center">
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-light mb-6 leading-tight text-white">
                                Security Intelligence for AI Agents
                            </h1>
                            <p className="text-gray-400 text-lg md:text-xl leading-relaxed mb-8">
                                Real-time cryptocurrency exploit intelligence aggregated from 20+ sources.
                                Pay $0.01 per query via x402. No API keys, no signup, no friction.
                            </p>

                            {/* Stats Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                                    <div className="text-3xl font-light gradient-text mb-2">$2.1B</div>
                                    <div className="text-gray-500 text-sm">Stolen in H1 2025</div>
                                </div>
                                <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                                    <div className="text-3xl font-light gradient-text mb-2">20+</div>
                                    <div className="text-gray-500 text-sm">Intelligence Sources</div>
                                </div>
                                <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                                    <div className="text-3xl font-light gradient-text mb-2">$0.01</div>
                                    <div className="text-gray-500 text-sm">Per Query via x402</div>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4 justify-center">
                                <PayButton
                                    textOverride="Add to Claude Desktop"
                                    onClickOverride={() => router.push('/pricing')}
                                />
                                <button
                                    onClick={() => router.push('/api-docs')}
                                    className="px-6 py-3 border border-gray-500 border-opacity-50 rounded-lg hover:border-cyan transition-colors text-sm"
                                >
                                    View API Docs (x402)
                                </button>
                            </div>

                            <div className="max-w-4xl mx-auto mt-8 p-6 border border-gray-500 /25 rounded-lg">
                                <p className="text-center text-gray-400">
                                    <strong className="text-white">Two ways to access:</strong> MCP subscription
                                    for AI agents ($19/mo unlimited) or x402 API for direct queries ($0.01 each)
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section className="w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px]">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-light mb-4">What You Get</h2>
                        <p className="text-gray-400 text-lg">Comprehensive exploit intelligence for secure deployments</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">🚨</div>
                            <h3 className="text-xl font-light mb-3">Real-Time Exploit Alerts</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Get notified of exploits as they happen. Aggregated from CertiK, PeckShield, BlockSec,
                                and 17+ other security researchers. WebSocket streaming available.
                            </p>
                            <div className="text-cyan text-sm">$0.01/query</div>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">📊</div>
                            <h3 className="text-xl font-light mb-3">Protocol Risk Scores</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Assess protocol safety before deployment. Historical exploit data, total funds lost,
                                time since last incident, and comparative analysis.
                            </p>
                            <div className="text-cyan text-sm">$0.02/risk-score (coming soon)</div>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">🔍</div>
                            <h3 className="text-xl font-light mb-3">Wallet Screening</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Check if wallet addresses are involved in known exploits. Blacklist status,
                                funds flow analysis, and risk level classification.
                            </p>
                            <div className="text-cyan text-sm">$0.005/wallet-check (coming soon)</div>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">🎯</div>
                            <h3 className="text-xl font-light mb-3">Source Quality Scoring</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Proprietary algorithm scoring sources on speed, exclusivity, reliability, coverage,
                                and accuracy. Know which sources to trust.
                            </p>
                            <div className="text-cyan text-sm">Included</div>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">⚡</div>
                            <h3 className="text-xl font-light mb-3">Historical Exploit Database</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Query years of exploit history. Filter by chain, protocol, amount, date range.
                                Learn from past incidents to prevent future losses.
                            </p>
                            <div className="text-cyan text-sm">$0.01/query</div>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <div className="text-2xl mb-4">🤖</div>
                            <h3 className="text-xl font-light mb-3">AI Agent Optimized</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Built for autonomous agents. x402 payment protocol eliminates API key management.
                                Agents discover, pay, and access security data automatically.
                            </p>
                            <div className="text-cyan text-sm">Zero friction</div>
                        </div>
                    </div>
                </section>

                {/* Why x402 for Security Intelligence */}
                <section className="w-full px-5 mx-auto pt-16 pb-16 border-t border-gray-500 /25 max-w-[1400px]">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-3xl md:text-4xl font-light mb-8 text-center">Why x402 for Security Intelligence?</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                            <div className="flex gap-4">
                                <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-light mb-2">No API Key Management</h3>
                                    <p className="text-gray-500 text-sm">
                                        AI agents pay directly with USDC. No keys to leak, no credentials to rotate,
                                        no account signup friction.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-light mb-2">Cryptographic Verification</h3>
                                    <p className="text-gray-500 text-sm">
                                        On-chain payment proof eliminates chargebacks and fraud. Blockchain-native
                                        security for security data.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-light mb-2">Micropayment Economics</h3>
                                    <p className="text-gray-500 text-sm">
                                        Pay only for what you use. $0.01/query vs $89/month for unlimited.
                                        Perfect for sporadic security checks.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <div>
                                    <h3 className="text-lg font-light mb-2">Multi-Chain Support</h3>
                                    <p className="text-gray-500 text-sm">
                                        Pay with USDC on Base, Ethereum, or Solana. Agent chooses chain based on
                                        gas fees and liquidity.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Code Example */}
                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-4">Simple Integration</h3>
                            <div className="bg-black border border-gray-500 /25 rounded p-4 text-xs font-mono text-gray-300 overflow-x-auto mb-4">
                                <div className="text-gray-500">// Install SDK</div>
                                <div className="text-cyan">npm install kamiyo-x402-sdk</div>
                                <br/>
                                <div className="text-gray-500">// Query latest exploits</div>
                                <div><span className="text-magenta">const</span> client = <span className="text-cyan">new</span> <span className="text-yellow-400">KamiyoClient</span>();</div>
                                <div><span className="text-magenta">const</span> exploits = <span className="text-magenta">await</span> client.<span className="text-yellow-400">get</span>(<span className="text-green-400">'/exploits/latest-alert'</span>);</div>
                                <br/>
                                <div className="text-gray-500">// SDK handles 402 response and USDC payment automatically</div>
                                <div><span className="text-magenta">if</span> (exploits.alert) {'{'}</div>
                                <div>  console.<span className="text-yellow-400">warn</span>(<span className="text-green-400">`New exploit: ${'{'}exploits.protocol{'}'}`</span>);</div>
                                <div>  <span className="text-magenta">await</span> pauseTrading(exploits.chain);</div>
                                <div>{'}'}</div>
                            </div>
                            <p className="text-gray-500 text-sm">
                                That's it. No API keys, no auth flows, no account management. Just instant security intelligence.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Use Cases */}
                <section className="w-full px-5 mx-auto pt-16 pb-16 border-t border-gray-500 /25 max-w-[1400px]">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-light mb-4">Who Uses KAMIYO?</h2>
                        <p className="text-gray-400 text-lg">Security intelligence for the entire crypto ecosystem</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">AI Trading Agents</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Check protocol safety before executing trades. Pause trading when exploits detected.
                                Integrate security checks into autonomous trading strategies.
                            </p>
                            <ul className="text-gray-600 text-xs space-y-1">
                                <li>• Pre-trade security validation</li>
                                <li>• Automatic trade pausing on exploits</li>
                                <li>• Protocol risk assessment</li>
                            </ul>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">DeFi Protocol Teams</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Monitor competitor exploits. Learn from security incidents. Get alerted when similar
                                protocols are compromised. Build safer products.
                            </p>
                            <ul className="text-gray-600 text-xs space-y-1">
                                <li>• Competitor incident monitoring</li>
                                <li>• Pattern analysis</li>
                                <li>• Security best practices</li>
                            </ul>
                        </div>

                        <div className="bg-black border border-gray-500 /25 rounded-lg p-6">
                            <h3 className="text-xl font-light mb-3">Security Researchers</h3>
                            <p className="text-gray-500 text-sm mb-4">
                                Access aggregated exploit data from 20+ sources. Historical analysis, pattern detection,
                                trend identification. Build better detection systems.
                            </p>
                            <ul className="text-gray-600 text-xs space-y-1">
                                <li>• Multi-source aggregation</li>
                                <li>• Historical analysis</li>
                                <li>• Pattern detection</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section className="w-full px-5 mx-auto pt-16 pb-16 border-t border-gray-500 /25 max-w-[1400px]">
                    <div className="max-w-3xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-light mb-6">Ready to Secure Your AI Agents?</h2>
                        <p className="text-gray-400 text-lg mb-8">
                            Subscribe to MCP for unlimited queries, or use x402 API pay-per-query.
                        </p>
                        <div className="flex flex-col md:flex-row gap-4 justify-center">
                            <PayButton
                                textOverride="Subscribe to MCP"
                                onClickOverride={() => router.push('/pricing')}
                            />
                            <button
                                onClick={() => router.push('/api-docs')}
                                className="px-6 py-3 border border-gray-500 border-opacity-50 rounded-lg hover:border-cyan transition-colors text-sm"
                            >
                                x402 API Documentation
                            </button>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <FAQ />
            </div>
        </>
    );
}
