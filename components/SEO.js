// components/SEO.js
import Head from 'next/head';
import PropTypes from 'prop-types';

/**
 * SEO Component for KAMIYO Trust Infrastructure
 */
export default function SEO({
  title = "Trust Layer for the Agentic Economy | KAMIYO",
  description = "Decentralized SLA enforcement for machine-to-machine commerce. Escrow-protected payments with multi-oracle dispute resolution. Quality-based settlement for AI agent transactions.",
  keywords = [
    "AI agent trust infrastructure",
    "decentralized escrow",
    "multi-oracle dispute resolution",
    "machine-to-machine commerce",
    "agentic economy",
    "SLA enforcement",
    "quality-based settlement",
    "autonomous agent accountability",
    "on-chain escrow",
    "oracle consensus",
    "AI agent disputes",
    "stake-backed agents",
    "Solana escrow protocol",
    "agent reputation",
    "x402 payments",
    "crypto escrow API",
    "automated dispute resolution",
    "agent identity verification",
    "decentralized arbitration",
    "smart contract escrow"
  ],
  canonical = "https://kamiyo.ai",
  ogImage = "https://kamiyo.ai/media/kamiyo_open-graph.png",
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
          "url": "https://kamiyo.ai/media/kamiyo_open-graph.png",
          "width": 1200,
          "height": 630
        },
        "sameAs": [
          "https://github.com/kamiyo-ai/kamiyo-protocol",
          "https://twitter.com/KamiyoAI",
          "https://discord.gg/6yX8kd2UpC"
        ],
        "description": "Trust infrastructure for autonomous agents. Decentralized escrow and dispute resolution for machine-to-machine commerce."
      },
      {
        "@type": "WebSite",
        "@id": "https://kamiyo.ai/#website",
        "url": "https://kamiyo.ai",
        "name": "KAMIYO - Trust Layer for the Agentic Economy",
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
        "name": "KAMIYO Protocol",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "Web",
        "description": "Decentralized SLA enforcement for machine-to-machine commerce. Escrow-protected payments with multi-oracle dispute resolution and quality-based settlement.",
        "url": "https://kamiyo.ai",
        "offers": [
          {
            "@type": "Offer",
            "name": "Protocol",
            "price": "0",
            "priceCurrency": "USD",
            "description": "0.1% per escrow. Unlimited agreements, multi-oracle disputes, on-chain reputation.",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          },
          {
            "@type": "Offer",
            "name": "Dashboard",
            "price": "49",
            "priceCurrency": "USD",
            "description": "Real-time escrow monitoring, dispute analytics, agent reputation insights.",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          },
          {
            "@type": "Offer",
            "name": "Team",
            "price": "199",
            "priceCurrency": "USD",
            "description": "Multi-agent management, custom oracle panels, API access for analytics.",
            "seller": {
              "@id": "https://kamiyo.ai/#organization"
            }
          }
        ],
        "featureList": [
          "On-chain escrow with PDA-based agreements",
          "Multi-oracle dispute resolution",
          "Quality-based refund scale (0-100)",
          "Stake-backed agent identity",
          "On-chain reputation tracking",
          "ZK commit-reveal oracle voting",
          "Automated SLA enforcement",
          "x402 payment compatibility",
          "Solana-native performance",
          "Open source SDK"
        ],
        "softwareVersion": "1.0.0"
      },
      {
        "@type": "FAQPage",
        "@id": "https://kamiyo.ai/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is KAMIYO?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "KAMIYO is decentralized SLA enforcement for machine-to-machine commerce. When AI agents transact autonomously, KAMIYO provides escrow protection and multi-oracle dispute resolution to ensure fair outcomes."
            }
          },
          {
            "@type": "Question",
            "name": "How does dispute resolution work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "When a dispute is raised, a panel of oracles evaluates service quality on a 0-100 scale. The median score determines the refund percentage. ZK commit-reveal voting prevents oracle collusion."
            }
          },
          {
            "@type": "Question",
            "name": "What is quality-based settlement?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Unlike binary outcomes (full payment or full refund), KAMIYO uses graduated settlement. If oracles score quality at 65%, the provider receives 65% and the agent receives a 35% refund."
            }
          },
          {
            "@type": "Question",
            "name": "What blockchains does KAMIYO support?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "KAMIYO is built on Solana for high throughput and low fees. The protocol is designed for the speed requirements of autonomous agent transactions."
            }
          }
        ]
      }
    ]
  };

  const structuredData = schemaData || defaultSchema;

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
      <meta name="twitter:site" content="@KamiyoAI" />
      <meta name="twitter:creator" content="@KamiyoAI" />

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
