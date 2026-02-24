/** @type {import('next').NextConfig} */

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
  reactStrictMode: true,

  images: {
    // Modern formats for better compression
    formats: ['image/avif', 'image/webp'],

    // Remote patterns for external images
    remotePatterns: [
      // GitHub avatars (user profile images)
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
      // Unsplash (used in FeaturedBanner)
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      // Arweave gateway (NFT/market images)
      {
        protocol: 'https',
        hostname: 'arweave.net',
        pathname: '/**',
      },
      // IPFS gateways
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/ipfs/**',
      },
      // CDN domains
      {
        protocol: 'https',
        hostname: 'cdn.kamiyo.ai',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.kamiyo.ai',
        pathname: '/**',
      },
    ],

    // Device sizes for srcset generation
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1440, 1920, 2048],

    // Image sizes for responsive images
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // Minimum cache TTL (1 week)
    minimumCacheTTL: 604800,

    // Disable static image imports if needed for optimization
    // disableStaticImages: false,
  },

  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = withPWA(nextConfig);
