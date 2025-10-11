// next.config.mjs
const csp = process.env.NODE_ENV === 'development'
    ? `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://accounts.google.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      object-src 'none';
      connect-src 'self' https://accounts.google.com https://api.dexscreener.com ws://localhost:3001 wss://localhost:3001 ws://localhost:* wss://localhost:*;
    `
    : `
      default-src 'self';
      script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      object-src 'none';
      connect-src 'self' https://accounts.google.com https://api.dexscreener.com;
    `;

/**
 * Exclude .node binaries from Webpack bundling
 */
function externalNativeNodeModules(context, callback) {
    if (context.request && context.request.endsWith('.node')) {
        return callback(null, 'commonjs ' + context.request);
    }
    callback(null);
}

const nextConfig = {
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: csp.replace(/\s{2,}/g, ' ').trim(),
                    },
                ],
            },
        ];
    },

    async rewrites() {
        return [
            {
                source: '/api/dex/:path*',
                destination: 'https://api.dexscreener.com/latest/dex/pairs/solana/:path*',
            },
            // Add a rewrite for socket.io
            {
                source: '/api/socket/:path*',
                destination: '/socket.io/:path*',
            },
        ];
    },

    env: {
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL || 'http://localhost:3001',
    },

    webpack: (config, { isServer, dev }) => {
        // WebSocket support
        if (!isServer && dev) {
            config.infrastructureLogging = {
                level: 'error',
            };
        }

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

        return config;
    },

    // Removed webpackDevMiddleware which caused the warning

    reactStrictMode: false,

    // Exclude frontend directory from Next.js build
    pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
    exclude: ['frontend/**/*'],
};

export default nextConfig;