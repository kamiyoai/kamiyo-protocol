import { ActionPostRequest } from '@solana/actions';
import { CORS_HEADERS } from './constants';
import {
  getCreateEscrowAction,
  postCreateEscrow,
  getReleaseEscrowAction,
  postReleaseEscrow,
  getDisputeAction,
  postDispute,
  getReputationAction,
} from './actions';

export * from './constants';
export * from './actions';
export * from './utils';

export type ActionType = 'create-escrow' | 'release-escrow' | 'dispute' | 'reputation';

export async function handleGet(
  action: ActionType,
  requestUrl: URL
): Promise<Response> {
  try {
    let payload;

    switch (action) {
      case 'create-escrow':
        payload = getCreateEscrowAction(requestUrl);
        break;
      case 'release-escrow':
        payload = getReleaseEscrowAction(requestUrl);
        break;
      case 'dispute':
        payload = getDisputeAction(requestUrl);
        break;
      case 'reputation':
        payload = await getReputationAction(requestUrl);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 404, headers: CORS_HEADERS }
        );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function handlePost(
  action: ActionType,
  request: ActionPostRequest,
  requestUrl: URL
): Promise<Response> {
  try {
    let payload;

    switch (action) {
      case 'create-escrow':
        payload = await postCreateEscrow(request, requestUrl);
        break;
      case 'release-escrow':
        payload = await postReleaseEscrow(request, requestUrl);
        break;
      case 'dispute':
        payload = await postDispute(request, requestUrl);
        break;
      case 'reputation':
        return new Response(
          JSON.stringify({ error: 'Reputation is read-only. Use GET request.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 404, headers: CORS_HEADERS }
        );
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transaction failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const actionsManifest = {
  rules: [
    { pathPattern: '/api/actions/create-escrow', apiPath: '/api/actions/create-escrow' },
    { pathPattern: '/api/actions/release-escrow', apiPath: '/api/actions/release-escrow' },
    { pathPattern: '/api/actions/dispute', apiPath: '/api/actions/dispute' },
    { pathPattern: '/api/actions/reputation', apiPath: '/api/actions/reputation' },
  ],
};

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Handle actions.json
  if (url.pathname === '/actions.json' || url.pathname === '/.well-known/actions.json') {
    return new Response(JSON.stringify(actionsManifest), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  // Extract action from path: /api/actions/{action}
  const actionIndex = pathParts.indexOf('actions');
  if (actionIndex === -1 || actionIndex + 1 >= pathParts.length) {
    return new Response(
      JSON.stringify({ error: 'Invalid path. Use /api/actions/{action}' }),
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const action = pathParts[actionIndex + 1] as ActionType;

  switch (request.method) {
    case 'OPTIONS':
      return handleOptions();
    case 'GET':
      return handleGet(action, url);
    case 'POST':
      const body = await request.json() as ActionPostRequest;
      return handlePost(action, body, url);
    default:
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: CORS_HEADERS }
      );
  }
}
