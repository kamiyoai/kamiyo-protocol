import { Wallet, JsonRpcProvider, Contract, parseUnits, formatUnits, isAddress } from 'ethers';
import { getConfig } from '../config';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

let cachedProvider: JsonRpcProvider | null = null;
let cachedWallet: Wallet | null = null;

const BALANCE_TIMEOUT_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 90_000;

async function withTimeout<T>(p: Promise<T>, ms: number, label?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label ? `${label} timed out` : 'Timed out')), ms);
  });

  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getBaseProvider(): JsonRpcProvider {
  if (cachedProvider) return cachedProvider;
  const config = getConfig();
  if (!config.BASE_RPC_URL) throw new Error('BASE_RPC_URL not configured');
  cachedProvider = new JsonRpcProvider(config.BASE_RPC_URL, { chainId: 8453, name: 'base' });
  return cachedProvider;
}

function getBaseWallet(): Wallet {
  if (cachedWallet) return cachedWallet;
  const config = getConfig();
  if (!config.BASE_FACILITATOR_KEY) throw new Error('BASE_FACILITATOR_KEY not configured');
  cachedWallet = new Wallet(config.BASE_FACILITATOR_KEY, getBaseProvider());
  return cachedWallet;
}

export function toBaseUnitsEvm(amount: number): bigint {
  return parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

export function fromBaseUnitsEvm(units: bigint): number {
  return parseFloat(formatUnits(units, USDC_DECIMALS));
}

export async function getBaseUsdcBalanceForAddress(address: string): Promise<number> {
  if (!isAddress(address)) throw new Error('Invalid Base address');
  const provider = getBaseProvider();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, provider);
  const balance: bigint = await withTimeout(usdc.balanceOf(address), BALANCE_TIMEOUT_MS, 'USDC balanceOf');
  return fromBaseUnitsEvm(balance);
}

export async function getBaseUsdcBalance(): Promise<number> {
  const wallet = getBaseWallet();
  return getBaseUsdcBalanceForAddress(wallet.address);
}

export async function settlePaymentBase(
  merchantAddress: string,
  amount: number,
  feeBps: number
): Promise<{ txHash: string; fee: number; net: number }> {
  const config = getConfig();
  const wallet = getBaseWallet();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, wallet);

  if (!isAddress(merchantAddress)) throw new Error('Invalid Base address');

  const totalUnits = toBaseUnitsEvm(amount);
  const feeUnits = (totalUnits * BigInt(feeBps)) / 10_000n;
  const netUnits = totalUnits - feeUnits;

  if (netUnits <= 0n) throw new Error('Net amount after fees is zero or negative');

  const balance: bigint = await withTimeout(usdc.balanceOf(wallet.address), BALANCE_TIMEOUT_MS, 'USDC balanceOf');
  if (balance < totalUnits) throw new Error('Facilitator Base USDC balance insufficient');

  const netTx = await usdc.transfer(merchantAddress, netUnits);
  const netReceipt = await withTimeout(netTx.wait(1) as Promise<{ hash: string }>, CONFIRM_TIMEOUT_MS, 'USDC transfer confirm');

  if (feeUnits > 0n && config.BASE_TREASURY_ADDRESS && isAddress(config.BASE_TREASURY_ADDRESS)) {
    try {
      const feeTx = await usdc.transfer(config.BASE_TREASURY_ADDRESS, feeUnits);
      await withTimeout(feeTx.wait(1), CONFIRM_TIMEOUT_MS, 'USDC fee transfer confirm');
    } catch {
      // merchant payment already confirmed; fee can be swept later
    }
  }

  return {
    txHash: netReceipt.hash,
    fee: fromBaseUnitsEvm(feeUnits),
    net: fromBaseUnitsEvm(netUnits)
  };
}

export function isBaseEnabled(): boolean {
  const config = getConfig();
  return !!(config.BASE_RPC_URL && config.BASE_FACILITATOR_KEY);
}

export function getBaseFacilitatorAddress(): string | null {
  try {
    return getBaseWallet().address;
  } catch {
    return null;
  }
}

export { BASE_USDC, USDC_DECIMALS as BASE_USDC_DECIMALS };
