import { createLogger } from '../lib/logger';
import type { ReasoningChain, ReasoningCommitment } from './reasoningChain';

const log = createLogger('ipfs-publisher');

export interface IPFSPublishResult {
  cid: string;
  url: string;
  gateway: string;
  size: number;
  timestamp: number;
}

export interface IPFSConfig {
  gateway: string;
  pinataApiKey?: string;
  pinataSecretKey?: string;
  web3StorageToken?: string;
  nftStorageToken?: string;
}

const DEFAULT_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

export class IPFSPublisher {
  private config: IPFSConfig;
  private publishMethod: 'pinata' | 'web3storage' | 'nftstorage' | 'none';

  constructor(config: Partial<IPFSConfig> = {}) {
    this.config = {
      gateway: config.gateway || DEFAULT_GATEWAYS[0],
      ...config,
    };

    // Determine available publish method
    if (config.pinataApiKey && config.pinataSecretKey) {
      this.publishMethod = 'pinata';
    } else if (config.web3StorageToken) {
      this.publishMethod = 'web3storage';
    } else if (config.nftStorageToken) {
      this.publishMethod = 'nftstorage';
    } else {
      this.publishMethod = 'none';
    }

    log.info('IPFS publisher initialized', { method: this.publishMethod });
  }

  /**
   * Publish a reasoning chain to IPFS
   */
  async publish(chain: ReasoningChain): Promise<IPFSPublishResult | null> {
    if (this.publishMethod === 'none') {
      log.warn('No IPFS provider configured, skipping publish');
      return null;
    }

    const content = JSON.stringify(chain, null, 2);

    try {
      switch (this.publishMethod) {
        case 'pinata':
          return await this.publishToPinata(chain.id, content);
        case 'web3storage':
          return await this.publishToWeb3Storage(chain.id, content);
        case 'nftstorage':
          return await this.publishToNFTStorage(chain.id, content);
        default:
          return null;
      }
    } catch (err) {
      log.error('IPFS publish failed', err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private async publishToPinata(
    name: string,
    content: string
  ): Promise<IPFSPublishResult> {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pinata_api_key': this.config.pinataApiKey!,
        'pinata_secret_api_key': this.config.pinataSecretKey!,
      },
      body: JSON.stringify({
        pinataContent: JSON.parse(content),
        pinataMetadata: {
          name: `reasoning-${name}`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinata error: ${response.status}`);
    }

    const result = (await response.json()) as { IpfsHash: string; PinSize: number };

    log.info('Published to Pinata', { cid: result.IpfsHash.slice(0, 12) });

    return {
      cid: result.IpfsHash,
      url: `${this.config.gateway}${result.IpfsHash}`,
      gateway: this.config.gateway,
      size: result.PinSize,
      timestamp: Date.now(),
    };
  }

  private async publishToWeb3Storage(
    name: string,
    content: string
  ): Promise<IPFSPublishResult> {
    const blob = new Blob([content], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob, `${name}.json`);

    const response = await fetch('https://api.web3.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.web3StorageToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Web3.Storage error: ${response.status}`);
    }

    const result = (await response.json()) as { cid: string };

    log.info('Published to Web3.Storage', { cid: result.cid.slice(0, 12) });

    return {
      cid: result.cid,
      url: `${this.config.gateway}${result.cid}`,
      gateway: this.config.gateway,
      size: content.length,
      timestamp: Date.now(),
    };
  }

  private async publishToNFTStorage(
    name: string,
    content: string
  ): Promise<IPFSPublishResult> {
    const blob = new Blob([content], { type: 'application/json' });

    const response = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.nftStorageToken}`,
      },
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`NFT.Storage error: ${response.status}`);
    }

    const result = (await response.json()) as { value: { cid: string } };

    log.info('Published to NFT.Storage', { cid: result.value.cid.slice(0, 12) });

    return {
      cid: result.value.cid,
      url: `${this.config.gateway}${result.value.cid}`,
      gateway: this.config.gateway,
      size: content.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Fetch a reasoning chain from IPFS
   */
  async fetch(cid: string): Promise<ReasoningChain | null> {
    for (const gateway of DEFAULT_GATEWAYS) {
      try {
        const response = await fetch(`${gateway}${cid}`, {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const chain = (await response.json()) as ReasoningChain;
          log.debug('Fetched from IPFS', { cid: cid.slice(0, 12), gateway });
          return chain;
        }
      } catch {
        continue;
      }
    }

    log.warn('Failed to fetch from all gateways', { cid: cid.slice(0, 12) });
    return null;
  }

  /**
   * Check if content is available on IPFS
   */
  async isAvailable(cid: string): Promise<boolean> {
    for (const gateway of DEFAULT_GATEWAYS) {
      try {
        const response = await fetch(`${gateway}${cid}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Get the configured gateway URL for a CID
   */
  getUrl(cid: string): string {
    return `${this.config.gateway}${cid}`;
  }

  /**
   * Check if publishing is available
   */
  isPublishingEnabled(): boolean {
    return this.publishMethod !== 'none';
  }
}
