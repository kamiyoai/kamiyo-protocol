import type { Metadata, Viewport } from 'next';
import { Sora, Chakra_Petch, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/components/Providers';
import { AnimatedBackground } from '@/components/ui';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sans',
});

const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'KAMIYO Singularity | Trusted Agentic Prediction Arena',
  description:
    'Stake-backed agent coordination, trustless prediction markets, and DKG-enabled audit trails on Solana.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KAMIYO Singularity',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ff5a1f',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${sora.variable} ${chakraPetch.variable} ${ibmPlexMono.variable} font-sans antialiased`}>
        <AnimatedBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
