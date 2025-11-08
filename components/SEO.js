// components/SEO.js
import Head from 'next/head';
import PropTypes from 'prop-types';

/**
 * Comprehensive SEO Component for KAMIYO x402 Platform
 *
 * A reusable SEO component that handles all meta tags, Open Graph, Twitter Cards,
 * and JSON-LD structured data for optimal search engine optimization.
 *
 * @component
 * @example
 * // Basic usage with defaults
 * <SEO />
 *
 * @example
 * // Custom page SEO
 * <SEO
 *   title="API Documentation"
 *   description="Complete API docs for KAMIYO x402 payment system"
 *   canonical="https://kamiyo.ai/api-docs"
 * />
 *
 * @example
 * // With custom schema
 * <SEO
 *   title="Pricing Plans"
 *   schemaData={{
 *     "@context": "https://schema.org",
 *     "@type": "Product",
 *     "name": "KAMIYO Pro",
 *     "offers": {...}
 *   }}
 * />
 */
export default function SEO({
  title = "Verify Crypto Payments Across 12 Blockchains in One API Call | x402 by KAMIYO",
  description = "Stop building payment infrastructure. x402 verifies USDC payments on Solana, Base, Ethereum & 9 more chains. Sub-500ms responses. 99.9% uptime SLA. 1,000 free verifications/month. No RPC nodes required.",
  keywords = [
    "USDC payment verification API",
    "multi-chain crypto payment verification",
    "Solana USDC verification",
    "Base payment verification API",
    "Ethereum payment verification",
    "blockchain payment API",
    "crypto payment infrastructure",
    "verify crypto transactions",
    "USDC transaction verification",
    "payment verification service",
    "crypto payment gateway API",
    "blockchain transaction confirmation",
    "multi-chain payment API",
    "crypto micropayments API",
    "AI agent payment verification",
    "ERC-8004 payment protocol",
    "autonomous crypto payments",
    "pay-per-use API monetization",
    "crypto payment processing",
    "blockchain payment integration",
    "USDC API verification",
    "crypto payment developer tools",
    "payment verification SDK",
    "Polygon payment verification",
    "Arbitrum payment verification",
    "Optimism payment verification"
  ],
  canonical = "https://kamiyo.ai",
  ogImage = "https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png",
  ogType = "website",
  schemaData = null,
  noindex = false,
  twitterCard = "summary_large_image"
}) {
  const defaultSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://kamiyo.ai/#organization",
        "name": "KAMIYO",
        "url": "https://kamiyo.ai",
        "logo": {
          "@type": "ImageObject",
          "url": "https://kamiyo.ai/media/KAMIYO_OpenGraphImage.png",
          "width": 1200,
          "height": 630
        },
        "sameAs": [
          "https://github.com/kamiyo-ai",
          "https://twitter.com/KAMIYO"
        ]
      },
      {
        "@type": "WebSite",
        "@id": "https://kamiyo.ai/#website",
        "url": "https://kamiyo.ai",
        "name": "KAMIYO x402 Infrastructure",
        "publisher": {
          "@id": "https://kamiyo.ai/#organization"
        },
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://kamiyo.ai/api-docs?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://kamiyo.ai/#product",
        "name": "x402 Infrastructure",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Web",
        "description": "Multi-chain USDC payment verification API for developers. Verify crypto payments on Solana, Base, Ethereum and 9+ blockchains with one API call.",
        "url": "https://kamiyo.ai",
        "offers": [
          {
            "@type": "Offer",
            "name": "Free Tier",
            "price": "0",
            "priceCurrency": "USD",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "description": "1,000 payment verifications per month, 2 blockchain networks",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          },
          {
            "@type": "Offer",
            "name": "Starter",
            "price": "99",
            "priceCurrency": "USD",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "description": "50,000 verifications per month, 3 chains, email support",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          },
          {
            "@type": "Offer",
            "name": "Pro",
            "price": "299",
            "priceCurrency": "USD",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "description": "500,000 verifications per month, 6 chains, priority support, risk scoring",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          },
          {
            "@type": "Offer",
            "name": "Enterprise",
            "price": "999",
            "priceCurrency": "USD",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "description": "Unlimited verifications, all chains, dedicated support, custom SLA",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          }
        ],
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.8",
          "ratingCount": "127",
          "bestRating": "5",
          "worstRating": "1"
        },
        "featureList": [
          "Multi-chain USDC payment verification",
          "Support for Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, Celo, Gnosis, Moonbeam, Aurora",
          "99.9% uptime SLA",
          "Sub-500ms response times",
          "Python SDK with type hints",
          "JavaScript/TypeScript SDK",
          "Transaction risk scoring",
          "ERC-8004 AI agent payment support",
          "Real-time payment confirmation",
          "Usage analytics dashboard",
          "Fraud detection and prevention",
          "API key management with scopes",
          "Webhook support for events",
          "Multi-tenant architecture"
        ],
        "softwareVersion": "1.0.0",
        "releaseNotes": "Production-ready multi-chain payment verification API"
      },
      {
        "@type": "FAQPage",
        "@id": "https://kamiyo.ai/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is x402 Infrastructure?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "x402 Infrastructure is a multi-chain USDC payment verification API that allows developers to verify crypto payments across 12+ blockchains with a single API call. It eliminates the need to manage RPC nodes, parse transactions, or handle chain-specific logic."
            }
          },
          {
            "@type": "Question",
            "name": "Which blockchains does x402 support?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "x402 supports Solana, Base, Ethereum, Polygon, Arbitrum, Optimism, Avalanche, BNB Chain, Celo, Gnosis, Moonbeam, and Aurora. More chains are added regularly based on demand."
            }
          },
          {
            "@type": "Question",
            "name": "How fast are payment verifications?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "x402 provides sub-500ms response times with a 99.9% uptime SLA. Most verifications complete in under 300ms."
            }
          },
          {
            "@type": "Question",
            "name": "Do I need to manage RPC nodes?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. x402 handles all blockchain infrastructure, RPC endpoints, and transaction parsing. You only need to make a single API call with the transaction hash."
            }
          },
          {
            "@type": "Question",
            "name": "What is the pricing model?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "x402 offers four tiers: Free (1,000 verifications/month, $0), Starter (50,000 verifications/month, $99), Pro (500,000 verifications/month, $299), and Enterprise (unlimited, $999)."
            }
          }
        ]
      }
    ]
  };

  // Use custom schema or default
  const structuredData = schemaData || defaultSchema;

  // Process keywords - handle both array and string formats
  const keywordsString = Array.isArray(keywords)
    ? keywords.join(", ")
    : keywords;

  return (
    <Head>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywordsString} />

      {/* Viewport and Mobile Optimization */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="language" content="English" />
      <meta name="author" content="KAMIYO" />

      {/* Robots Meta Tag */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      )}

      {/* Canonical URL */}
      <link rel="canonical" href={canonical} />

      {/* Open Graph / Facebook Meta Tags */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:site_name" content="KAMIYO" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:url" content={canonical} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={title} />
      <meta name="twitter:site" content="@KAMIYO" />
      <meta name="twitter:creator" content="@KAMIYO" />

      {/* Additional SEO Meta Tags */}
      <meta name="format-detection" content="telephone=no" />
      <meta name="theme-color" content="#000000" />
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="msapplication-TileImage" content={ogImage} />

      {/* Favicon and Icons */}
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

      {/* Preconnect to External Domains for Performance */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

      {/* JSON-LD Structured Data */}
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
    </Head>
  );
}

// PropTypes validation for type checking and documentation
SEO.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  keywords: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.string),
    PropTypes.string
  ]),
  canonical: PropTypes.string,
  ogImage: PropTypes.string,
  ogType: PropTypes.string,
  schemaData: PropTypes.object,
  noindex: PropTypes.bool,
  twitterCard: PropTypes.oneOf(['summary', 'summary_large_image', 'app', 'player'])
};
