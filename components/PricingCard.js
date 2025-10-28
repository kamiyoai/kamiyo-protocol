// components/PricingCard.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import PayButton from './PayButton';

/**
 * Reusable pricing card component for MCP and x402 tiers
 * Used on homepage and pricing page for consistency
 */
export default function PricingCard({ plan, isHighlighted = false }) {
    const { name, price, priceDetail, tier, features } = plan;
    const [isRedirecting, setIsRedirecting] = useState(false);
    const router = useRouter();
    const { data: session } = useSession();

    const handleSelect = async () => {
        // Special cases: Enterprise and x402
        if (tier === 'enterprise') {
            router.push('/inquiries');
            return;
        }

        if (tier === 'x402') {
            router.push('/api-docs');
            return;
        }

        // Stripe checkout for personal/team
        setIsRedirecting(true);

        try {
            const response = await fetch('/api/billing/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: tier,
                    user_email: session?.user?.email,
                    success_url: `${window.location.origin}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: window.location.href
                })
            });

            if (!response.ok) {
                throw new Error('Checkout failed');
            }

            const { checkout_url } = await response.json();
            window.location.href = checkout_url;

        } catch (error) {
            console.error('Checkout error:', error);
            alert('Unable to start checkout. Please try again or contact support.');
            setIsRedirecting(false);
        }
    };

    return (
        <div
            className={`relative bg-black border ${isHighlighted ? 'border-cyan' : 'border-gray-500 border-opacity-25'} rounded-lg p-6 card ${isHighlighted ? '-translate-y-1' : ''} hover:-translate-y-1 transition-all duration-300 flex flex-col`}
            itemScope
            itemType="https://schema.org/Offer"
        >
            {isHighlighted && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-cyan to-magenta text-white text-xs uppercase tracking-wider px-3 py-1 rounded-full">
                        Most Popular
                    </span>
                </div>
            )}

            <h3 className="text-xl font-light mb-2" itemProp="name">{name}</h3>

            <div className="mb-6" itemProp="priceSpecification" itemScope itemType="https://schema.org/PriceSpecification">
                <span className="text-4xl font-light gradient-text" itemProp="price">{price}</span>
                <span className="text-gray-500 text-xs ml-1" itemProp="priceCurrency" content="USD">{priceDetail}</span>
            </div>

            <ul className="space-y-2 mb-6 text-xs flex-grow" role="list">
                {features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                        <svg className="w-3 h-3 text-cyan mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-300">{feature}</span>
                    </li>
                ))}
            </ul>

            <meta itemProp="availability" content="https://schema.org/InStock" />
            <meta itemProp="url" content={`https://kamiyo.io/pricing#${tier}`} />

            <div className="flex justify-center mt-auto pt-6">
                <PayButton
                    textOverride={
                        isRedirecting
                            ? 'Processing...'
                            : tier === 'personal'
                                ? 'Subscribe - $19/mo'
                                : tier === 'team'
                                    ? 'Subscribe - $99/mo'
                                    : tier === 'enterprise'
                                        ? 'Contact Sales'
                                        : 'View API Docs'
                    }
                    onClickOverride={handleSelect}
                    disabled={isRedirecting}
                    title={`${name} Plan: ${price} ${priceDetail}`}
                />
            </div>
        </div>
    );
}
