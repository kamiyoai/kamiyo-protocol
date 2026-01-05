// components/FAQ.js
import { useState } from 'react';
import Head from 'next/head';
import PayButton from './PayButton';

const faqs = [
  // BASICS
  {
    question: "What is KAMIYO?",
    answer: "KAMIYO is trust infrastructure for autonomous agents. When AI agents pay for services, funds are held in escrow until the service is delivered. If there's a dispute about quality, multi-oracle consensus determines a fair settlement. Agents build on-chain reputation through successful transactions."
  },
  {
    question: "How does escrow protection work?",
    answer: "When an agent requests a service, payment is locked in a Solana escrow PDA. The provider delivers the service, and the agent can release funds on success or trigger a dispute. Escrows have configurable time-locks and support SOL, USDC, and USDT."
  },
  {
    question: "What happens during a dispute?",
    answer: "Oracle panels score service quality from 0-100. The median score determines the refund percentage: 80-100% quality means full payment to provider, 50-79% means partial refund, below 50% means full refund to agent. Settlement is automatic and on-chain."
  },

  // INTEGRATION
  {
    question: "How do I integrate KAMIYO?",
    answer: "Install @kamiyo/sdk from npm. Create an agent identity with stake collateral, then use createAgreement() to lock funds before requesting services. Call release() on success or dispute() to trigger oracle arbitration. The SDK handles all Solana transaction building."
  },
  {
    question: "What's the agent identity system?",
    answer: "Agents have PDA-based identities on Solana with stake collateral. Reputation scores update based on transaction outcomes and dispute history. Agents with poor track records can be slashed."
  },
  {
    question: "Is this compatible with x402?",
    answer: "Yes. KAMIYO provides escrow protection for x402 payments. Use @kamiyo/x402-client to wrap standard x402 requests with escrow creation and automatic dispute triggering based on SLA violations."
  },

  // TECHNICAL
  {
    question: "Which networks are supported?",
    answer: "The core protocol runs on Solana mainnet. The escrow program handles SOL and SPL tokens (USDC, USDT). For payment verification across other chains, KAMIYO integrates with x402 facilitators on Base, Ethereum, Polygon, Arbitrum, and Optimism."
  },
  {
    question: "How are oracles selected?",
    answer: "Oracle panels are drawn from a registered pool with stake requirements. Oracles must stake SOL as collateral against malicious voting. Consistent outlier votes result in slashing. Panel size is configurable per dispute."
  },
  {
    question: "What are the fees?",
    answer: "Escrow creation: 0.1% (minimum 5,000 lamports). Dispute resolution: 1% protocol fee + 1% oracle reward pool. No fees on successful release. All fees go to the protocol treasury controlled by multi-sig."
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
                    <h2 className="text-3xl md:text-4xl font-light mb-4">FAQ</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Common questions about escrow, disputes, and integration</p>
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
