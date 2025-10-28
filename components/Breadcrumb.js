// components/Breadcrumb.js
import Head from 'next/head';
import Link from 'next/link';
import PropTypes from 'prop-types';

/**
 * Breadcrumb Component with JSON-LD Schema Markup
 *
 * A reusable breadcrumb navigation component that provides both visual navigation
 * and SEO-friendly structured data for search engines. Follows KAMIYO design system
 * with cyan/magenta gradient theme.
 *
 * @component
 * @example
 * // Features page breadcrumb
 * <Breadcrumb items={[
 *   { name: 'Home', url: '/' },
 *   { name: 'Features', url: '/features' }
 * ]} />
 *
 * @example
 * // Dashboard API Keys breadcrumb
 * <Breadcrumb items={[
 *   { name: 'Home', url: '/' },
 *   { name: 'Dashboard', url: '/dashboard' },
 *   { name: 'API Keys', url: '/dashboard/api-keys' }
 * ]} />
 *
 * @example
 * // Current page (no link on last item)
 * <Breadcrumb
 *   items={[
 *     { name: 'Home', url: '/' },
 *     { name: 'Pricing', url: '/pricing', current: true }
 *   ]}
 * />
 */
export default function Breadcrumb({ items = [] }) {
  // Don't render if no items or only one item
  if (!items || items.length <= 1) {
    return null;
  }

  // Generate BreadcrumbList JSON-LD schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url ? `https://kamiyo.ai${item.url}` : undefined
    }))
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      </Head>

      {/* Visual Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb navigation"
        className="w-full px-5 mx-auto py-4 border-b border-gray-500 border-opacity-25"
        style={{ maxWidth: '1400px' }}
      >
        <ol
          className="flex items-center space-x-2 text-sm"
          itemScope
          itemType="https://schema.org/BreadcrumbList"
        >
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isCurrent = item.current || isLast;

            return (
              <li
                key={`${item.url}-${index}`}
                className="flex items-center"
                itemProp="itemListElement"
                itemScope
                itemType="https://schema.org/ListItem"
              >
                {/* Breadcrumb Item */}
                {!isCurrent && item.url ? (
                  <Link
                    href={item.url}
                    className="text-gray-400 hover:text-cyan transition-colors duration-300 uppercase tracking-wider"
                    itemProp="item"
                    aria-label={`Navigate to ${item.name}`}
                  >
                    <span itemProp="name">{item.name}</span>
                  </Link>
                ) : (
                  <span
                    className="gradient-text uppercase tracking-wider font-normal"
                    itemProp="name"
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    {item.name}
                  </span>
                )}

                {/* Hidden position for schema.org */}
                <meta itemProp="position" content={index + 1} />

                {/* Separator (not on last item) */}
                {!isLast && (
                  <span
                    className="mx-2 text-gray-600"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

// PropTypes validation
Breadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      url: PropTypes.string,
      current: PropTypes.bool
    })
  ).isRequired
};
