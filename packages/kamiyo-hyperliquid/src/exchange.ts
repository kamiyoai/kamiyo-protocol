/**
 * Hyperliquid L1 Exchange API Client
 *
 * Handles order execution on Hyperliquid via signed EIP-712 messages.
 * Supports market orders, limit orders, and position management.
 */

import { ethers, Wallet } from 'ethers';

export type Network = 'mainnet' | 'testnet';

export interface ExchangeConfig {
  wallet: Wallet;
  network?: Network;
  vaultAddress?: string;
}

export interface OrderRequest {
  coin: string;
  isBuy: boolean;
  sz: string;
  limitPx: string;
  reduceOnly?: boolean;
  orderType: OrderType;
  cloid?: string;
}

export interface OrderType {
  limit?: {
    tif: 'Gtc' | 'Ioc' | 'Alo';
  };
  trigger?: {
    isMarket: boolean;
    triggerPx: string;
    tpsl: 'tp' | 'sl';
  };
}

export interface OrderResult {
  status: 'ok' | 'err';
  response?: {
    type: 'order';
    data: {
      statuses: OrderStatus[];
    };
  };
  error?: string;
}

export interface OrderStatus {
  filled?: {
    totalSz: string;
    avgPx: string;
    oid: number;
  };
  resting?: {
    oid: number;
  };
  error?: string;
}

export interface CancelRequest {
  coin: string;
  oid: number;
}

export interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  leverage: { type: string; value: number };
  marginUsed: string;
}

export interface AccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  assetPositions: Array<{ position: Position }>;
  crossMaintenanceMarginUsed: string;
}

export interface MetaInfo {
  universe: Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
  }>;
}

const ENDPOINTS = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz',
};

// EIP-712 domain for Hyperliquid
const EIP712_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: 42161, // Arbitrum
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const ORDER_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
  Order: [
    { name: 'asset', type: 'uint32' },
    { name: 'isBuy', type: 'bool' },
    { name: 'limitPx', type: 'uint64' },
    { name: 'sz', type: 'uint64' },
    { name: 'reduceOnly', type: 'bool' },
    { name: 'orderType', type: 'uint8' },
  ],
  PlaceOrder: [
    { name: 'orders', type: 'Order[]' },
    { name: 'grouping', type: 'uint8' },
    { name: 'nonce', type: 'uint64' },
  ],
};

export class HyperliquidExchange {
  private readonly wallet: Wallet;
  private readonly endpoint: string;
  private readonly vaultAddress?: string;
  private assetMap: Map<string, number> = new Map();
  private szDecimals: Map<string, number> = new Map();
  private initialized = false;

  constructor(config: ExchangeConfig) {
    this.wallet = config.wallet;
    this.endpoint = ENDPOINTS[config.network || 'testnet'];
    this.vaultAddress = config.vaultAddress;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const meta = await this.getMeta();
    meta.universe.forEach((asset, index) => {
      this.assetMap.set(asset.name, index);
      this.szDecimals.set(asset.name, asset.szDecimals);
    });
    this.initialized = true;
  }

  getAddress(): string {
    return this.wallet.address;
  }

  // ============ Info API ============

  async getMeta(): Promise<MetaInfo> {
    const response = await this.postInfo({ type: 'meta' });
    return response;
  }

  async getAccountState(user?: string): Promise<AccountState> {
    const response = await this.postInfo({
      type: 'clearinghouseState',
      user: user || this.wallet.address,
    });
    return response;
  }

  async getOpenOrders(user?: string): Promise<any[]> {
    const response = await this.postInfo({
      type: 'openOrders',
      user: user || this.wallet.address,
    });
    return response;
  }

  async getAllMids(): Promise<Record<string, string>> {
    const response = await this.postInfo({ type: 'allMids' });
    return response;
  }

  async getL2Snapshot(coin: string): Promise<{ levels: Array<{ px: string; sz: string; n: number }[]> }> {
    const response = await this.postInfo({
      type: 'l2Book',
      coin,
    });
    return response;
  }

  // ============ Exchange API ============

  async marketOrder(
    coin: string,
    isBuy: boolean,
    size: number,
    slippageBps: number = 100
  ): Promise<OrderResult> {
    await this.ensureInit();

    const mids = await this.getAllMids();
    const midPx = parseFloat(mids[coin]);
    if (!midPx) {
      throw new Error(`No market data for ${coin}`);
    }

    // Apply slippage to get limit price
    const slippage = 1 + (slippageBps / 10000) * (isBuy ? 1 : -1);
    const limitPx = this.roundPrice(midPx * slippage, coin);

    return this.placeOrder({
      coin,
      isBuy,
      sz: this.formatSize(size, coin),
      limitPx: limitPx.toString(),
      reduceOnly: false,
      orderType: { limit: { tif: 'Ioc' } },
    });
  }

