import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const REFRESH_TOKEN_COOKIE = 'kamiyo_singularity_refresh';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

// POST /api/auth - Login and set refresh token cookie
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, message } = body;

    if (!wallet || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wallet}:${signature}:${message}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const tokens = await res.json();

    // Set refresh token in httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    // Return only the access token to the client
    return NextResponse.json({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    });
  } catch (error) {
    logger.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/auth - Refresh token
export async function PUT() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    if (!res.ok) {
      // Clear invalid cookie
      cookieStore.delete(REFRESH_TOKEN_COOKIE);
      return NextResponse.json(
        { error: 'Token refresh failed' },
        { status: res.status }
      );
    }

    const tokens = await res.json();

    // Update refresh token cookie
    cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return NextResponse.json({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    });
  } catch (error) {
    logger.error('Refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/auth - Logout
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    if (refreshToken) {
      // Call backend logout
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshToken}`,
        },
      }).catch(() => {
        // Ignore backend errors during logout
      });
    }

    // Clear the cookie regardless
    cookieStore.delete(REFRESH_TOKEN_COOKIE);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Logout error:', error);
    // Still clear cookie on error
    const cookieStore = await cookies();
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return NextResponse.json({ success: true });
  }
}

// GET /api/auth - Check if has refresh token
export async function GET() {
  const cookieStore = await cookies();
  const hasRefreshToken = !!cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  return NextResponse.json({ hasRefreshToken });
}
