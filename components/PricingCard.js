// components/PricingCard.js
import PayButton from './PayButton';

/**
 * Reusable pricing card component for MCP and x402 tiers
 * Used on homepage and pricing page for consistency
 */
export default function PricingCard({ plan, isHighlighted = false, onSelect, isRedirecting = false }) {
    const { name, price, priceDetail, tier, features } = plan;

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
                                ? 'Add to Claude Desktop'
                                : tier === 'team'
                                    ? 'Start Free Trial'
                                    : tier === 'enterprise'
                                        ? 'Contact Sales'
                                        : 'View API Docs'
                    }
                    onClickOverride={onSelect}
                    disabled={isRedirecting}
                    title={`${name} Plan: ${price} ${priceDetail}`}
                />
            </div>
        </div>
    );
}
