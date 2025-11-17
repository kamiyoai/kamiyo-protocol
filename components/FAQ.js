// components/FAQ.js
import { useState } from 'react';
import Head from 'next/head';
import PayButton from './PayButton';

const faqs = [
  // x402 BASICS (3 questions)
  {
    question: "What is x402 Infrastructure?",
    answer: "x402 Infrastructure is a production-ready API for verifying USDC payments across multiple blockchains. When a user sends you USDC on any supported chain, you submit the transaction hash to our API and we instantly verify the payment happened with the correct amount and recipient. No need to manage RPC endpoints, parse transactions, or understand blockchain protocols."
  },
  {
    question: "Which blockchains are supported?",
    answer: "x402 Infrastructure supports 8+ blockchain networks: Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, and more. All networks use USDC for payments. One API call works across all chains - no need to integrate with each network separately."
  },
  {
    question: "How fast is payment verification?",
    answer: "Average verification response time is under 500ms. We query the blockchain, confirm the transaction exists with correct amount and recipient, check confirmation count, and return results. Production infrastructure runs with 99.9% uptime SLA."
  },

  // INTEGRATION (3 questions)
  {
    question: "How do I integrate x402 into my API?",
    answer: "Integration takes about 10 minutes. Step 1: Sign up at kamiyo.ai/x402 and get your API key. Step 2: Install our Python SDK (pip install x402) or JavaScript SDK (npm install @x402/sdk). Step 3: When a user claims they paid, call client.verify_payment() with the transaction hash and chain. Step 4: Grant or deny access based on verification result."
  },
  {
    question: "Do I need blockchain expertise?",
    answer: "No blockchain knowledge required. We handle all complexity: RPC endpoints, transaction parsing, confirmation requirements, gas fees, and network differences. You just call our API with a transaction hash and get back a simple verified true/false response with payment details."
  },
  {
    question: "What about fraud and payment manipulation?",
    answer: "Pro and Enterprise tiers include transaction risk scoring to detect suspicious patterns. We analyze transaction history, confirmation depth, and on-chain behavior. Free and Starter tiers get basic verification (amount, recipient, confirmations). All tiers check that payments actually happened on-chain before returning success."
  },

  // PRICING & PLANS (3 questions)
  {
    question: "How much does x402 Infrastructure cost?",
    answer: "Free tier includes 1,000 verifications per month on 2 chains (Solana & Base). Paid plans: Starter $99/mo for 50K verifications on 3 chains, Pro $299/mo for 500K verifications on 6 chains, Enterprise $999/mo for unlimited verifications on all chains. All plans include Python & JavaScript SDKs, API access, and production infrastructure."
  },
  {
    question: "What happens if I exceed my verification limit?",
    answer: "If you hit your monthly verification limit, additional requests will return a rate limit error. You can upgrade your plan anytime from the dashboard. Unused verifications do not roll over to the next month. Enterprise plans have no verification limits."
  },
  {
    question: "Can AI agents use x402 for payments?",
    answer: "Yes. x402 Infrastructure supports the ERC-8004 standard for AI agent payments. Autonomous agents can verify their own USDC payments before accessing services. This enables true machine-to-machine payments without human intervention."
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
            <section className="w-full px-5 mx-auto py-16" style={{ maxWidth: '1400px' }}>
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-light mb-4">Frequently Asked Questions</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Everything you need to know about x402 Infrastructure</p>
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
