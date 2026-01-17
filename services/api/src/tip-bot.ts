/**
 * Send Bot - Social payments via X mentions
 *
 * Commands:
 *   !send @username 0.1 SOL         - Send SOL to @username
 *   !send @username 1000 KAMIYO     - Send KAMIYO tokens
 *   !send @username 0.1 SOL from WIF - Swap WIF to SOL and send
 *   !pending                        - Show pending sends to claim
 *   !claim                          - Claim all pending sends
 *   !cancel <id>                    - Cancel a pending send
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { JupiterSwap, SOL_MINT } from '@kamiyo/x402-client';
import * as db from './db.js';

// KAMIYO token mint on Solana
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const KAMIYO_DECIMALS = 6;

// Limits
const MIN_TIP_SOL = 0.001;
const MAX_TIP_SOL = 10;
const MIN_TIP_KAMIYO = 1;
const MAX_TIP_KAMIYO = 1_000_000;

// Input validation constants
const MAX_USERNAME_LENGTH = 15; // Twitter max username length
const MAX_COMMAND_LENGTH = 100;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const VALID_TOKENS = ['SOL', 'KAMIYO'] as const;

// Logging helper
function logTipEvent(
  event: string,
  data: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, event, ...data };
  if (level === 'error') {
    console.error('[TIP-BOT]', JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn('[TIP-BOT]', JSON.stringify(logEntry));
  } else {
    console.log('[TIP-BOT]', JSON.stringify(logEntry));
  }
}

export interface SendCommand {
  type: 'send' | 'swap-send' | 'pending' | 'claim' | 'cancel';
  recipient?: string;
  amount?: number;
  token?: 'SOL' | 'KAMIYO';
  sendId?: number;
  inputToken?: string; // Token mint address or symbol for swap-send
}

export interface SendResult {
  success: boolean;
  message: string;
  txSignature?: string;
  pending?: boolean;
  sendId?: number;
}

// Input validation
export function validateUsername(username: string): string | null {
  if (!username || typeof username !== 'string') {
    return 'Invalid username';
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return `Username too long (max ${MAX_USERNAME_LENGTH} chars)`;
  }
  if (!USERNAME_REGEX.test(username)) {
    return 'Username contains invalid characters';
  }
  return null;
}

export function validateWalletAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  if (address.length < 32 || address.length > 44) return false;
  // Base58 character set
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeInput(text: string): string {
  if (typeof text !== 'string') return '';
  // Remove null bytes and control characters except newlines
  return text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_COMMAND_LENGTH);
}

// Command parsing with strict regex
// Format 1: !send @username amount token
const SEND_REGEX = /^!send\s+@([a-zA-Z0-9_]{1,15})\s+(\d+(?:\.\d{1,9})?)\s+(SOL|KAMIYO)$/i;
// Format 2: !send amount token @username (alternate ordering)
const SEND_REGEX_ALT = /^!send\s+(\d+(?:\.\d{1,9})?)\s+(SOL|KAMIYO)\s+@([a-zA-Z0-9_]{1,15})$/i;
// Swap-and-send: !send @user 0.1 SOL from WIF (or mint address)
const SWAP_SEND_REGEX = /^!send\s+@([a-zA-Z0-9_]{1,15})\s+(\d+(?:\.\d{1,9})?)\s+(SOL|KAMIYO)\s+from\s+([a-zA-Z0-9]+)$/i;
// Swap-and-send alternate: !send 0.1 SOL @user from WIF
const SWAP_SEND_REGEX_ALT = /^!send\s+(\d+(?:\.\d{1,9})?)\s+(SOL|KAMIYO)\s+@([a-zA-Z0-9_]{1,15})\s+from\s+([a-zA-Z0-9]+)$/i;
const PENDING_REGEX = /^!pending$/i;
const CLAIM_REGEX = /^!claim$/i;
const CANCEL_REGEX = /^!cancel\s+(\d{1,10})$/i;

// Common token symbol -> mint address mapping
const TOKEN_MINTS: Record<string, string> = {
  SOL: SOL_MINT,
  WSOL: SOL_MINT,
  KAMIYO: KAMIYO_MINT.toBase58(),
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

export function parseSendCommand(text: string): SendCommand | null {
  const sanitized = sanitizeInput(text).trim();
  if (!sanitized) return null;

  // Check swap-send first (more specific pattern)
  // !send @username amount token from inputToken OR !send amount token @username from inputToken
  const swapMatch = sanitized.match(SWAP_SEND_REGEX);
  const swapMatchAlt = sanitized.match(SWAP_SEND_REGEX_ALT);
  const swapData = swapMatch
    ? { recipient: swapMatch[1], amount: swapMatch[2], token: swapMatch[3], inputToken: swapMatch[4] }
    : swapMatchAlt
    ? { recipient: swapMatchAlt[3], amount: swapMatchAlt[1], token: swapMatchAlt[2], inputToken: swapMatchAlt[4] }
    : null;

  if (swapData) {
    const recipient = swapData.recipient.toLowerCase();
    const amountStr = swapData.amount;
    const token = swapData.token.toUpperCase();
    const inputTokenRaw = swapData.inputToken.toUpperCase();

    // Validate output token
    if (!VALID_TOKENS.includes(token as typeof VALID_TOKENS[number])) {
      return null;
    }

    // Validate username
    const usernameError = validateUsername(recipient);
    if (usernameError) {
      logTipEvent('parse_error', { reason: usernameError, input: sanitized }, 'warn');
      return null;
    }

    // Parse and validate amount
    const amount = parseFloat(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    // Resolve input token (symbol or mint address)
    const inputToken = TOKEN_MINTS[inputTokenRaw] || inputTokenRaw;

    // Prevent swapping same token
    const outputMint = token === 'SOL' ? SOL_MINT : KAMIYO_MINT.toBase58();
    if (inputToken === outputMint) {
      logTipEvent('parse_error', { reason: 'same_token_swap', input: sanitized }, 'warn');
      return null;
    }

    return {
      type: 'swap-send',
      recipient,
      amount,
      token: token as 'SOL' | 'KAMIYO',
      inputToken,
    };
  }

  // !send @username amount token OR !send amount token @username
  const sendMatch = sanitized.match(SEND_REGEX);
  const sendMatchAlt = sanitized.match(SEND_REGEX_ALT);
  const sendData = sendMatch
    ? { recipient: sendMatch[1], amount: sendMatch[2], token: sendMatch[3] }
    : sendMatchAlt
    ? { recipient: sendMatchAlt[3], amount: sendMatchAlt[1], token: sendMatchAlt[2] }
    : null;

  if (sendData) {
    const recipient = sendData.recipient.toLowerCase();
    const amountStr = sendData.amount;
    const token = sendData.token.toUpperCase();

    // Validate token
    if (!VALID_TOKENS.includes(token as typeof VALID_TOKENS[number])) {
      return null;
    }

    // Validate username
    const usernameError = validateUsername(recipient);
    if (usernameError) {
      logTipEvent('parse_error', { reason: usernameError, input: sanitized }, 'warn');
      return null;
    }

    // Parse and validate amount
    const amount = parseFloat(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return {
      type: 'send',
      recipient,
      amount,
      token: token as 'SOL' | 'KAMIYO',
    };
  }

  // !pending
  if (PENDING_REGEX.test(sanitized)) {
    return { type: 'pending' };
  }

  // !claim
  if (CLAIM_REGEX.test(sanitized)) {
    return { type: 'claim' };
  }

  // !cancel <id>
  const cancelMatch = sanitized.match(CANCEL_REGEX);
  if (cancelMatch) {
    const sendId = parseInt(cancelMatch[1], 10);
    if (!Number.isFinite(sendId) || sendId <= 0 || sendId > 2147483647) {
      return null;
    }
    return {
      type: 'cancel',
      sendId,
    };
  }

  return null;
}

// Validate send amount
export function validateSendAmount(amount: number, token: 'SOL' | 'KAMIYO'): string | null {
  if (isNaN(amount) || amount <= 0) {
    return 'Invalid amount';
  }

  if (token === 'SOL') {
    if (amount < MIN_TIP_SOL) return `Min: ${MIN_TIP_SOL} SOL`;
    if (amount > MAX_TIP_SOL) return `Max: ${MAX_TIP_SOL} SOL`;
  } else {
    if (amount < MIN_TIP_KAMIYO) return `Min: ${MIN_TIP_KAMIYO} KAMIYO`;
    if (amount > MAX_TIP_KAMIYO) return `Max: ${MAX_TIP_KAMIYO} KAMIYO`;
  }

  return null;
}

// Convert amount to lamports/token units
export function toSmallestUnit(amount: number, token: 'SOL' | 'KAMIYO'): bigint {
  if (token === 'SOL') {
    return BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
  }
  return BigInt(Math.floor(amount * Math.pow(10, KAMIYO_DECIMALS)));
}

// Convert lamports/token units to display amount
export function fromSmallestUnit(lamports: number | bigint, token: string): number {
  const value = typeof lamports === 'bigint' ? Number(lamports) : lamports;
  if (token === 'SOL') {
    return value / LAMPORTS_PER_SOL;
  }
  return value / Math.pow(10, KAMIYO_DECIMALS);
}

// Get SOL balance
export async function getSolBalance(connection: Connection, wallet: string): Promise<bigint> {
  const pubkey = new PublicKey(wallet);
  const balance = await connection.getBalance(pubkey);
  return BigInt(balance);
}

// Get KAMIYO balance
export async function getKamiyoBalance(connection: Connection, wallet: string): Promise<bigint> {
  const pubkey = new PublicKey(wallet);
  const ata = await getAssociatedTokenAddress(KAMIYO_MINT, pubkey);

  try {
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch {
    return 0n;
  }
}

// Check if wallet has sufficient balance
export async function hasSufficientBalance(
  connection: Connection,
  wallet: string,
  amount: bigint,
  token: 'SOL' | 'KAMIYO'
): Promise<boolean> {
  if (token === 'SOL') {
    const balance = await getSolBalance(connection, wallet);
    // Account for tx fee (~5000 lamports)
    return balance >= amount + 5000n;
  }

  const balance = await getKamiyoBalance(connection, wallet);
  return balance >= amount;
}

// Build SOL transfer transaction
export async function buildSolTransferTx(
  connection: Connection,
  from: string,
  to: string,
  lamports: bigint
): Promise<Transaction> {
  const fromPubkey = new PublicKey(from);
  const toPubkey = new PublicKey(to);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = fromPubkey;

  return tx;
}

// Build KAMIYO transfer transaction
export async function buildKamiyoTransferTx(
  connection: Connection,
  from: string,
  to: string,
  amount: bigint
): Promise<Transaction> {
  const fromPubkey = new PublicKey(from);
  const toPubkey = new PublicKey(to);

  const fromAta = await getAssociatedTokenAddress(KAMIYO_MINT, fromPubkey);
  const toAta = await getAssociatedTokenAddress(KAMIYO_MINT, toPubkey);

  const tx = new Transaction();

  // Check if recipient ATA exists
  try {
    await getAccount(connection, toAta);
  } catch {
    // Create ATA for recipient
    tx.add(
      createAssociatedTokenAccountInstruction(fromPubkey, toAta, toPubkey, KAMIYO_MINT)
    );
  }

  // Add transfer instruction
  tx.add(
    createTransferInstruction(fromAta, toAta, fromPubkey, amount, [], TOKEN_PROGRAM_ID)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = fromPubkey;

  return tx;
}

// Transaction confirmation with retry
const TX_CONFIRM_TIMEOUT = 30000; // 30 seconds
const TX_CONFIRM_RETRIES = 3;

export async function confirmTransaction(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<{ confirmed: boolean; error?: string }> {
  for (let attempt = 0; attempt < TX_CONFIRM_RETRIES; attempt++) {
    try {
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      if (result.value.err) {
        logTipEvent('tx_failed', {
          signature,
          error: JSON.stringify(result.value.err),
          attempt,
        }, 'error');
        return { confirmed: false, error: 'Transaction failed on-chain' };
      }

      logTipEvent('tx_confirmed', { signature, attempt }, 'info');
      return { confirmed: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (attempt === TX_CONFIRM_RETRIES - 1) {
        logTipEvent('tx_confirm_timeout', { signature, error: errorMsg }, 'error');
        return { confirmed: false, error: 'Transaction confirmation timed out' };
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { confirmed: false, error: 'Failed to confirm transaction' };
}

// Verify transaction signature format
export function isValidSignature(signature: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  // Base58 encoded, typically 87-88 characters
  if (signature.length < 80 || signature.length > 90) return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(signature);
}

// Main send execution
export async function executeSend(
  connection: Connection,
  senderId: string,
  senderWallet: string,
  recipientUsername: string,
  amount: number,
  token: 'SOL' | 'KAMIYO',
  tweetId?: string
): Promise<SendResult> {
  // Validate sender ID
  if (!senderId || typeof senderId !== 'string' || senderId.length > 64) {
    logTipEvent('send_rejected', { reason: 'invalid_sender_id', senderId }, 'warn');
    return { success: false, message: 'Invalid sender' };
  }

  // Validate wallet address
  if (!validateWalletAddress(senderWallet)) {
    logTipEvent('send_rejected', { reason: 'invalid_wallet', senderId }, 'warn');
    return { success: false, message: 'Invalid wallet address' };
  }

  // Validate recipient username
  const usernameError = validateUsername(recipientUsername);
  if (usernameError) {
    logTipEvent('send_rejected', { reason: usernameError, senderId, recipientUsername }, 'warn');
    return { success: false, message: usernameError };
  }

  // Prevent self-send
  if (recipientUsername.toLowerCase() === senderId.toLowerCase()) {
    logTipEvent('send_rejected', { reason: 'self_send', senderId }, 'warn');
    return { success: false, message: 'Cannot send to yourself' };
  }

  // Validate amount
  const amountError = validateSendAmount(amount, token);
  if (amountError) {
    logTipEvent('send_rejected', { reason: amountError, senderId, amount, token }, 'warn');
    return { success: false, message: amountError };
  }

  // Check rate limit
  const rateInfo = db.getTipRateLimitInfo(senderId);
  if (rateInfo.limited) {
    logTipEvent('send_rate_limited', {
      senderId,
      hourlyCount: rateInfo.hourlyCount,
      dailyCount: rateInfo.dailyCount,
    }, 'warn');
    if (rateInfo.hourlyRemaining === 0) {
      return { success: false, message: 'Rate limit: max 10 sends per hour.' };
    }
    return { success: false, message: 'Rate limit: max 50 sends per day.' };
  }

  const lamports = toSmallestUnit(amount, token);

  // Check balance
  let hasBalance: boolean;
  try {
    hasBalance = await hasSufficientBalance(connection, senderWallet, lamports, token);
  } catch (err) {
    logTipEvent('balance_check_failed', {
      senderId,
      senderWallet,
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
    return { success: false, message: 'Unable to verify balance.' };
  }

  if (!hasBalance) {
    try {
      const balance = token === 'SOL'
        ? fromSmallestUnit(await getSolBalance(connection, senderWallet), 'SOL')
        : fromSmallestUnit(await getKamiyoBalance(connection, senderWallet), 'KAMIYO');
      logTipEvent('insufficient_balance', { senderId, balance, required: amount, token }, 'info');
      return {
        success: false,
        message: `Insufficient balance. You have ${balance.toFixed(token === 'SOL' ? 4 : 0)} ${token}.`,
      };
    } catch {
      return { success: false, message: 'Insufficient balance' };
    }
  }

  // Create pending send
  try {
    const sendId = db.createPendingTip(
      senderId,
      senderWallet,
      recipientUsername.toLowerCase(),
      Number(lamports),
      token,
      tweetId
    );

    logTipEvent('send_created', {
      sendId,
      senderId,
      recipientUsername,
      amount,
      token,
      tweetId,
    }, 'info');

    return {
      success: true,
      message: `Pending: ${amount} ${token} for @${recipientUsername}\n\n@${recipientUsername} has 7 days to link wallet and claim.\n!cancel ${sendId} to cancel.`,
      pending: true,
      sendId,
    };
  } catch (err) {
    logTipEvent('send_create_failed', {
      senderId,
      recipientUsername,
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
    return { success: false, message: 'Failed to create send.' };
  }
}

// Execute direct transfer (when recipient has wallet)
export async function executeDirectTransfer(
  connection: Connection,
  senderId: string,
  senderWallet: string,
  recipientId: string,
  recipientWallet: string,
  amount: number,
  token: 'SOL' | 'KAMIYO',
  tweetId?: string
): Promise<{ tx: Transaction; lamports: bigint }> {
  const lamports = toSmallestUnit(amount, token);

  const tx = token === 'SOL'
    ? await buildSolTransferTx(connection, senderWallet, recipientWallet, lamports)
    : await buildKamiyoTransferTx(connection, senderWallet, recipientWallet, lamports);

  return { tx, lamports };
}

// Get swap quote via Jupiter
export interface SwapQuoteResult {
  inputAmount: number;
  outputAmount: number;
  priceImpact: string;
  inputMint: string;
  outputMint: string;
}

interface JupiterQuoteResponse {
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string;
}

export async function getSwapQuote(
  connection: Connection,
  inputMint: string,
  outputMint: string,
  outputAmount: number // Desired output amount in smallest units
): Promise<SwapQuoteResult | null> {
  // Jupiter quote endpoint - we need to reverse calculate input for desired output
  // For simplicity, we'll get a quote for a large amount and calculate proportionally
  const testAmount = 1_000_000_000; // 1 SOL worth as test
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${testAmount}&slippageBps=50`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const quote = await res.json() as JupiterQuoteResponse;

    const ratio = parseInt(quote.outAmount) / parseInt(quote.inAmount);
    const estimatedInput = Math.ceil(outputAmount / ratio * 1.02); // 2% buffer for slippage

    return {
      inputAmount: estimatedInput,
      outputAmount,
      priceImpact: quote.priceImpactPct || '0',
      inputMint,
      outputMint,
    };
  } catch {
    return null;
  }
}

// Execute swap-and-send: swap input token to output token, then send
export async function executeSwapSend(
  connection: Connection,
  senderKeypair: Keypair,
  senderId: string,
  recipientUsername: string,
  outputAmount: number, // Desired amount in display units (e.g., 0.1 SOL)
  outputToken: 'SOL' | 'KAMIYO',
  inputMint: string,
  tweetId?: string
): Promise<SendResult> {
  // Validate sender
  if (!senderId || typeof senderId !== 'string' || senderId.length > 64) {
    logTipEvent('swap_send_rejected', { reason: 'invalid_sender_id', senderId }, 'warn');
    return { success: false, message: 'Invalid sender' };
  }

  // Validate recipient
  const usernameError = validateUsername(recipientUsername);
  if (usernameError) {
    logTipEvent('swap_send_rejected', { reason: usernameError, senderId, recipientUsername }, 'warn');
    return { success: false, message: usernameError };
  }

  // Prevent self-send
  if (recipientUsername.toLowerCase() === senderId.toLowerCase()) {
    return { success: false, message: 'Cannot send to yourself' };
  }

  // Validate amount
  const amountError = validateSendAmount(outputAmount, outputToken);
  if (amountError) {
    return { success: false, message: amountError };
  }

  // Check rate limit
  const rateInfo = db.getTipRateLimitInfo(senderId);
  if (rateInfo.limited) {
    logTipEvent('swap_send_rate_limited', { senderId }, 'warn');
    return { success: false, message: 'Rate limit exceeded. Try again later.' };
  }

  const outputMint = outputToken === 'SOL' ? SOL_MINT : KAMIYO_MINT.toBase58();
  const outputLamports = Number(toSmallestUnit(outputAmount, outputToken));

  // Get quote to determine required input
  const quote = await getSwapQuote(connection, inputMint, outputMint, outputLamports);
  if (!quote) {
    logTipEvent('swap_quote_failed', { senderId, inputMint, outputMint }, 'warn');
    return { success: false, message: 'Could not get swap quote. Token may not be tradeable.' };
  }

  // Check price impact
  const priceImpact = parseFloat(quote.priceImpact);
  if (priceImpact > 5) {
    return { success: false, message: `Price impact too high (${priceImpact.toFixed(2)}%). Try a smaller amount.` };
  }

  logTipEvent('swap_send_initiated', {
    senderId,
    recipientUsername,
    inputMint: inputMint.slice(0, 8),
    outputToken,
    outputAmount,
    estimatedInput: quote.inputAmount,
    priceImpact: quote.priceImpact,
  }, 'info');

  // Execute swap via Jupiter
  const jupiter = new JupiterSwap(connection, senderKeypair, { slippageBps: 100 }); // 1% slippage
  const swapResult = await jupiter.swap(inputMint, outputMint, quote.inputAmount);

  if (!swapResult.success) {
    logTipEvent('swap_failed', {
      senderId,
      error: swapResult.error,
      inputMint: inputMint.slice(0, 8),
    }, 'error');
    return { success: false, message: `Swap failed: ${swapResult.error || 'Unknown error'}` };
  }

  logTipEvent('swap_completed', {
    senderId,
    swapSig: swapResult.signature?.slice(0, 16),
    inputAmount: swapResult.inputAmount,
    outputAmount: swapResult.outputAmount,
  }, 'info');

  // Create pending send with the swapped amount
  try {
    const sendId = db.createPendingTip(
      senderId,
      senderKeypair.publicKey.toBase58(),
      recipientUsername.toLowerCase(),
      swapResult.outputAmount,
      outputToken,
      tweetId
    );

    logTipEvent('swap_send_created', {
      sendId,
      senderId,
      recipientUsername,
      outputAmount: swapResult.outputAmount,
      outputToken,
      swapSig: swapResult.signature?.slice(0, 16),
    }, 'info');

    const displayAmount = fromSmallestUnit(swapResult.outputAmount, outputToken);
    return {
      success: true,
      message: `Swapped and pending: ${displayAmount.toFixed(outputToken === 'SOL' ? 4 : 0)} ${outputToken} for @${recipientUsername}\n\nSwap tx: ${swapResult.signature?.slice(0, 16)}...\n@${recipientUsername} has 7 days to claim.\n!cancel ${sendId} to cancel.`,
      pending: true,
      sendId,
      txSignature: swapResult.signature,
    };
  } catch (err) {
    logTipEvent('swap_send_create_failed', {
      senderId,
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
    return {
      success: false,
      message: `Swap succeeded but failed to create pending send. Swap tx: ${swapResult.signature}`,
      txSignature: swapResult.signature,
    };
  }
}

// Resolve token symbol to mint address
export function resolveTokenMint(symbolOrMint: string): string {
  const upper = symbolOrMint.toUpperCase();
  return TOKEN_MINTS[upper] || symbolOrMint;
}

// Record completed tip after signature confirmation
export function recordCompletedTip(
  senderId: string,
  recipientId: string,
  lamports: number,
  token: string,
  txSignature: string,
  tweetId?: string
): void {
  db.recordTipHistory(senderId, recipientId, lamports, token, txSignature, tweetId);
}

// Get pending sends for user to claim
export function getPendingSendsForUser(username: string): db.PendingTip[] {
  return db.getPendingTipsForRecipient(username);
}

// Claim pending sends
export async function claimPendingSends(
  connection: Connection,
  recipientId: string,
  recipientUsername: string,
  recipientWallet: string
): Promise<SendResult[]> {
  const pendingSends = db.getPendingTipsForRecipient(recipientUsername);

  if (pendingSends.length === 0) {
    return [{ success: false, message: 'No pending sends to claim' }];
  }

  const results: SendResult[] = [];

  for (const send of pendingSends) {
    db.updatePendingTipRecipientId(send.id, recipientId);

    results.push({
      success: true,
      message: `#${send.id}: ${fromSmallestUnit(send.amount_lamports, send.token)} ${send.token} ready. Waiting for sender confirmation.`,
      pending: true,
      sendId: send.id,
    });
  }

  return results;
}

// Cancel pending send (by sender)
export function cancelPendingSend(senderId: string, sendId: number): SendResult {
  if (!senderId || typeof senderId !== 'string' || senderId.length > 64) {
    logTipEvent('cancel_rejected', { reason: 'invalid_sender', senderId, sendId }, 'warn');
    return { success: false, message: 'Invalid request' };
  }
  if (!Number.isFinite(sendId) || sendId <= 0 || sendId > 2147483647) {
    logTipEvent('cancel_rejected', { reason: 'invalid_send_id', senderId, sendId }, 'warn');
    return { success: false, message: 'Invalid ID' };
  }

  try {
    const send = db.getPendingTip(sendId);

    if (!send) {
      logTipEvent('cancel_rejected', { reason: 'not_found', senderId, sendId }, 'info');
      return { success: false, message: 'Not found' };
    }

    if (send.sender_id !== senderId) {
      logTipEvent('cancel_rejected', { reason: 'not_owner', senderId, sendId, actualOwner: send.sender_id }, 'warn');
      return { success: false, message: 'Not yours to cancel' };
    }

    if (send.status !== 'pending') {
      logTipEvent('cancel_rejected', { reason: 'invalid_status', senderId, sendId, status: send.status }, 'info');
      return { success: false, message: `Already ${send.status}` };
    }

    db.markTipCancelled(sendId);
    logTipEvent('send_cancelled', { sendId, senderId, amount: send.amount_lamports, token: send.token }, 'info');
    return { success: true, message: `#${sendId} cancelled` };
  } catch (err) {
    logTipEvent('cancel_failed', {
      senderId,
      sendId,
      error: err instanceof Error ? err.message : String(err),
    }, 'error');
    return { success: false, message: 'Failed to cancel' };
  }
}

// Get send summary for user
export function getSendSummary(userId: string): string {
  const stats = db.getTipStats(userId);
  const pending = db.getPendingTipsBySender(userId);

  const lines = [
    `Sent: ${stats.tipsSent} (${fromSmallestUnit(stats.totalSent, 'SOL').toFixed(4)} SOL)`,
    `Received: ${stats.tipsReceived} (${fromSmallestUnit(stats.totalReceived, 'SOL').toFixed(4)} SOL)`,
  ];

  if (pending.length > 0) {
    lines.push(`Pending: ${pending.length}`);
  }

  return lines.join('\n');
}

// Format pending sends list
export function formatPendingSendsList(sends: db.PendingTip[]): string {
  if (sends.length === 0) {
    return 'No pending sends';
  }

  return sends.map((send) => {
    const amount = fromSmallestUnit(send.amount_lamports, send.token);
    const expiresIn = Math.ceil((send.expires_at - Math.floor(Date.now() / 1000)) / 86400);
    return `#${send.id}: ${amount} ${send.token} from @${send.sender_id} (${expiresIn}d left)`;
  }).join('\n');
}

// Cleanup expired sends
export function cleanupExpiredSends(): number {
  return db.markExpiredTips();
}
