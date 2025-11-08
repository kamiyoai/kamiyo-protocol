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
  title = "x402 Infrastructure - Multi-Chain USDC Payment Verification API | KAMIYO",
  description = "Verify USDC payments across Solana, Base, Ethereum, Polygon and more. Simple API for payment verification. 99.9% uptime, responses under 500ms. Start with 1,000 free verifications per month.",
  keywords = [
    "USDC payment verification",
    "crypto payment API",
    "blockchain payment verification",
    "multi-chain payment API",
    "Solana payment verification",
    "Base payment verification",
    "Ethereum payment verification",
    "crypto micropayments",
    "API monetization",
    "pay per use API",
    "blockchain transaction verification",
    "USDC API",
    "crypto payment infrastructure",
    "payment verification service",
    "AI agent payments",
    "ERC-8004 payments",
    "autonomous payments",
    "crypto payment gateway alternative",
    "blockchain payment confirmation",
    "transaction verification API"
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
    "@type": "SoftwareApplication",
    "name": "x402 Infrastructure",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web",
    "description": "API for verifying USDC payments across multiple blockchains. Simple payment verification for developers.",
    "url": "https://kamiyo.ai",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Tier",
        "price": "0",
        "priceCurrency": "USD",
        "description": "1,000 payment verifications per month, 2 blockchain networks"
      },
      {
        "@type": "Offer",
        "name": "Starter",
        "price": "99",
        "priceCurrency": "USD",
        "description": "50,000 verifications per month, 3 chains, email support"
      },
      {
        "@type": "Offer",
        "name": "Pro",
        "price": "299",
        "priceCurrency": "USD",
        "description": "500,000 verifications per month, 6 chains, priority support, risk scoring"
      },
      {
        "@type": "Offer",
        "name": "Enterprise",
        "price": "999",
        "priceCurrency": "USD",
        "description": "Unlimited verifications, all chains, dedicated support, custom SLA"
      }
    ],
    "featureList": [
      "Multi-chain USDC payment verification",
      "Support for Solana, Base, Ethereum, Polygon, Arbitrum, Optimism",
      "99.9% uptime",
      "Responses under 500ms",
      "Python and JavaScript SDKs",
      "TypeScript support",
      "Transaction risk scoring",
      "ERC-8004 AI agent payment support",
      "Real-time payment confirmation",
      "Usage analytics dashboard",
      "Fraud detection",
      "API key management"
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
