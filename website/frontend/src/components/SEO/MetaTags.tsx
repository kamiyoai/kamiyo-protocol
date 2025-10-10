/**
 * MetaTags Component
 *
 * Dynamic meta tag management using React Helmet Async
 * Provides comprehensive SEO optimization including:
 * - Open Graph tags for social sharing
 * - Twitter Card tags
 * - Canonical URLs
 * - JSON-LD structured data
 *
 * Usage:
 * <MetaTags
 *   title="Page Title"
 *   description="Page description"
 *   type="website"
 *   image="https://example.com/image.jpg"
 * />
 */

import React from 'react';
import { Helmet } from 'react-helmet-async';

interface MetaTagsProps {
  // Basic meta tags
  title?: string;
  description?: string;
  keywords?: string[];

  // Open Graph tags
  type?: 'website' | 'article' | 'product';
  image?: string;
  imageAlt?: string;
  url?: string;

  // Twitter Card tags
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterSite?: string;
  twitterCreator?: string;

  // Article specific (for blog posts and exploit details)
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  tags?: string[];

  // Canonical URL
  canonical?: string;

  // Structured data
  structuredData?: object;

  // Additional robots directives
  noindex?: boolean;
  nofollow?: boolean;
}

// Default configuration
const DEFAULT_CONFIG = {
  siteName: 'Kamiyo',
  siteUrl: 'https://kamiyo.io',
  defaultTitle: 'Kamiyo - Real-Time Exploit Intelligence for DeFi',
  defaultDescription: 'Track confirmed exploits across all major blockchains. Get instant alerts when security incidents happen. Comprehensive exploit database with $10B+ tracked.',
  defaultImage: 'https://kamiyo.io/og-image.jpg',
  twitterSite: '@KamiyoHQ',
  locale: 'en_US',
};

export const MetaTags: React.FC<MetaTagsProps> = ({
  title,
  description,
  keywords = [],
  type = 'website',
  image,
  imageAlt,
  url,
  twitterCard = 'summary_large_image',
  twitterSite,
  twitterCreator,
  publishedTime,
  modifiedTime,
  author,
  section,
  tags = [],
  canonical,
  structuredData,
  noindex = false,
  nofollow = false,
}) => {
  // Build full title
  const fullTitle = title
    ? `${title} | ${DEFAULT_CONFIG.siteName}`
    : DEFAULT_CONFIG.defaultTitle;

  // Use defaults if not provided
  const metaDescription = description || DEFAULT_CONFIG.defaultDescription;
  const metaImage = image || DEFAULT_CONFIG.defaultImage;
  const metaUrl = url || (typeof window !== 'undefined' ? window.location.href : DEFAULT_CONFIG.siteUrl);
  const canonicalUrl = canonical || metaUrl;

  // Build robots directive
  const robotsDirectives = [];
  if (noindex) robotsDirectives.push('noindex');
  if (nofollow) robotsDirectives.push('nofollow');
  const robotsContent = robotsDirectives.length > 0
    ? robotsDirectives.join(', ')
    : 'index, follow';

  // Generate structured data
  const getStructuredData = () => {
    if (structuredData) {
      return JSON.stringify(structuredData);
    }

    // Default Organization schema
    const baseSchema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${DEFAULT_CONFIG.siteUrl}/#organization`,
          name: DEFAULT_CONFIG.siteName,
          url: DEFAULT_CONFIG.siteUrl,
          logo: {
            '@type': 'ImageObject',
            url: `${DEFAULT_CONFIG.siteUrl}/logo.png`,
            width: 512,
            height: 512,
          },
          sameAs: [
            'https://twitter.com/KamiyoHQ',
            'https://github.com/kamiyo-io',
          ],
          description: DEFAULT_CONFIG.defaultDescription,
        },
        {
          '@type': 'WebSite',
          '@id': `${DEFAULT_CONFIG.siteUrl}/#website`,
          url: DEFAULT_CONFIG.siteUrl,
          name: DEFAULT_CONFIG.siteName,
          publisher: {
            '@id': `${DEFAULT_CONFIG.siteUrl}/#organization`,
          },
          potentialAction: {
            '@type': 'SearchAction',
            target: `${DEFAULT_CONFIG.siteUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    };

    // Add Article schema if it's an article
    if (type === 'article' && publishedTime) {
      baseSchema['@graph'].push({
        '@type': 'NewsArticle',
        '@id': `${metaUrl}#article`,
        headline: title,
        description: metaDescription,
        image: metaImage,
        datePublished: publishedTime,
        dateModified: modifiedTime || publishedTime,
        author: {
          '@type': 'Person',
          name: author || DEFAULT_CONFIG.siteName,
        },
        publisher: {
          '@id': `${DEFAULT_CONFIG.siteUrl}/#organization`,
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': metaUrl,
        },
        keywords: tags.join(', '),
        articleSection: section,
      });
    }

    // Add Breadcrumb schema
    if (typeof window !== 'undefined') {
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const breadcrumbItems = pathSegments.map((segment, index) => ({
          '@type': 'ListItem',
          position: index + 2, // Start at 2 (1 is home)
          name: segment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          item: `${DEFAULT_CONFIG.siteUrl}/${pathSegments.slice(0, index + 1).join('/')}`,
        }));

        baseSchema['@graph'].push({
          '@type': 'BreadcrumbList',
          '@id': `${metaUrl}#breadcrumb`,
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: DEFAULT_CONFIG.siteUrl,
            },
            ...breadcrumbItems,
          ],
        });
      }
    }

    return JSON.stringify(baseSchema);
  };

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph Tags */}
      <meta property="og:site_name" content={DEFAULT_CONFIG.siteName} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title || DEFAULT_CONFIG.defaultTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaImage} />
      {imageAlt && <meta property="og:image:alt" content={imageAlt} />}
      <meta property="og:url" content={metaUrl} />
      <meta property="og:locale" content={DEFAULT_CONFIG.locale} />

      {/* Article specific Open Graph tags */}
      {type === 'article' && (
        <>
          {publishedTime && (
            <meta property="article:published_time" content={publishedTime} />
          )}
          {modifiedTime && (
            <meta property="article:modified_time" content={modifiedTime} />
          )}
          {author && <meta property="article:author" content={author} />}
          {section && <meta property="article:section" content={section} />}
          {tags.map((tag, index) => (
            <meta key={index} property="article:tag" content={tag} />
          ))}
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:site" content={twitterSite || DEFAULT_CONFIG.twitterSite} />
      {twitterCreator && <meta name="twitter:creator" content={twitterCreator} />}
      <meta name="twitter:title" content={title || DEFAULT_CONFIG.defaultTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaImage} />
      {imageAlt && <meta name="twitter:image:alt" content={imageAlt} />}

      {/* Additional Meta Tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="theme-color" content="#7C3AED" />
      <meta name="format-detection" content="telephone=no" />

      {/* Structured Data */}
      <script type="application/ld+json">
        {getStructuredData()}
      </script>
    </Helmet>
  );
};

