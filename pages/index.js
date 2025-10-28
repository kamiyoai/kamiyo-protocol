// pages/index.js
import { useState, useEffect } from "react";
import StatsCard from "../components/dashboard/StatsCard";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import SEO from "../components/SEO";
import { useRouter } from "next/router";

export default function Home() {
    const router = useRouter();

    return (
        <>
            <SEO />
            <div className="text-white bg-black min-h-screen">
                {/* Hero Section */}
                <section className="w-full border-b border-gray-500 border-opacity-25 bg-black">
                <div className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 max-w-[1400px]">
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only">KAMIYO: Security Intelligence for AI Agents via MCP & x402</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <h2 className="text-3xl md:text-4xl lg:text-5xl font-light mb-4 leading-tight text-white">
                                    Security Intelligence for AI Agents
                                </h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed">
                                    Subscribe via MCP for unlimited queries, or pay $0.01 per query with x402. Aggregating exploits from 20+ sources. $2.1B stolen in H1 2025 - know before you deploy.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    20+ Exploit Sources
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Real-Time Alerts
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    $0.01 per Query via x402
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    No API Keys Required
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-col md:flex-row md:flex-wrap gap-6 items-center md:justify-between">
                                <div className="scale-110 md:origin-left md:ml-8">
                                    <PayButton
                                        textOverride="Add to Claude Desktop"
                                        onClickOverride={() => {
                                            window.location.href = '/api-docs';
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        window.location.href = '/api-docs';
                                    }}
                                    className="text-xs uppercase tracking-wider hover:opacity-80 transition-opacity duration-300 md:mr-5"
                                    style={{ color: '#ff44f5' }}
                                    title="View API documentation for MCP and x402"
                                    aria-label="View API documentation"
                                >
                                    View API Docs
                                </button>
                            </div>

                        </article>

                        {/* Right column: Video (hidden on mobile) */}
                        <div className="hidden md:flex justify-center md:justify-end">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-auto"
                                style={{ height: '24rem', filter: 'saturate(2.0) contrast(1.2)' }}
                                aria-label="KAMIYO Security Intelligence demonstration for AI agents via MCP and x402"
                                title="Security intelligence for AI agents via MCP and x402"
                            >
                                <source src="/media/pfn_x_42.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500 border-opacity-25 max-w-[1400px]" aria-labelledby="pricing-heading">
                <header className="text-center mb-12">
                    <h2 id="pricing-heading" className="text-3xl md:text-4xl lg:text-5xl font-light mb-4">Security Intelligence Pricing</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Pay-per-query via x402 or subscribe for unlimited access. Your choice.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                    {/* Free Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Free</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$0</span>
                            <span className="text-gray-500 text-xs ml-1">forever</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">24h delayed exploit data</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">1K queries/day</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">x402 pay-per-query ($0.01/query)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">No API keys or account required</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Sign Up Free"
                                onClickOverride={() => {
                                    window.location.href = '/auth/signin';
                                }}
                                title="Start using security intelligence for free - no credit card required"
                            />
                        </div>
                    </div>

                    {/* Pro Tier - Highlighted */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card card-highlighted -translate-y-1 transition-all duration-300 flex flex-col">
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                                Most Popular
                            </span>
                        </div>
                        <h3 className="text-xl font-light mb-2">Pro</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$89</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Free</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">50K queries/day (real-time exploit data)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">WebSocket connections</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">JavaScript SDK access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Email support</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Start Free Trial"
                                onClickOverride={() => {
                                    window.location.href = '/pricing';
                                }}
                                title="Start Pro plan trial - 50K API calls per day with HTTP 402 Payment Required"
                            />
                        </div>
                    </div>

                    {/* Team Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Team</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-light gradient-text">$199</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Pro</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">100K queries/day (real-time exploit data)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Multiple API keys</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Usage analytics dashboard</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Priority support</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Start Free Trial"
                                onClickOverride={() => {
                                    window.location.href = '/pricing';
                                }}
                                title="Start Team plan trial - 100K API calls per day with on-chain API payments"
                            />
                        </div>
                    </div>

                    {/* Enterprise Tier */}
                    <div className="relative bg-black border border-gray-500 border-opacity-25 rounded-lg p-6 card hover:-translate-y-1 transition-all duration-300 flex flex-col">
                        <h3 className="text-xl font-light mb-2">Enterprise</h3>
                        <div className="mb-6">
                            <span className="text-gray-400 text-xs">from </span>
                            <span className="text-4xl font-light gradient-text">$499</span>
                            <span className="text-gray-500 text-xs ml-1">/mo</span>
                        </div>

                        <ul className="space-y-2 mb-6 text-xs flex-grow">
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Everything in Team</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Unlimited queries (real-time exploit data)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Custom payment integrations</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">99.9% SLA guarantee</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">Dedicated support engineer</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Contact Sales"
                                onClickOverride={() => {
                                    window.location.href = '/inquiries';
                                }}
                                title="Contact sales for Enterprise security intelligence solutions"
                            />
                        </div>
                    </div>
                </div>

            </section>

            {/* Security Intelligence Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500 border-opacity-25 max-w-[1400px]" aria-labelledby="ai-agents-heading">
                <header className="text-center mb-12">
                    <h2 id="ai-agents-heading" className="text-3xl md:text-4xl lg:text-5xl font-light mb-4">Built for AI Agents</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Option 1: Add to Claude Desktop (MCP) | Option 2: Pay per query (x402)</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">1. Discover</div>
                        <div className="text-gray-400 text-sm mb-4">
                            AI agent makes API request and receives HTTP 402 Payment Required response with payment details
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-cyan">HTTP/1.1 402 Payment Required</span><br/>
                            <span className="text-magenta">X-Payment-Amount:</span> <span className="text-yellow-400">0.01 USDC</span><br/>
                            <span className="text-magenta">X-Payment-Chain:</span> <span className="text-yellow-400">base</span>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">2. Pay</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Agent sends USDC payment on Base, Ethereum, or Solana. No account signup required
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-cyan">Transfer</span> <span className="text-yellow-400">0.01 USDC</span><br/>
                            <span className="text-magenta">To:</span> <span className="text-gray-400">0x742d...7b7b7</span><br/>
                            <span className="text-magenta">Chain:</span> <span className="text-yellow-400">Base</span>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">3. Access</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Agent receives access token good for 100 API calls (24 hours). Automatic verification
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-magenta">X-Payment-Token:</span> <span className="text-cyan">kmy_...</span><br/>
                            <span className="text-magenta">Requests:</span> <span className="text-yellow-400">100</span><br/>
                            <span className="text-magenta">Expires:</span> <span className="text-yellow-400">24h</span>
                        </div>
                    </div>
                </div>

                <article className="text-center mb-16">
                    <h3 className="text-2xl font-light mb-6">Why Security Intelligence via MCP & x402?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">MCP Integration</div>
                                <div className="text-gray-500 text-sm">Add to Claude Desktop for unlimited security queries</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">x402 Pay-Per-Query</div>
                                <div className="text-gray-500 text-sm">No account needed, pay $0.01 per query with USDC</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Real-Time Security Data</div>
                                <div className="text-gray-500 text-sm">20+ exploit sources, $0.01 per query, 100 queries per $1 USDC</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Multi-chain support</div>
                                <div className="text-gray-500 text-sm">Base, Ethereum, Solana – agent chooses</div>
                            </div>
                        </div>
                    </div>
                </article>

                <article className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-8 max-w-3xl mx-auto">
                    <h3 className="text-2xl font-light mb-4 text-center">For AI Agent Developers</h3>
                    <p className="text-gray-400 text-center mb-6">
                        Integrate KAMIYO security intelligence via MCP or x402
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <div className="text-cyan mb-2 font-semibold">Option 1: MCP Integration</div>
                            <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500">// Add to Claude Desktop</div>
                                <div className="text-cyan">claude mcp add kamiyo</div>
                                <br/>
                                <div className="text-gray-500">// Unlimited queries</div>
                                <div className="text-yellow-400">$19-299/mo</div>
                            </div>
                        </div>
                        <div>
                            <div className="text-cyan mb-2 font-semibold">Option 2: x402 API</div>
                            <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                <div className="text-gray-500">// Install SDK</div>
                                <div className="text-cyan">npm install kamiyo-x402-sdk</div>
                                <br/>
                                <div className="text-gray-500">// Pay per query</div>
                                <div className="text-yellow-400">$0.01 per query</div>
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-6">
                        <a
                            href="/api-docs"
                            className="text-cyan hover:text-magenta transition-colors"
                            title="View complete API documentation for MCP and x402"
                            aria-label="Navigate to KAMIYO API documentation"
                        >
                            View API Documentation →
                        </a>
                    </div>
                </article>
            </section>

            {/* Social Proof & Features Section */}
            <section className="w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500 border-opacity-25 max-w-[1400px]" aria-labelledby="features-heading">
                {/* Trusted By */}
                <div className="text-center mb-16">
                    <h3 className="text-gray-500 text-sm uppercase tracking-wider mb-6">Trusted By</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">AI Agent Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">API Providers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Autonomous System Builders</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Web3 Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Blockchain Infrastructure Teams</span>
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Instant API Access</h3>
                        <p className="text-gray-500 text-sm">
                            AI agents discover APIs, pay with USDC on-chain, and get instant access without signup or API keys
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">On-Chain Verification</h3>
                        <p className="text-gray-500 text-sm">
                            Cryptographic payment proof via blockchain transactions eliminates chargebacks and credential leaks
                        </p>
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-light mb-3 gradient-text">Developer-Friendly SDK</h3>
                        <p className="text-gray-500 text-sm">
                            JavaScript SDK handles 402 responses and USDC payments automatically - just install and integrate
                        </p>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <FAQ />

            {/* Hidden SEO Content - Visually hidden but crawlable */}
            <section className="sr-only" aria-hidden="true">
                <h2>Security Intelligence for AI Agents via MCP and x402</h2>
                <article>
                    <h3>MCP Server for Claude Desktop</h3>
                    <p>
                        KAMIYO provides security intelligence for AI agents through MCP (Model Context Protocol) integration.
                        Add KAMIYO to Claude Desktop as an MCP server for unlimited access to real-time exploit data from 20+ sources.
                        MCP subscriptions start at $19/month for personal use, $99/month for teams, and $299/month for enterprises.
                        Perfect for AI agents that need continuous security monitoring without pay-per-query limitations.
                    </p>
                </article>
                <article>
                    <h3>x402 API for Direct Access</h3>
                    <p>
                        For developers who prefer pay-per-query pricing, KAMIYO offers x402 API access at $0.01 per query.
                        The x402 protocol enables autonomous AI agents to access security intelligence without account creation.
                        Pay with USDC on Base, Ethereum, or Solana blockchains. No API keys required, just on-chain payments.
                        Each payment token provides 100 queries valid for 24 hours.
                    </p>
                </article>
                <article>
                    <h3>Real-Time Crypto Exploit Intelligence</h3>
                    <p>
                        KAMIYO aggregates security intelligence from 20+ exploit sources including blockchain security firms,
                        on-chain analytics, and vulnerability databases. With $2.1B stolen in H1 2025, AI agents need real-time
                        exploit data before deploying smart contracts or interacting with DeFi protocols. KAMIYO provides this
                        critical security intelligence through both MCP subscriptions and x402 pay-per-query access.
                    </p>
                </article>
                <article>
                    <h3>Benefits for AI Agent Developers</h3>
                    <p>
                        AI agent security intelligence through MCP and x402 offers flexibility: Choose MCP for unlimited queries
                        with monthly billing, or x402 for pay-per-use at $0.01 per query. Both options provide the same real-time
                        exploit data from 20+ sources. MCP integrates directly into Claude Desktop, while x402 works with any
                        AI framework through our JavaScript SDK. Multi-chain support across Base, Ethereum, and Solana.
                    </p>
                </article>
                <article>
                    <h3>Claude Desktop Integration via MCP</h3>
                    <p>
                        KAMIYO's MCP server enables Claude Desktop users to access security intelligence directly within their
                        AI agent workflows. Simply add the KAMIYO MCP server to Claude Desktop and your AI agents gain unlimited
                        access to exploit data, vulnerability reports, and on-chain security analytics. Perfect for AI agent
                        developers building autonomous security monitoring systems.
                    </p>
                </article>
            </section>
        </div>
        </>
    );
}
