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
                <div className="w-full px-5 mx-auto py-16" style={{ maxWidth: '1400px' }}>
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only">x402 Payment Facilitator: HTTP 402 Payment Required for AI Agent Payments and On-Chain API Payments</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <h2 className="text-5xl md:text-6xl font-light mb-4 leading-tight text-white">
                                    On-chain x402 payments for autonomous AI agents
                                </h2>
                                <p className="text-gray-400 text-lg leading-relaxed">
                                    HTTP 402 Payment Required implementation. Pay with USDC on-chain without account signup. Built for AI agents that need instant API access.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    HTTP 402 Payment Required
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    USDC on Base, Ethereum, Solana
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    No account signup
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500 border-opacity-50 px-3 py-2 rounded-full">
                                    Built for AI agents
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-wrap gap-6 items-center justify-between">
                                <div className="scale-110 origin-left ml-8">
                                    <PayButton
                                        textOverride="View API Docs"
                                        onClickOverride={() => {
                                            window.location.href = '/api-docs';
                                        }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-xs uppercase tracking-wider hover:opacity-80 transition-opacity duration-300"
                                    style={{ color: '#ff44f5', marginRight: '20px' }}
                                    title="View x402 payment facilitator pricing plans for AI agent payments"
                                    aria-label="View pricing plans for HTTP 402 Payment Required implementation"
                                >
                                    View Pricing
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
                                aria-label="KAMIYO x402 Payment Facilitator demonstration showing HTTP 402 Payment Required implementation for autonomous AI agent payments"
                                title="x402 protocol implementation for on-chain API payments with USDC"
                            >
                                <source src="/media/pfn_x_42.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }} aria-labelledby="pricing-heading">
                <header className="text-center mb-12">
                    <h2 id="pricing-heading" className="text-4xl md:text-5xl font-light mb-4">x402 Payments Pricing</h2>
                    <p className="text-gray-400 text-lg">Pay-per-use with x402 or subscribe monthly. Your choice.</p>
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
                                <span className="text-gray-300">x402 pay-per-use access</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">1K API calls/day</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">USDC payments (Base/ETH/Solana)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-gray-300">No account required</span>
                            </li>
                        </ul>

                        <div className="flex justify-center mt-auto pt-6">
                            <PayButton
                                textOverride="Sign Up Free"
                                onClickOverride={() => {
                                    window.location.href = '/auth/signin';
                                }}
                                title="Start using x402 payment facilitator for free - no credit card required"
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
                                <span className="text-gray-300">50K API calls/day</span>
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
                                <span className="text-gray-300">100K API calls/day</span>
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
                                <span className="text-gray-300">Unlimited API calls</span>
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
                                title="Contact sales for Enterprise x402 payment facilitator solutions"
                            />
                        </div>
                    </div>
                </div>

            </section>

            {/* x402 payment facilitator Section */}
            <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }} aria-labelledby="ai-agents-heading">
                <header className="text-center mb-12">
                    <h2 id="ai-agents-heading" className="text-4xl md:text-5xl font-light mb-4">Built for AI Agents</h2>
                    <p className="text-gray-400 text-lg">x402 payment facilitator: On-chain payments without accounts</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">1. Discover</div>
                        <div className="text-gray-400 text-sm mb-4">
                            AI agent makes API request and receives HTTP 402 Payment Required response with payment details
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-cyan">HTTP/1.1 402 Payment Required</span><br/>
                            <span className="text-magenta">X-Payment-Amount:</span> <span className="text-yellow-400">0.10 USDC</span><br/>
                            <span className="text-magenta">X-Payment-Chain:</span> <span className="text-yellow-400">base</span>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">2. Pay</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Agent sends USDC payment on Base, Ethereum, or Solana. No account signup required
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-cyan">Transfer</span> <span className="text-yellow-400">0.10 USDC</span><br/>
                            <span className="text-magenta">To:</span> <span className="text-gray-400">0x742d...7b7b7</span><br/>
                            <span className="text-magenta">Chain:</span> <span className="text-yellow-400">Base</span>
                        </div>
                    </div>

                    <div className="bg-black border border-gray-500 border-opacity-25 rounded-lg p-6">
                        <div className="text-white text-lg mb-3">3. Access</div>
                        <div className="text-gray-400 text-sm mb-4">
                            Agent receives access token good for 1,000 API calls (24 hours). Automatic verification
                        </div>
                        <div className="bg-black border border-gray-500 border-opacity-25 rounded p-3 text-xs font-mono">
                            <span className="text-magenta">X-Payment-Token:</span> <span className="text-cyan">kmy_...</span><br/>
                            <span className="text-magenta">Requests:</span> <span className="text-yellow-400">1000</span><br/>
                            <span className="text-magenta">Expires:</span> <span className="text-yellow-400">24h</span>
                        </div>
                    </div>
                </div>

                <article className="text-center mb-16">
                    <h3 className="text-2xl font-light mb-6">Why x402 Payment Facilitator?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">No account creation</div>
                                <div className="text-gray-500 text-sm">AI agents can pay directly without signup flows</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Cryptographic verification</div>
                                <div className="text-gray-500 text-sm">On-chain payment proof, no API keys to leak</div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <svg className="w-6 h-6 text-cyan flex-shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <div className="text-white mb-1">Pay-per-use pricing</div>
                                <div className="text-gray-500 text-sm">$0.10 per call, 1000 requests per $1 USDC</div>
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
                        Integrate KAMIYO into your autonomous agents with our JavaScript SDK
                    </p>
                    <div className="bg-black border border-gray-500 border-opacity-25 rounded p-4 text-xs font-mono text-gray-300 overflow-x-auto">
                        <div className="text-gray-500">// Install SDK</div>
                        <div className="text-cyan">npm install kamiyo-x402-sdk</div>
                        <br/>
                        <div className="text-gray-500">// Use in your agent</div>
                        <div><span className="text-magenta">const</span> kamiyo = <span className="text-cyan">new</span> <span className="text-yellow-400">KamiyoClient</span>();</div>
                        <div><span className="text-magenta">const</span> exploits = <span className="text-magenta">await</span> kamiyo.<span className="text-yellow-400">getExploits</span>();</div>
                        <div className="text-gray-500">// SDK handles 402 responses and USDC payments automatically</div>
                    </div>
                    <div className="text-center mt-6">
                        <a
                            href="/api-docs"
                            className="text-cyan hover:text-magenta transition-colors"
                            title="View complete API documentation for HTTP 402 Payment Required implementation"
                            aria-label="Navigate to KAMIYO x402 API documentation"
                        >
                            View API Documentation →
                        </a>
                    </div>
                </article>
            </section>

            {/* Social Proof & Features Section */}
            <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }} aria-labelledby="features-heading">
                {/* Trusted By */}
                <div className="text-center mb-16">
                    <h3 className="text-gray-500 text-sm uppercase tracking-wider mb-6">Trusted By</h3>
                    <div className="flex flex-wrap justify-center gap-6">
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">AI Agent Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Trading Bot Developers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">DeFi Traders</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Security Researchers</span>
                        </div>
                        <div className="px-4 py-2 border border-gray-500 border-opacity-25 rounded-full">
                            <span className="text-sm text-gray-400">Protocol Teams</span>
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
                <h2>Understanding HTTP 402 Payment Required and x402 Protocol</h2>
                <article>
                    <h3>What is HTTP 402 Payment Required?</h3>
                    <p>
                        HTTP 402 Payment Required is an HTTP status code originally reserved for future digital payment systems.
                        KAMIYO implements this protocol as an x402 Payment Facilitator, enabling seamless on-chain API payments
                        for autonomous AI agents. When an AI agent makes an API request, the server returns HTTP 402 Payment Required
                        with payment details, allowing the agent to complete payment using USDC on Base, Ethereum, or Solana blockchains.
                    </p>
                </article>
                <article>
                    <h3>x402 Payment Facilitator Implementation</h3>
                    <p>
                        As a leading x402 Payment Facilitator, KAMIYO provides a complete implementation of HTTP 402 Payment Required
                        for AI agent payments. The x402 protocol enables autonomous agent payments without traditional account signup,
                        using cryptographic verification and blockchain transactions. AI agents can make on-chain API payments
                        instantly, receiving access tokens valid for thousands of API calls.
                    </p>
                </article>
                <article>
                    <h3>On-Chain API Payments for AI Agents</h3>
                    <p>
                        On-chain API payments represent the future of AI agent billing. KAMIYO's x402 payment facilitator platform
                        enables autonomous AI agents to discover APIs, receive HTTP 402 Payment Required responses, send USDC payments
                        on-chain, and gain immediate API access. This eliminates the need for account creation, API key management,
                        and traditional payment methods that don't work for autonomous agent payments.
                    </p>
                </article>
                <article>
                    <h3>Benefits of x402 for AI Agent Developers</h3>
                    <p>
                        AI agent payments through the x402 protocol offer significant advantages: no account signup friction,
                        cryptographic payment verification, pay-per-use pricing with USDC, multi-chain support across Base,
                        Ethereum, and Solana, and automated payment handling through the KAMIYO JavaScript SDK. The HTTP 402
                        Payment Required implementation ensures AI agents can autonomously access APIs without human intervention.
                    </p>
                </article>
                <article>
                    <h3>Blockchain API Billing and Payment Verification</h3>
                    <p>
                        KAMIYO's x402 Payment Facilitator uses blockchain technology for transparent, verifiable API billing.
                        On-chain API payments provide cryptographic proof of payment, eliminating chargebacks and fraud.
                        The HTTP 402 Payment Required protocol works seamlessly with USDC stablecoins on Base, Ethereum,
                        and Solana networks, enabling fast, low-cost AI agent payments globally.
                    </p>
                </article>
            </section>
        </div>
        </>
    );
}
