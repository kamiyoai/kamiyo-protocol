/**
 * CSRF Token Management Utility
 *
 * Handles CSRF token fetching, storage, and inclusion in API requests.
 * BLOCKER 1 RESOLUTION: Client-side CSRF protection
 */

// In-memory token storage (more secure than localStorage)
let csrfToken = null;
let tokenExpiry = null;

/**
 * Fetch a new CSRF token from the API
 *
 * @returns {Promise<string>} The CSRF token
 */
export async function fetchCsrfToken() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/api/csrf-token`, {
      method: 'GET',
      credentials: 'include', // Important: include cookies
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CSRF token: ${response.status}`);
    }

    const data = await response.json();

    // Store token in memory
    csrfToken = data.csrf_token;

    // Calculate expiry time (subtract 5 minutes for safety margin)
    const expirySeconds = data.expires_in || 7200;
    tokenExpiry = Date.now() + (expirySeconds - 300) * 1000;

    console.log('[CSRF] Token fetched successfully, expires in', expirySeconds, 'seconds');

    return csrfToken;
  } catch (error) {
    console.error('[CSRF] Failed to fetch token:', error);
    throw error;
  }
}

/**
 * Get the current CSRF token, fetching a new one if needed
 *
 * @returns {Promise<string>} The CSRF token
 */
export async function getCsrfToken() {
  // If no token or token expired, fetch new one
  if (!csrfToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    console.log('[CSRF] Token missing or expired, fetching new token');
    return await fetchCsrfToken();
  }

  return csrfToken;
}

/**
 * Clear the stored CSRF token (e.g., on logout)
 */
export function clearCsrfToken() {
  csrfToken = null;
  tokenExpiry = null;
  console.log('[CSRF] Token cleared');
}

/**
 * Make an API request with CSRF protection
 *
 * Automatically includes CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
 *
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function csrfFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  // Only add CSRF token for state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = await getCsrfToken();

    options.headers = {
      ...options.headers,
      'X-CSRF-Token': token,
    };
  }

  // Always include credentials for cookie-based authentication
  options.credentials = options.credentials || 'include';

  try {
    const response = await fetch(url, options);

    // If we get a 403 CSRF error, try to refresh token and retry once
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));

      if (errorData.error === 'csrf_token_invalid') {
        console.log('[CSRF] Token invalid, refreshing and retrying...');

        // Clear old token and fetch new one
        clearCsrfToken();
        const newToken = await getCsrfToken();

        // Retry the request with new token
        options.headers = {
          ...options.headers,
          'X-CSRF-Token': newToken,
        };

        return await fetch(url, options);
      }
    }

    return response;
  } catch (error) {
    console.error('[CSRF] Request failed:', error);
    throw error;
  }
}

/**
 * Initialize CSRF protection on app load
 *
 * Call this in _app.js or main layout component
 *
 * @returns {Promise<void>}
 */
export async function initCsrfProtection() {
  try {
    await fetchCsrfToken();
    console.log('[CSRF] Protection initialized');
  } catch (error) {
    console.error('[CSRF] Failed to initialize protection:', error);
    // Don't throw - allow app to load, token will be fetched on first request
  }
}

/**
 * React hook for CSRF protection
 *
 * Usage:
 * ```jsx
 * const { csrfToken, refreshToken } = useCsrf();
 * ```
 */
export function useCsrf() {
  const [token, setToken] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const refreshToken = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newToken = await fetchCsrfToken();
      setToken(newToken);
    } catch (err) {
      setError(err);
      console.error('[CSRF] Hook refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch token on mount
  React.useEffect(() => {
    refreshToken();
  }, []);

  return {
    csrfToken: token,
    isLoading,
    error,
    refreshToken,
  };
}

export default {
  fetchCsrfToken,
  getCsrfToken,
  clearCsrfToken,
  csrfFetch,
  initCsrfProtection,
  useCsrf,
};
