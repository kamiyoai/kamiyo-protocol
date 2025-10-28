// components/FAQ.js
import { useState } from 'react';
import Head from 'next/head';
import PayButton from './PayButton';

const faqs = [
    {
        question: 'What is x402 and how does it work?',
        answer: 'x402 is an implementation of the HTTP 402 Payment Required status code for AI agent payments. Instead of creating an account, your AI agent sends USDC on-chain (Base, Ethereum, or Solana), receives a payment token, and gets instant API access. The x402 protocol enables autonomous AI agents to discover, pay for, and use APIs without human intervention. No signup, no API keys, just cryptographic payment verification.'
    },
    {
        question: 'Why use x402 protocol instead of traditional API billing?',
        answer: 'Traditional APIs require account creation, credit cards, and API key management. The x402 protocol lets autonomous AI agents pay directly with USDC transfers - no human intervention needed. When an AI agent receives an HTTP 402 Payment Required response, it can automatically process payment and retry the request. Perfect for AI agents that discover and use APIs programmatically.'
    },
    {
        question: 'What\'s the difference between x402 and subscriptions?',
        answer: 'x402 is pay-per-use ($0.10/call) with USDC payments and no account required. Subscriptions ($89+/month) offer higher rate limits, traditional API key authentication, and better value for sustained high-volume usage. Choose based on your use case.'
    },
    {
        question: 'Which blockchains are supported for x402 payments?',
        answer: 'We accept USDC payments on Base, Ethereum, and Solana for x402 protocol transactions. Your AI agent can choose whichever chain is most convenient. All AI agent payments are verified on-chain with cryptographic proof, making the HTTP 402 Payment Required workflow completely trustless.'
    },
    {
        question: 'Can I integrate x402 into my AI agent?',
        answer: 'Yes! Our JavaScript SDK handles HTTP 402 Payment Required responses automatically. When your AI agent receives a 402 response, the SDK processes the payment via the x402 protocol, obtains the token, and retries the request - all without human intervention. Check our API docs for integration guides.'
    },
    {
        question: 'What APIs are available via x402 protocol?',
        answer: 'Currently we offer blockchain intelligence data as our example implementation - real-time information from 20+ sources across 54+ networks. The x402 payment system is designed to support any API that wants to enable AI agent payments using the HTTP 402 Payment Required standard.'
    },
    {
        question: 'How long do x402 payment tokens last?',
        answer: 'Payment tokens are valid for 24 hours and provide access based on the USDC amount paid. For example, $1 USDC gives you 1,000 API calls. Tokens are automatically verified on each request with cryptographic proof following the x402 protocol.'
    },
    {
        question: 'Can I use both x402 and subscriptions?',
        answer: 'Yes! Subscription users get API keys for traditional authentication. You can also use x402 payments if you prefer. The systems work independently - choose whichever method fits your workflow.'
    },
    {
        question: 'Is my payment data secure with x402?',
        answer: 'All x402 protocol payments are verified on-chain using public blockchain data. We never handle your private keys or wallet credentials. Payment verification is cryptographic and trustless - we only confirm the USDC transaction occurred on-chain following the HTTP 402 Payment Required standard.'
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
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-light mb-4">Frequently Asked Questions</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Everything you need to know about KAMIYO x402 Protocol</p>
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