  async limitOrder(
    coin: string,
    isBuy: boolean,
    size: number,
    price: number,
    tif: 'Gtc' | 'Ioc' | 'Alo' = 'Gtc',
    reduceOnly: boolean = false
  ): Promise<OrderResult> {
    await this.ensureInit();

    return this.placeOrder({
      coin,
      isBuy,
      sz: this.formatSize(size, coin),
      limitPx: this.roundPrice(price, coin).toString(),
      reduceOnly,
      orderType: { limit: { tif } },
    });
  }

  async closePosition(coin: string, slippageBps: number = 100): Promise<OrderResult | null> {
    const state = await this.getAccountState();
    const positionData = state.assetPositions.find((p) => p.position.coin === coin);

    if (!positionData || parseFloat(positionData.position.szi) === 0) {
      return null;
    }

    const size = Math.abs(parseFloat(positionData.position.szi));
    const isBuy = parseFloat(positionData.position.szi) < 0; // Buy to close short, sell to close long

    return this.marketOrder(coin, isBuy, size, slippageBps);
  }

  async cancelOrder(coin: string, oid: number): Promise<{ status: string }> {
    const action = {
      type: 'cancel',
      cancels: [{ a: this.getAssetIndex(coin), o: oid }],
    };

    const nonce = Date.now();
    const signature = await this.signAction(action, nonce);

    const response = await this.postExchange({
      action,
      nonce,
      signature,
      vaultAddress: this.vaultAddress,
    });

    return response;
  }

  async cancelAllOrders(): Promise<{ status: string }> {
    const action = {
      type: 'cancelByCloid',
      cancels: [],
    };

    const nonce = Date.now();
    const signature = await this.signAction(action, nonce);

    const response = await this.postExchange({
      action,
      nonce,
      signature,
      vaultAddress: this.vaultAddress,
    });

    return response;
  }

  async setLeverage(coin: string, leverage: number, isCross: boolean = true): Promise<{ status: string }> {
    const action = {
      type: 'updateLeverage',
      asset: this.getAssetIndex(coin),
      isCross,
      leverage,
    };

    const nonce = Date.now();
    const signature = await this.signAction(action, nonce);

    const response = await this.postExchange({
      action,
      nonce,
      signature,
      vaultAddress: this.vaultAddress,
    });

    return response;
  }

  // ============ Private Methods ============

  private async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const action = {
      type: 'order',
      orders: [this.buildOrderWire(order)],
      grouping: 'na',
    };

    const nonce = Date.now();
    const signature = await this.signAction(action, nonce);

    const response = await this.postExchange({
      action,
      nonce,
      signature,
      vaultAddress: this.vaultAddress,
    });

    return response;
  }

  private buildOrderWire(order: OrderRequest): any {
    const orderType = order.orderType.limit
      ? { limit: order.orderType.limit }
      : { trigger: order.orderType.trigger };

    return {
      a: this.getAssetIndex(order.coin),
      b: order.isBuy,
      p: order.limitPx,
      s: order.sz,
      r: order.reduceOnly || false,
      t: orderType,
      c: order.cloid,
    };
  }

  private async signAction(action: any, nonce: number): Promise<{
    r: string;
    s: string;
    v: number;
  }> {
    const phantomAgent = {
      source: action.type === 'order' ? 'a' : 'b',
      connectionId: ethers.keccak256(ethers.toUtf8Bytes(`${this.wallet.address}:${nonce}`)),
    };

    const message = {
      action,
      nonce,
      ...phantomAgent,
    };

    const signature = await this.wallet.signTypedData(
      EIP712_DOMAIN,
      this.getEIP712Types(action.type),
      message
    );

    const { r, s, v } = ethers.Signature.from(signature);
    return { r, s, v };
  }

  private getEIP712Types(actionType: string): Record<string, Array<{ name: string; type: string }>> {
    // Simplified types for signing
    return {
      Action: [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'nonce', type: 'uint64' },
        { name: 'signatureChainId', type: 'uint64' },
      ],
    };
  }

  private getAssetIndex(coin: string): number {
    const index = this.assetMap.get(coin);
    if (index === undefined) {
      throw new Error(`Unknown asset: ${coin}`);
    }
    return index;
  }

  private formatSize(size: number, coin: string): string {
    const decimals = this.szDecimals.get(coin) || 3;
    return size.toFixed(decimals);
  }

  private roundPrice(price: number, coin: string): number {
    // Hyperliquid uses 5 significant figures for prices
    const sigFigs = 5;
    const magnitude = Math.floor(Math.log10(price));
    const multiplier = Math.pow(10, sigFigs - magnitude - 1);
    return Math.round(price * multiplier) / multiplier;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async postInfo(payload: any): Promise<any> {
    const response = await fetch(`${this.endpoint}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Info request failed: ${response.status}`);
    }

    return response.json();
  }

  private async postExchange(payload: any): Promise<any> {
    const response = await fetch(`${this.endpoint}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Exchange request failed: ${response.status} - ${text}`);
    }

    return response.json();
  }
}
