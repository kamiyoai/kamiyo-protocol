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
  title = "Security Intelligence for AI Agents | KAMIYO | MCP & x402",
  description = "Real-time crypto exploit intelligence for AI agents. Access via MCP subscription (Claude Desktop) or x402 API. Aggregating security data from 20+ sources including CertiK, PeckShield, BlockSec. $0.01 per query or unlimited with MCP.",
  keywords = [
    "crypto exploit intelligence",
    "AI agent security",
    "MCP server security",
    "Claude Desktop security",
    "real-time exploit detection",
    "DeFi security intelligence",
    "blockchain exploit database",
    "protocol risk assessment",
    "security intelligence API",
    "x402 security data",
    "CertiK API alternative",
    "crypto threat intelligence",
    "smart contract exploits",
    "DeFi hack database",
    "on-chain security monitoring",
    "AI security agent",
    "crypto security MCP",
    "exploit aggregation",
    "blockchain security alerts",
    "protocol vulnerability tracking"
  ],
  canonical = "https://kamiyo.ai",
  ogImage = "https://kamiyo.io/media/KAMIYO_OpenGraphImage.png",
  ogType = "website",
  schemaData = null,
  noindex = false,
  twitterCard = "summary_large_image"
}) {
  const defaultSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "KAMIYO Security Intelligence",
    "applicationCategory": "SecurityApplication",
    "operatingSystem": "Web, MCP",
    "description": "Real-time cryptocurrency exploit intelligence for AI agents via MCP subscriptions or x402 API",
    "url": "https://kamiyo.ai",
    "offers": [
      {
        "@type": "Offer",
        "name": "MCP Personal",
        "price": "19",
        "priceCurrency": "USD",
        "description": "Unlimited security intelligence queries for Claude Desktop and AI agents"
      },
      {
        "@type": "Offer",
        "name": "MCP Team",
        "price": "99",
        "priceCurrency": "USD",
        "description": "5 concurrent AI agents, team workspace, webhook notifications"
      },
      {
        "@type": "Offer",
        "name": "MCP Enterprise",
        "price": "299",
        "priceCurrency": "USD",
        "description": "Unlimited AI agents, custom tools, SLA guarantees, dedicated support"
      },
      {
        "@type": "Offer",
        "name": "x402 API",
        "price": "0.01",
        "priceCurrency": "USD",
        "description": "Pay-per-query exploit intelligence, no subscription required"
      }
    ],
    "featureList": [
      "20+ security source aggregation",
      "Real-time exploit detection",
      "MCP server for Claude Desktop",
      "Protocol risk assessment",
      "Wallet address screening",
      "Historical exploit database",
      "Source quality scoring",
      "x402 pay-per-query API",
      "Multi-chain coverage (15+ blockchains)",
      "AI agent integration",
      "WebSocket streaming",
      "Unlimited MCP queries"
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
