// next.config.mjs
// KAMIYO x402 Payment Facilitator - A+++ Grade SEO & Performance Configuration
// Optimized for Core Web Vitals, Security, and Search Engine Rankings

// ============================================================================
// CONTENT SECURITY POLICY (CSP)
// ============================================================================
// Prevents XSS attacks, clickjacking, and other code injection attacks
// Critical for both security and SEO (Google considers security a ranking factor)
const csp = process.env.NODE_ENV === 'development'
    ? `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://accounts.google.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src 'self' data: https: blob:;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      connect-src 'self' http://localhost:8000 http://localhost:8001 https://accounts.google.com https://api.dexscreener.com ws://localhost:* wss://localhost:*;
    `
    : `
      default-src 'self';
      script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src 'self' data: https:;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      connect-src 'self' https://accounts.google.com https://api.dexscreener.com;
    `;

/**
 * Exclude .node binaries from Webpack bundling
 * Required for native modules to work properly
 */
function externalNativeNodeModules(context, callback) {
    if (context.request && context.request.endsWith('.node')) {
        return callback(null, 'commonjs ' + context.request);
    }
    callback(null);
}

const nextConfig = {
    // ========================================================================
    // COMPILER OPTIMIZATIONS
    // ========================================================================
    // SWC compiler is 17x faster than Babel and enables better optimization
    compiler: {
        // Remove console logs in production for smaller bundle size
        removeConsole: process.env.NODE_ENV === 'production' ? {
            exclude: ['error', 'warn'],
        } : false,
    },

    // ========================================================================
    // REACT STRICT MODE
    // ========================================================================
    // Enable for production to catch potential issues early
    // Disabled currently - consider enabling for better code quality
    reactStrictMode: false,

    // ========================================================================
    // COMPRESSION
    // ========================================================================
    // Next.js automatically uses gzip/brotli compression in production
    compress: true,

    // ========================================================================
    // TRAILING SLASH CONFIGURATION
    // ========================================================================
    // Disable trailing slashes to prevent NextAuth redirect loops
    trailingSlash: false,

    // ========================================================================
    // PAGE EXTENSIONS
    // ========================================================================
    pageExtensions: ['js', 'jsx', 'ts', 'tsx'],

    // ========================================================================
    // TYPESCRIPT CONFIGURATION
    // ========================================================================
    // Exclude Solana programs from type-checking (built separately)
    typescript: {
        ignoreBuildErrors: false,
    },

    // ========================================================================
    // IMAGE OPTIMIZATION
    // ========================================================================
    // Next.js Image component automatically optimizes images for Core Web Vitals
    images: {
        // Enable modern image formats (WebP, AVIF) for better compression
        formats: ['image/avif', 'image/webp'],

        // Device sizes for responsive images (breakpoints)
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],

        // Image sizes for different use cases
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

        // Allowed external image domains (add your CDN/image hosts here)
        domains: [
            'localhost',
            'kamiyo.ai',
            'www.kamiyo.ai',
        ],

        // Remote patterns for more flexible image URL matching
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.kamiyo.ai',
            },
            {
                protocol: 'https',
                hostname: 'accounts.google.com',
            },
        ],

        // Minimize layout shift (CLS metric) by requiring width/height
        dangerouslyAllowSVG: true,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",

        // Cache optimized images for better performance
        minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    },

    // ========================================================================
    // SECURITY & SEO HEADERS
    // ========================================================================
    async headers() {
        return [
            {
                // Apply security headers to all routes
                source: '/:path*',
                headers: [
                    // ============================================================
                    // SECURITY HEADERS (Critical for SEO ranking)
                    // ============================================================

                    // Content Security Policy - Prevents XSS attacks
                    {
                        key: 'Content-Security-Policy',
                        value: csp.replace(/\s{2,}/g, ' ').trim(),
                    },

                    // Prevents clickjacking attacks by blocking iframe embedding
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },

                    // Prevents MIME type sniffing
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },

                    // Enables browser XSS protection (legacy but still useful)
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },

                    // Controls referrer information sent to other sites
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },

                    // Permissions Policy - Restricts browser features for privacy
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
                    },

                    // HSTS - Forces HTTPS for 1 year (critical for SEO)
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains; preload',
                    },

                    // DNS Prefetch Control - Improves privacy
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                ],
            },

            // ================================================================
            // STATIC ASSET CACHING (Improves LCP and performance)
            // ================================================================
            {
                source: '/static/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/_next/static/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },

            // ================================================================
            // FONT PRELOADING (Improves CLS and LCP)
            // ================================================================
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Link',
                        value: '<https://fonts.googleapis.com>; rel=preconnect; crossorigin',
                    },
                    {
                        key: 'Link',
                        value: '<https://fonts.gstatic.com>; rel=preconnect; crossorigin',
                    },
                ],
            },
        ];
    },

    // ========================================================================
    // URL REDIRECTS (SEO Optimization)
    // ========================================================================
    async redirects() {
        return [
            // Trailing slash normalization (prevents duplicate content issues)
            // Note: API routes are excluded to prevent NextAuth redirect loops
        ];
    },

    // ========================================================================
    // API REWRITES (Performance & Functionality)
    // ========================================================================
    async rewrites() {
        return [
            // Proxy to DexScreener API to avoid CORS issues
            {
                source: '/api/dex/:path*',
                destination: 'https://api.dexscreener.com/latest/dex/pairs/solana/:path*',
            },
            // Socket.io rewrite for WebSocket support
            {
                source: '/api/socket/:path*',
                destination: '/socket.io/:path*',
            },
        ];
    },

    // ========================================================================
    // ENVIRONMENT VARIABLES
    // ========================================================================
    env: {
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL || 'http://localhost:3001',
    },

    // ========================================================================
    // WEBPACK CONFIGURATION (Advanced Optimization)
    // ========================================================================
    webpack: (config, { isServer, dev }) => {
        // ====================================================================
        // TREE-SHAKING & BUNDLE SIZE OPTIMIZATION
        // ====================================================================
        if (!dev) {
            config.optimization = {
                ...config.optimization,
                // Split chunks for better caching
                splitChunks: {
                    chunks: 'all',
                    cacheGroups: {
                        default: false,
                        vendors: false,
                        // Vendor chunk for third-party libraries
                        vendor: {
                            name: 'vendor',
                            chunks: 'all',
                            test: /node_modules/,
                            priority: 20,
                        },
                        // Common chunk for shared code
                        common: {
                            name: 'common',
                            minChunks: 2,
                            chunks: 'all',
                            priority: 10,
                            reuseExistingChunk: true,
                            enforce: true,
                        },
                    },
                },
                // Minimize bundle size
                minimize: true,
            };
        }

        // ====================================================================
        // WEBSOCKET SUPPORT (Development)
        // ====================================================================
        if (!isServer && dev) {
            config.infrastructureLogging = {
                level: 'error',
            };
        }

        // ====================================================================
        // NATIVE NODE MODULES (Server-side)
        // ====================================================================
        if (isServer) {
            if (!config.externals) {
                config.externals = [];
            }
            if (typeof config.externals === 'function') {
                config.externals = [];
            }

            if (Array.isArray(config.externals)) {
                config.externals.push(externalNativeNodeModules);
            }
        }

        // ====================================================================
        // MODULE RESOLUTION OPTIMIZATION
        // ====================================================================
        config.resolve = {
            ...config.resolve,
            // Faster module resolution
            symlinks: false,
        };

        return config;
    },

    // ========================================================================
    // PERFORMANCE OPTIMIZATIONS
    // ========================================================================
    // Generate ETags for better caching
    generateEtags: true,

    // Power by header removal (minor security improvement)
    poweredByHeader: false,

    // Production browser source maps (disabled for faster builds)
    productionBrowserSourceMaps: false,

    // ========================================================================
    // EXPERIMENTAL FEATURES (Enable for better performance)
    // ========================================================================
    // Note: Some experimental features may require additional dependencies
    // experimental: {
    //     // Optimize CSS loading (requires 'critters' package)
    //     optimizeCss: true,
    // },

    // ========================================================================
    // OUTPUT CONFIGURATION
    // ========================================================================
    output: 'standalone', // Optimized for production deployment
};

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================
export default nextConfig;
