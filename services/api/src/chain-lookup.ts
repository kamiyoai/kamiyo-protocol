// On-chain lookup utilities

import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { logger } from './logger';
import { getSolanaConnection } from './solana';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

const connection = getSolanaConnection();

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  usdValue: number | null;
}

export interface WalletSummary {
  address: string;
  solBalance: number;
  tokens: TokenHolding[];
  totalUsdValue: number | null;
  kamiyoBalance: number | null;
}

export interface TransactionSummary {
  signature: string;
  type: string;
  description: string;
  timestamp: number | null;
  fee: number;
  success: boolean;
  accounts: string[];
}

// Validate Solana address
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

// Fetch wallet holdings
export async function lookupWallet(address: string): Promise<WalletSummary | null> {
  if (!isValidSolanaAddress(address)) {
    return null;
  }

  try {
    const pubkey = new PublicKey(address);

    // Get SOL balance
    const solBalance = await connection.getBalance(pubkey);
    const solBalanceLamports = solBalance / 1e9;

    // Get token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    const tokens: TokenHolding[] = [];
    let kamiyoBalance: number | null = null;

    for (const account of tokenAccounts.value) {
      const parsed = account.account.data.parsed;
      const info = parsed.info;
      const mint = info.mint;
      const balance = info.tokenAmount.uiAmount;

      if (balance && balance > 0) {
        // Check if it's KAMIYO
        if (mint === KAMIYO_MINT) {
          kamiyoBalance = balance;
        }

        tokens.push({
          mint,
          symbol: mint === KAMIYO_MINT ? 'KAMIYO' : mint.slice(0, 6) + '...',
          name: mint === KAMIYO_MINT ? 'KAMIYO' : 'Unknown',
          balance,
          usdValue: null,
        });
      }
    }

    // If we have Helius API, enrich with metadata
    if (HELIUS_API_KEY && tokens.length > 0) {
      try {
        const enriched = await enrichTokensWithHelius(tokens.slice(0, 10)); // Limit to 10
        tokens.splice(0, tokens.length, ...enriched);
      } catch (err) {
        logger.warn('Helius enrichment failed', { error: String(err) });
      }
    }

    // Sort by balance (highest first), KAMIYO always on top if present
    tokens.sort((a, b) => {
      if (a.mint === KAMIYO_MINT) return -1;
      if (b.mint === KAMIYO_MINT) return 1;
      return (b.usdValue || 0) - (a.usdValue || 0);
    });

    return {
      address,
      solBalance: solBalanceLamports,
      tokens: tokens.slice(0, 10), // Top 10
      totalUsdValue: null,
      kamiyoBalance,
    };
  } catch (err) {
    logger.error('Wallet lookup failed', { address, error: String(err) });
    return null;
  }
}

// Enrich tokens with Helius metadata
async function enrichTokensWithHelius(tokens: TokenHolding[]): Promise<TokenHolding[]> {
  if (!HELIUS_API_KEY) return tokens;

  const mints = tokens.map(t => t.mint);

  const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mintAccounts: mints }),
  });

  if (!response.ok) return tokens;

  const metadata = await response.json() as Array<{
    onChainMetadata?: { metadata?: { data?: { symbol?: string; name?: string } } };
  }>;

  for (let i = 0; i < tokens.length; i++) {
    const meta = metadata[i];
    if (meta?.onChainMetadata?.metadata?.data) {
      tokens[i].symbol = meta.onChainMetadata.metadata.data.symbol || tokens[i].symbol;
      tokens[i].name = meta.onChainMetadata.metadata.data.name || tokens[i].name;
    }
  }

  return tokens;
}

// Format wallet for display
export function formatWalletSummary(wallet: WalletSummary): string {
  const lines: string[] = [];

  lines.push(`Wallet: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`);
  lines.push(`SOL: ${wallet.solBalance.toFixed(4)}`);

  if (wallet.kamiyoBalance !== null) {
    lines.push(`KAMIYO: ${formatNumber(wallet.kamiyoBalance)}`);
  }

  if (wallet.tokens.length > 0) {
    const otherTokens = wallet.tokens.filter(t => t.mint !== KAMIYO_MINT).slice(0, 5);
    if (otherTokens.length > 0) {
      lines.push('Top tokens: ' + otherTokens.map(t => `${t.symbol}: ${formatNumber(t.balance)}`).join(', '));
    }
  }

  return lines.join('\n');
}

