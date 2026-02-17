import { Wallet, JsonRpcProvider, Contract, Signature, parseUnits, formatUnits, isAddress } from 'ethers';
import { getConfig } from '../config';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approveWithAuthorization(address owner, address spender, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function balanceOf(address account) view returns (uint256)'
];

let cachedProvider: JsonRpcProvider | null = null;
let cachedWallet: Wallet | null = null;
let cachedUsdcEip712Domain: { name: string; version: string; chainId: number; verifyingContract: string } | null = null;

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

export function getBaseProvider(): JsonRpcProvider {
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

export async function getBaseUsdcEip712Domain(): Promise<{
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}> {
  if (cachedUsdcEip712Domain) return cachedUsdcEip712Domain;

  const provider = getBaseProvider();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, provider);

  const [name, versionRaw] = await Promise.all([
    withTimeout(usdc.name() as Promise<string>, BALANCE_TIMEOUT_MS, 'USDC name'),
    withTimeout(
      (usdc.version?.() as Promise<string> | undefined) ?? Promise.resolve('2'),
      BALANCE_TIMEOUT_MS,
      'USDC version'
    ).catch(() => '2'),
  ]);

  const version = typeof versionRaw === 'string' && versionRaw.trim() ? versionRaw.trim() : '2';

  cachedUsdcEip712Domain = {
    name,
    version,
    chainId: 8453,
    verifyingContract: BASE_USDC,
  };

  return cachedUsdcEip712Domain;
}

export async function getBaseUsdcBalanceMicroForAddress(address: string): Promise<bigint> {
  if (!isAddress(address)) throw new Error('Invalid Base address');
  const provider = getBaseProvider();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, provider);
  return withTimeout(usdc.balanceOf(address), BALANCE_TIMEOUT_MS, 'USDC balanceOf');
}

export async function getBaseUsdcBalanceForAddress(address: string): Promise<number> {
  const balance = await getBaseUsdcBalanceMicroForAddress(address);
  return fromBaseUnitsEvm(balance);
}

export async function getBaseUsdcBalance(): Promise<number> {
  const wallet = getBaseWallet();
  return getBaseUsdcBalanceForAddress(wallet.address);
}

export async function getBaseUsdcAllowanceMicro(owner: string, spender: string): Promise<bigint> {
  if (!isAddress(owner)) throw new Error('Invalid Base address');
  if (!isAddress(spender)) throw new Error('Invalid spender address');
  const provider = getBaseProvider();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, provider);
  return withTimeout(usdc.allowance(owner, spender), BALANCE_TIMEOUT_MS, 'USDC allowance');
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

export async function settleDelegatedPaymentBase(params: {
  payerAddress: string;
  merchantAddress: string;
  totalMicro: bigint;
  feeBps: number;
}): Promise<{ txHash: string; feeMicro: bigint; netMicro: bigint; feeTxHash: string | null }> {
  const config = getConfig();
  const wallet = getBaseWallet();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, wallet);

  if (!isAddress(params.payerAddress)) throw new Error('Invalid payer Base address');
  if (!isAddress(params.merchantAddress)) throw new Error('Invalid merchant Base address');

  const totalMicro = params.totalMicro;
  if (totalMicro <= 0n) throw new Error('Amount must be positive');

  const feeMicro = (totalMicro * BigInt(params.feeBps)) / 10_000n;
  const netMicro = totalMicro - feeMicro;

  if (netMicro <= 0n) throw new Error('Net amount after fees is zero or negative');

  const [balance, allowance] = await Promise.all([
    getBaseUsdcBalanceMicroForAddress(params.payerAddress),
    getBaseUsdcAllowanceMicro(params.payerAddress, wallet.address),
  ]);

  if (balance < totalMicro) throw new Error('Payer Base USDC balance insufficient');
  if (allowance < totalMicro) throw new Error('Payer Base USDC allowance insufficient');

  const netTx = await usdc.transferFrom(params.payerAddress, params.merchantAddress, netMicro);
  const netReceipt = await withTimeout(netTx.wait(1) as Promise<{ hash: string }>, CONFIRM_TIMEOUT_MS, 'USDC transferFrom confirm');

  let feeTxHash: string | null = null;
  if (feeMicro > 0n && config.BASE_TREASURY_ADDRESS && isAddress(config.BASE_TREASURY_ADDRESS)) {
    try {
      const feeTx = await usdc.transferFrom(params.payerAddress, config.BASE_TREASURY_ADDRESS, feeMicro);
      const feeReceipt = await withTimeout(feeTx.wait(1) as Promise<{ hash: string }>, CONFIRM_TIMEOUT_MS, 'USDC fee transferFrom confirm');
      feeTxHash = feeReceipt.hash;
    } catch {
      // net transfer is already confirmed; fee can be retried if allowance remains.
    }
  }

  return { txHash: netReceipt.hash, feeMicro, netMicro, feeTxHash };
}

