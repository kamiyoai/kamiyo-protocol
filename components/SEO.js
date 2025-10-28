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
  title = "x402 Payment Facilitator | HTTP 402 Payment Required for AI Agents",
  description = "KAMIYO is the leading x402 Payment Facilitator implementing HTTP 402 Payment Required for autonomous AI agents. Enable seamless on-chain API payments with USDC across Base, Ethereum, and Solana blockchains. AI agent payments without account signup, powered by cryptographic verification and blockchain technology.",
  keywords = [
    "HTTP 402 Payment Required",
    "x402 protocol",
    "x402 Payment Facilitator",
    "AI agent payments",
    "on-chain API payments",
    "autonomous agent payments",
    "blockchain API billing",
    "USDC API payments",
    "cryptocurrency API",
    "payment facilitator",
    "Web3 payments",
    "decentralized API payments",
    "smart contract payments",
    "Base blockchain payments",
    "Ethereum API payments",
    "Solana payments",
    "crypto payment gateway",
    "AI agent billing",
    "autonomous payment systems",
    "blockchain payment protocol"
  ],
  canonical = "https://kamiyo.io",
  ogImage = "https://kamiyo.io/media/KAMIYO_OpenGraphImage.png",
  ogType = "website",
  schemaData = null,
  noindex = false,
  twitterCard = "summary_large_image"
}) {
  const defaultSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "KAMIYO",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "x402 Payment Facilitator platform implementing HTTP 402 Payment Required for autonomous AI agents with on-chain API payments using USDC",
    "url": "https://kamiyo.io",
    "offers": [
      {
        "@type": "Offer",
        "name": "Free Tier",
        "price": "0",
        "priceCurrency": "USD",
        "description": "x402 pay-per-use access with 1K API calls per day"
      },
      {
        "@type": "Offer",
        "name": "Pro Tier",
        "price": "89",
        "priceCurrency": "USD",
        "description": "50K API calls per day with WebSocket connections and JavaScript SDK access"
      },
      {
        "@type": "Offer",
        "name": "Team Tier",
        "price": "199",
        "priceCurrency": "USD",
        "description": "100K API calls per day with multiple API keys and analytics dashboard"
      },
      {
        "@type": "Offer",
        "name": "Enterprise Tier",
        "price": "499",
        "priceCurrency": "USD",
        "description": "Unlimited API calls with custom payment integrations and 99.9% SLA"
      }
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "127"
    },
    "featureList": [
      "HTTP 402 Payment Required implementation",
      "x402 protocol support",
      "On-chain API payments with USDC",
      "Multi-chain support (Base, Ethereum, Solana)",
      "No account signup required",
      "Autonomous AI agent payments",
      "Cryptographic payment verification",
      "Real-time payment tracking",
      "JavaScript SDK for developers",
      "WebSocket connections",
      "Usage analytics dashboard"
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
