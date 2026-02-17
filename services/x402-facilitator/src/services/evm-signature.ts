import { Contract, hashMessage, isAddress, verifyMessage } from 'ethers';
import { getBaseProvider } from './base-settlement';

const EIP1271_ABI = ['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'];
const EIP1271_MAGICVALUE = '0x1626ba7e';

export async function verifyEvmMessageSignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  if (!isAddress(params.address)) return false;

  const signature = params.signature.trim();
  if (!signature.startsWith('0x') || signature.length > 2048) return false;

  const message = params.message;
  if (!message) return false;

  const bytes = new TextEncoder().encode(message);

  try {
    const recovered = verifyMessage(bytes, signature);
    if (recovered.toLowerCase() === params.address.toLowerCase()) return true;
  } catch {
    // Fall through to EIP-1271 validation.
  }

  let provider;
  try {
    provider = getBaseProvider();
  } catch {
    return false;
  }

  try {
    const code = await provider.getCode(params.address);
    if (!code || code === '0x') return false;
  } catch {
    return false;
  }

  try {
    const contract = new Contract(params.address, EIP1271_ABI, provider);
    const digest = hashMessage(bytes);
    const result = (await contract.isValidSignature(digest, signature)) as string;
    return typeof result === 'string' && result.toLowerCase() === EIP1271_MAGICVALUE;
  } catch {
    return false;
  }
}
