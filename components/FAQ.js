// components/FAQ.js
import { useState } from 'react';
import PayButton from './PayButton';

const faqs = [
    {
        question: 'How is KAMIYO different from X alerts?',
        answer: 'X alerts from @PeckShield and @CertiK are inconsistent (15 mins to 4+ hours) and require following multiple accounts. KAMIYO provides consistent 4-minute alerts from 20+ sources in one place, with API access and filtering.'
    },
    {
        question: 'Why not just use CertiK or other security firms?',
        answer: 'CertiK and similar firms focus on audits ($50k-200k) and enterprise sales. KAMIYO is a developer-first product you can sign up for in 30 seconds, with pricing starting at $0.'
    },
    {
        question: 'What\'s the difference between Free and Pro?',
        answer: 'Free tier shows exploit data with a 24-hour delay. Pro gives you real-time alerts (< 5 minutes), API access, WebSocket feed, and unlimited historical data for $99/month.'
    },
    {
        question: 'How fast are the alerts really?',
        answer: 'Average detection time is 4 minutes from when an exploit happens. Pro users get alerted immediately. Free users see the same data with a 24-hour delay.'
    },
    {
        question: 'Can I integrate this into my trading bot?',
        answer: 'Yes! Pro plan includes full REST API (50,000 req/day) and WebSocket access. Check our API docs for integration guides.'
    },
    {
        question: 'What chains do you cover?',
        answer: 'We track 54+ chains including Ethereum, BSC, Arbitrum, Polygon, Cosmos, Osmosis, and more. New chains added regularly.'
    },
    {
        question: 'How do you verify exploits?',
        answer: 'We only report confirmed exploits with transaction hashes from 20+ trusted sources (Rekt News, security firms, on-chain data). No speculation or predictions.'
    },
    {
        question: 'Can I cancel anytime?',
        answer: 'Yes, cancel anytime from your dashboard. No contracts, no hassles. Your data access continues until the end of your billing period.'
    }
];

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState(null);

    return (
        <section className="w-full px-5 mx-auto py-16 border-t border-gray-500 border-opacity-25" style={{ maxWidth: '1400px' }}>
            <div className="text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-light mb-4">Frequently Asked Questions</h2>
                <p className="text-gray-400 text-lg">Everything you need to know about KAMIYO</p>
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
    );
}