/**
 * Default MetaTags for homepage
 */
export const HomeMetaTags: React.FC = () => (
  <MetaTags
    title="Real-Time Exploit Intelligence for DeFi"
    description="Track confirmed exploits across Ethereum, BSC, Polygon, Arbitrum, and more. Get instant alerts when security incidents happen. Comprehensive database with $10B+ in tracked exploits."
    keywords={[
      'DeFi security',
      'exploit tracker',
      'blockchain security',
      'smart contract exploits',
      'crypto hacks',
      'security alerts',
      'DeFi intelligence',
    ]}
    type="website"
  />
);

/**
 * MetaTags for exploit details page
 */
export const ExploitMetaTags: React.FC<{
  exploitName: string;
  chain: string;
  amount: string;
  date: string;
  description: string;
  tags?: string[];
}> = ({ exploitName, chain, amount, date, description, tags = [] }) => (
  <MetaTags
    title={`${exploitName} Exploit on ${chain} - $${amount} Lost`}
    description={description}
    type="article"
    keywords={['exploit', chain, exploitName, 'security', 'DeFi', ...tags]}
    publishedTime={date}
    section="Security Incidents"
    tags={[chain, 'exploit', 'security', ...tags]}
  />
);

/**
 * MetaTags for pricing page
 */
export const PricingMetaTags: React.FC = () => (
  <MetaTags
    title="Pricing - Kamiyo Exploit Intelligence"
    description="Choose the perfect plan for your needs. Free tier available. Pro and Enterprise plans with advanced features, real-time alerts, and API access."
    keywords={[
      'pricing',
      'exploit intelligence pricing',
      'DeFi security subscription',
      'API access',
      'security alerts pricing',
    ]}
    type="website"
  />
);

/**
 * MetaTags for documentation pages
 */
export const DocsMetaTags: React.FC<{
  title: string;
  description: string;
  section?: string;
}> = ({ title, description, section = 'Documentation' }) => (
  <MetaTags
    title={title}
    description={description}
    type="article"
    section={section}
    keywords={['documentation', 'API', 'guide', 'tutorial', 'Kamiyo']}
  />
);

/**
 * MetaTags for blog posts
 */
export const BlogPostMetaTags: React.FC<{
  title: string;
  description: string;
  author: string;
  publishedDate: string;
  modifiedDate?: string;
  image?: string;
  tags?: string[];
}> = ({ title, description, author, publishedDate, modifiedDate, image, tags = [] }) => (
  <MetaTags
    title={title}
    description={description}
    type="article"
    author={author}
    publishedTime={publishedDate}
    modifiedTime={modifiedDate}
    image={image}
    section="Blog"
    tags={tags}
    keywords={['blog', 'DeFi security', 'crypto', ...tags]}
  />
);

export default MetaTags;
