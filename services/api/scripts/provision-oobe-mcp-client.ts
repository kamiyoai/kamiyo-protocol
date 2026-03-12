import { KamiyoOAuthClientsStore } from '../src/mcp/oauth/clients-store.js';
import { getMcpCapability } from '../src/core-capabilities.js';

function usage(): never {
  process.stderr.write(
    'Usage: pnpm --filter kamiyo-companion run provision:oobe-mcp-client -- --redirect-uri <uri> [--redirect-uri <uri>] [--name <client name>]\n'
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { name: string; redirectUris: string[] } {
  let name = 'OOBE MCP Client';
  const redirectUris: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name') {
      name = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--redirect-uri') {
      const value = argv[i + 1] || '';
      if (value) {
        redirectUris.push(value);
      }
      i += 1;
      continue;
    }
  }

  if (!name.trim() || redirectUris.length === 0) {
    usage();
  }

  return { name: name.trim(), redirectUris };
}

const { name, redirectUris } = parseArgs(process.argv.slice(2));
const store = new KamiyoOAuthClientsStore();
const client = store.registerClient({
  client_name: name,
  redirect_uris: redirectUris,
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'mcp:tools',
  token_endpoint_auth_method: 'client_secret_basic',
});

const baseUrl = new URL(getMcpCapability().publicBaseUrl);

process.stdout.write(
  `${JSON.stringify(
    {
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uris: redirectUris,
      authorization_url: new URL('/partners/oobe/oauth/authorize', baseUrl).toString(),
      token_url: new URL('/partners/oobe/oauth/token', baseUrl).toString(),
      resource: new URL('/partners/oobe/mcp', baseUrl).toString(),
      well_known: new URL('/partners/oobe/.well-known/oauth-authorization-server', baseUrl).toString(),
    },
    null,
    2
  )}\n`
);
