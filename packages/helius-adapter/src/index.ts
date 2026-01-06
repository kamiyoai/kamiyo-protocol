/**
 * @kamiyo/helius-adapter
 * Production-ready Helius RPC adapter for KAMIYO Protocol
 *
 * Features:
 * - Connection pooling with health checks and failover
 * - Rate limiting with token bucket algorithm
 * - Priority fee estimation and calculation
 * - Transaction parsing and escrow state management
 * - Real-time subscriptions via websocket
 *
 * @example
 * ```typescript
 * import { KamiyoHeliusClient } from '@kamiyo/helius-adapter';
 *
 * const client = new KamiyoHeliusClient({
 *   apiKey: 'your-helius-api-key',
 *   cluster: 'mainnet-beta'
 * });
 *
 * await client.init();
 *
 * // Get escrow state
 * const { pda } = client.deriveEscrowPDA('tx-123');
 * const state = await client.getEscrowState(pda);
 *
 * // Get priority fee
 * const fee = await client.getOperationFee('INITIALIZE_ESCROW', pda, 'standard');
 *
 * // Subscribe to escrow changes
 * const subscription = await client.subscribeToEscrow(pda, {
 *   onStateChange: (state) => console.log('Escrow updated:', state)
 * });
 *
 * await client.shutdown();
 * ```
 */

// Main client
export { KamiyoHeliusClient } from './client';

// Connection management
export { ConnectionPool } from './connection-pool';
export { RateLimiter, rateLimited } from './rate-limiter';

// Priority fees
export { PriorityFeeCalculator } from './priority-fees';

// Transaction parsing
export {
    parseTransaction,
    parseTransactions,
    filterKamiyoTransactions,
    parseEscrowState,
    groupByEscrow,
    calculateEscrowLifecycle,
    detectTypeFromLogs,
    extractQualityScoreFromLogs,
    extractRefundFromLogs
} from './parser';

// Constants
export {
    KAMIYO_PROGRAM_ID,
    HELIUS_ENDPOINTS,
    HELIUS_API_ENDPOINTS,
    INSTRUCTION_DISCRIMINATORS,
    PDA_SEEDS,
    FEE_STRATEGIES,
    COMPUTE_UNITS,
    DEFAULTS,
    STATUS_MAP,
    LOG_PATTERNS
} from './constants';

// Types
export type {
    // Configuration
    HeliusConfig,
    ConnectionPoolConfig,

    // Escrow
    EscrowStatus,
    EscrowState,
    EscrowParams,
    CreateEscrowResult,

    // Transactions
    TransactionType,
    ParsedTransaction,
    TransactionFilter,

    // Priority Fees
    PriorityFeeLevels,
    PriorityFeeEstimate,
    FeeStrategy,
    FeeStrategyConfig,

    // Subscriptions
    SubscriptionOptions,
    Subscription,

    // Helius API
    HeliusWebhookPayload,
    HeliusEnhancedTransaction,
    HeliusPriorityFeeResponse,
    AccountData,
    TokenBalanceChange,
    WebhookEvents,
    InstructionData,
    InnerInstruction,
    NativeTransfer,
    TokenTransfer,

    // Errors
    HeliusAdapterError,
    RateLimitError,
    ConnectionError,
    ParseError
} from './types';