// Lookup and decode a transaction
export async function lookupTransaction(signature: string): Promise<TransactionSummary | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return null;

    const description = describeTransaction(tx);

    return {
      signature,
      type: description.type,
      description: description.text,
      timestamp: tx.blockTime ? tx.blockTime * 1000 : null,
      fee: (tx.meta?.fee || 0) / 1e9,
      success: tx.meta?.err === null,
      accounts: tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58()).slice(0, 5),
    };
  } catch (err) {
    logger.error('Transaction lookup failed', { signature, error: String(err) });
    return null;
  }
}

// Describe what a transaction did
function describeTransaction(tx: ParsedTransactionWithMeta): { type: string; text: string } {
  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if ('parsed' in ix) {
      const parsed = ix.parsed;

      if (parsed.type === 'transfer') {
        const amount = parsed.info.lamports ? parsed.info.lamports / 1e9 : parsed.info.amount;
        const unit = parsed.info.lamports ? 'SOL' : 'tokens';
        return {
          type: 'transfer',
          text: `Transferred ${formatNumber(amount)} ${unit}`,
        };
      }

      if (parsed.type === 'transferChecked') {
        const amount = parsed.info.tokenAmount?.uiAmount || 0;
        return {
          type: 'transfer',
          text: `Transferred ${formatNumber(amount)} tokens`,
        };
      }

      if (parsed.type === 'createAccount') {
        return { type: 'create', text: 'Created new account' };
      }

      if (parsed.type === 'closeAccount') {
        return { type: 'close', text: 'Closed token account' };
      }
    }

    // Check for known program IDs
    const programId = 'programId' in ix ? ix.programId.toBase58() : '';

    if (programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4') {
      return { type: 'swap', text: 'Jupiter swap' };
    }

    if (programId === 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc') {
      return { type: 'swap', text: 'Orca swap' };
    }

    if (programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
      return { type: 'swap', text: 'Raydium swap' };
    }

    if (programId === 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K') {
      return { type: 'nft', text: 'Magic Eden transaction' };
    }

    if (programId === 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s') {
      return { type: 'nft', text: 'NFT metadata update' };
    }
  }

  return { type: 'unknown', text: 'Complex transaction' };
}

// Format transaction for display
export function formatTransactionSummary(tx: TransactionSummary): string {
  const lines: string[] = [];

  lines.push(`TX: ${tx.signature.slice(0, 8)}...${tx.signature.slice(-6)}`);
  lines.push(`Type: ${tx.type}`);
  lines.push(`${tx.description}`);
  lines.push(`Status: ${tx.success ? 'Success' : 'Failed'}`);
  lines.push(`Fee: ${tx.fee.toFixed(6)} SOL`);

  if (tx.timestamp) {
    const date = new Date(tx.timestamp);
    lines.push(`Time: ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  }

  return lines.join('\n');
}

// Whale alert - check for large KAMIYO transfers
export interface WhaleAlert {
  type: 'buy' | 'sell' | 'transfer';
  amount: number;
  wallet: string;
  signature: string;
  timestamp: number;
}

let lastCheckedSlot = 0;

export async function checkWhaleMovements(minAmount: number = 1000000): Promise<WhaleAlert[]> {
  const alerts: WhaleAlert[] = [];

  try {
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(KAMIYO_MINT),
      { limit: 20 },
    );

    for (const sig of signatures) {
      if (sig.slot <= lastCheckedSlot) continue;

      const tx = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || tx.meta?.err) continue;

      // Look for large token transfers
      for (const ix of tx.transaction.message.instructions) {
        if ('parsed' in ix && ix.parsed.type === 'transferChecked') {
          const amount = ix.parsed.info.tokenAmount?.uiAmount || 0;
          if (amount >= minAmount) {
            alerts.push({
              type: 'transfer',
              amount,
              wallet: ix.parsed.info.authority || 'unknown',
              signature: sig.signature,
              timestamp: (sig.blockTime || 0) * 1000,
            });
          }
        }
      }
    }

    if (signatures.length > 0) {
      lastCheckedSlot = signatures[0].slot;
    }
  } catch (err) {
    logger.error('Whale check failed', { error: String(err) });
  }

  return alerts;
}

// Format whale alert for posting
export function formatWhaleAlert(alert: WhaleAlert): string {
  const emoji = alert.amount >= 10000000 ? 'Massive' : alert.amount >= 5000000 ? 'Large' : 'Notable';
  return `${emoji} KAMIYO movement: ${formatNumber(alert.amount)} tokens. Wallet: ${alert.wallet.slice(0, 8)}...`;
}

// Helper to format large numbers
function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(2);
}
