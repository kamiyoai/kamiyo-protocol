// components/FAQ.js
import { useState } from 'react';
import Head from 'next/head';
import PayButton from './PayButton';

const faqs = [
  // SECURITY INTELLIGENCE (4 questions)
  {
    question: "How quickly do you detect crypto exploits?",
    answer: "KAMIYO aggregates from 20+ security researchers including CertiK, PeckShield, BlockSec, and SlowMist. Most exploits are detected and indexed within 5-15 minutes of the first public report. Critical exploits (>$1M) trigger immediate alerts to MCP subscribers."
  },
  {
    question: "What sources do you aggregate exploit data from?",
    answer: "We monitor 20+ leading security sources: CertiK, PeckShield, BlockSec, SlowMist, Chainalysis, Immunefi, Rekt News, DefiLlama, and 12+ others. Each source is scored on speed, accuracy, and exclusivity. Our proprietary algorithm ranks sources so you know which reports to trust most."
  },
  {
    question: "What blockchains and protocols do you cover?",
    answer: "KAMIYO tracks exploits across 15+ chains including Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Solana, Avalanche, and more. We monitor all major DeFi protocols (Uniswap, Aave, Compound, Curve, etc.) plus thousands of smaller projects. Historical database covers 2+ years of incidents tracking $2.1B+ in losses."
  },
  {
    question: "How accurate is your exploit data?",
    answer: "All exploit reports are cross-referenced across multiple sources before indexing. We track source accuracy rates and flag unconfirmed reports. For critical exploits (>$10M), we require confirmation from at least 2 trusted sources. Our source quality scoring algorithm gives you transparency into data reliability."
  },

  // MCP INTEGRATION (3 questions)
  {
    question: "How do I add KAMIYO to Claude Desktop?",
    answer: "Subscribe to a KAMIYO MCP plan at kamiyo.ai/pricing. After payment, you'll receive your MCP subscription key. Open Claude Desktop → Settings → MCP Servers → Add Server, and paste your key. Claude can now call KAMIYO security tools like check_latest_exploits() and assess_protocol_risk() during conversations."
  },
  {
    question: "What's included in MCP subscriptions?",
    answer: "MCP subscriptions include unlimited security intelligence queries via Claude Desktop or any MCP-compatible AI agent. Personal ($19/mo): 1 AI agent. Team ($99/mo): 5 concurrent agents, team workspace, webhook notifications. Enterprise ($299/mo): Unlimited agents, custom tools, SLA guarantees, dedicated support."
  },
  {
    question: "Which MCP tools are available?",
    answer: "KAMIYO MCP server provides: check_latest_exploits() for recent incidents, assess_protocol_risk() for historical analysis, check_wallet_involvement() for address screening, query_exploit_history() for filtered searches, and get_source_rankings() for source credibility. Enterprise plans can request custom tool development."
  },

  // x402 API (2 questions)
  {
    question: "Can I use the API without a subscription?",
    answer: "Yes! The x402 API is pay-per-query at $0.01 per exploit query. No account required - just send your query to kamiyo.ai/exploits/latest-alert, receive 402 payment instructions, pay $0.01 USDC on Base/Ethereum/Solana, and get your data. Payment tokens are valid for 24 hours for subsequent queries."
  },
  {
    question: "MCP subscription vs x402 API - which should I use?",
    answer: "Use MCP subscription if you're running AI agents (Claude, AutoGPT, etc.) that need unlimited security queries integrated into their decision-making. Use x402 API if you're building custom integrations, making sporadic queries, or prefer pay-per-use pricing. Both provide the same real-time exploit intelligence from 20+ sources."
  }
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState(null);

    // Generate JSON-LD structured data for FAQPage
    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
            }
        }))
    };

    return (
        <>
            <Head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
                />
            </Head>
            <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }}>
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-light mb-4">Frequently Asked Questions</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Everything you need to know about KAMIYO Security Intelligence</p>
                </div>

                <div className="max-w-3xl mx-auto space-y-4 mb-12">
                    {faqs.map((faq, index) => (
                        <div
                            key={index}
                            className={`bg-black border border-gray-500 border-opacity-25 rounded-lg transition-all duration-300 cursor-pointer ${
                                openIndex === index ? 'border-cyan' : 'hover:border-opacity-50'
                            }`}
                            onClick={() => setOpenIndex(openIndex === index ? null : index)}
                        >
                            <div className="flex items-center justify-between p-6">
                                <h3 className="text-lg font-light text-gray-300 pr-4">{faq.question}</h3>
                                <span className="text-2xl text-cyan font-light flex-shrink-0">
                                    {openIndex === index ? '−' : '+'}
                                </span>
                            </div>
                            {openIndex === index && (
                                <div className="px-6 pb-6 text-gray-400 leading-relaxed">
                                    {faq.answer}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex flex-col items-center">
                    <p className="text-gray-400 mb-6">Still have questions?</p>
                    <PayButton
                        textOverride="Contact Us"
                        onClickOverride={() => {
                            window.location.href = '/inquiries';
                        }}
                    />
                </div>
            </section>
        </>
    );
}
