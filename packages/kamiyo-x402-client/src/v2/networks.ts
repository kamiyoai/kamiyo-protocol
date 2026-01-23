export type CAIP2Network = string;

const CAIP2_MAP: Record<string, string> = {
  // Mainnets
  base: 'eip155:8453',
  polygon: 'eip155:137',
  arbitrum: 'eip155:42161',
  optimism: 'eip155:10',
  avalanche: 'eip155:43114',
  sei: 'eip155:1329',
  iotex: 'eip155:4689',
  peaq: 'eip155:3338',
  xlayer: 'eip155:196',
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  // Testnets
  'base-sepolia': 'eip155:84532',
  'polygon-amoy': 'eip155:80002',
  'arbitrum-sepolia': 'eip155:421614',
  'optimism-sepolia': 'eip155:11155420',
  'avalanche-fuji': 'eip155:43113',
  'sei-testnet': 'eip155:1328',
  'iotex-testnet': 'eip155:4690',
  'peaq-agung': 'eip155:9990',
  'xlayer-testnet': 'eip155:195',
  'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CAIP2_MAP).map(([name, caip2]) => [caip2, name])
);

export function toCAIP2(network: string): string {
  const caip2 = CAIP2_MAP[network];
  if (caip2) return caip2;
  if (network.includes(':')) return network;
  throw new Error(`Unknown network: ${network}`);
}

export function fromCAIP2(caip2: string): string {
  const name = REVERSE_MAP[caip2];
  if (name) return name;
  throw new Error(`Unknown CAIP-2 identifier: ${caip2}`);
}

export function isCAIP2(s: string): boolean {
  return /^[a-z][a-z0-9-]*:[a-zA-Z0-9]+$/.test(s);
}

export const SUPPORTED_NETWORKS: string[] = Object.values(CAIP2_MAP);
export const NETWORK_NAMES: string[] = Object.keys(CAIP2_MAP);

const TESTNET_SUFFIXES = ['sepolia', 'testnet', 'fuji', 'amoy', 'agung', 'devnet'];

function isTestnet(name: string): boolean {
  return TESTNET_SUFFIXES.some(s => name.includes(s));
}

export function mainnetCAIP2s(): string[] {
  return Object.entries(CAIP2_MAP)
    .filter(([name]) => !isTestnet(name))
    .map(([, caip2]) => caip2);
}

export function testnetCAIP2s(): string[] {
  return Object.entries(CAIP2_MAP)
    .filter(([name]) => isTestnet(name))
    .map(([, caip2]) => caip2);
}