export async function approveBaseUsdcWithAuthorization(params: {
  owner: string;
  spender: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}): Promise<{ txHash: string }> {
  const wallet = getBaseWallet();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, wallet);

  if (!isAddress(params.owner)) throw new Error('Invalid owner Base address');
  if (!isAddress(params.spender)) throw new Error('Invalid spender Base address');

  const sig = Signature.from(params.signature);

  const tx = await usdc.approveWithAuthorization(
    params.owner,
    params.spender,
    params.value,
    params.validAfter,
    params.validBefore,
    params.nonce,
    sig.v,
    sig.r,
    sig.s
  );
  const receipt = await withTimeout(tx.wait(1) as Promise<{ hash: string }>, CONFIRM_TIMEOUT_MS, 'USDC approveWithAuthorization confirm');
  return { txHash: receipt.hash };
}





export async function settleAuthorizedPaymentBase(params: {
  payerAddress: string;
  merchantAddress: string;
  totalMicro: bigint;
  feeBps: number;
  netAuthorization: {
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
    signature: `0x${string}`;
  };
  feeAuthorization?: {
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
    signature: `0x${string}`;
  };
}): Promise<{ txHash: string; feeMicro: bigint; netMicro: bigint; feeTxHash: string | null }> {
  const config = getConfig();

  if (!isAddress(params.payerAddress)) throw new Error('Invalid payer Base address');
  if (!isAddress(params.merchantAddress)) throw new Error('Invalid merchant Base address');

  const totalMicro = params.totalMicro;
  if (totalMicro <= 0n) throw new Error('Amount must be positive');

  const feeMicro = (totalMicro * BigInt(params.feeBps)) / 10_000n;
  const netMicro = totalMicro - feeMicro;

  if (netMicro <= 0n) throw new Error('Net amount after fees is zero or negative');

  const balance = await getBaseUsdcBalanceMicroForAddress(params.payerAddress);
  if (balance < totalMicro) throw new Error('Payer Base USDC balance insufficient');

  const netTransfer = await transferBaseUsdcWithAuthorization({
    from: params.payerAddress,
    to: params.merchantAddress,
    value: netMicro,
    validAfter: params.netAuthorization.validAfter,
    validBefore: params.netAuthorization.validBefore,
    nonce: params.netAuthorization.nonce,
    signature: params.netAuthorization.signature,
  });

  let feeTxHash: string | null = null;
  if (feeMicro > 0n && config.BASE_TREASURY_ADDRESS && isAddress(config.BASE_TREASURY_ADDRESS)) {
    if (!params.feeAuthorization) throw new Error('Missing fee authorization');

    const feeTransfer = await transferBaseUsdcWithAuthorization({
      from: params.payerAddress,
      to: config.BASE_TREASURY_ADDRESS,
      value: feeMicro,
      validAfter: params.feeAuthorization.validAfter,
      validBefore: params.feeAuthorization.validBefore,
      nonce: params.feeAuthorization.nonce,
      signature: params.feeAuthorization.signature,
    });
    feeTxHash = feeTransfer.txHash;
  }

  return { txHash: netTransfer.txHash, feeMicro, netMicro, feeTxHash };
}
export async function transferBaseUsdcWithAuthorization(params: {
  from: string;
  to: string;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}): Promise<{ txHash: string }> {
  const wallet = getBaseWallet();
  const usdc = new Contract(BASE_USDC, ERC20_ABI, wallet);

  if (!isAddress(params.from)) throw new Error('Invalid from Base address');
  if (!isAddress(params.to)) throw new Error('Invalid to Base address');

  const sig = Signature.from(params.signature);

  const tx = await usdc.transferWithAuthorization(
    params.from,
    params.to,
    params.value,
    params.validAfter,
    params.validBefore,
    params.nonce,
    sig.v,
    sig.r,
    sig.s
  );
  const receipt = await withTimeout(
    tx.wait(1) as Promise<{ hash: string }>,
    CONFIRM_TIMEOUT_MS,
    'USDC transferWithAuthorization confirm'
  );
  return { txHash: receipt.hash };
}
export { BASE_USDC, USDC_DECIMALS as BASE_USDC_DECIMALS };
