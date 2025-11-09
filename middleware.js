/**
 * Next.js Middleware for x402 API
 *
 * Handles:
 * - Request size limits
 * - CORS preflight requests
 * - Rate limiting headers
 */

import { NextResponse } from 'next/server';

// Maximum request body size (1MB)
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host');

  // Handle x402resolve subdomain
  if (hostname === 'x402resolve.kamiyo.ai' && pathname === '/') {
    return NextResponse.rewrite(new URL('/x402resolve/index.html', request.url));
  }

  // Apply only to x402 API routes
  if (pathname.startsWith('/api/v1/x402/')) {
    // Handle OPTIONS preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Check Content-Length header for request size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        {
          error: 'Request body too large',
          errorCode: 'PAYLOAD_TOO_LARGE',
          maxSize: '1MB',
        },
        { status: 413 }
      );
    }
  }

  // Continue to API route
  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    '/',
    '/api/v1/x402/:path*',
  ],
};
