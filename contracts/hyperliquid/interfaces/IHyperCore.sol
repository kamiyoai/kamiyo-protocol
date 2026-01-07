// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IHyperCore
 * @author Kamiyo Protocol
 * @notice Interface for Hyperliquid precompile interactions
 * @dev Precompiles are available at addresses 0x0000...0800+
 *      These provide read access to L1 state from HyperEVM contracts.
 *
 * Precompile Addresses:
 * - 0x0800: Read user state (positions, balances)
 * - 0x0801: Read market data (prices, funding)
 * - 0x0802: Read system state (open interest, etc.)
 */
interface IHyperCore {
    

    /// @notice Perpetual position data
    struct Position {
        int64 szi;              // Position size (negative = short)
        uint64 entryPx;         // Entry price (8 decimals)
        int64 unrealizedPnl;    // Unrealized PnL in USD (6 decimals)
        uint64 marginUsed;      // Margin used (6 decimals)
        uint64 liquidationPx;   // Liquidation price (8 decimals)
        uint32 leverage;        // Current leverage (2 decimals)
    }

    /// @notice Spot token balance
    struct SpotBalance {
        uint64 total;           // Total balance (token decimals)
        uint64 hold;            // Amount on hold (in orders)
        uint64 available;       // Available for trading
    }

    /// @notice Account summary
    struct AccountSummary {
        uint64 accountValue;    // Total account value in USD
        uint64 marginUsed;      // Total margin used
        uint64 availableMargin; // Available margin for new positions
        int64 totalPnl;         // Total unrealized PnL
        uint32 positionCount;   // Number of open positions
    }

    /// @notice Market data
    struct MarketData {
        uint64 markPx;          // Mark price (8 decimals)
        uint64 indexPx;         // Index price (8 decimals)
        int64 fundingRate;      // Current funding rate (6 decimals)
        uint64 openInterest;    // Open interest in contracts
        uint64 volume24h;       // 24h volume in USD
    }

    

    /// @notice Get user's perpetual position for a given asset
    /// @param user User address
    /// @param assetId Asset identifier (e.g., 0 = BTC, 1 = ETH)
    /// @return position Position data
    function getUserPosition(
        address user,
        uint32 assetId
    ) external view returns (Position memory position);

    /// @notice Get user's spot balance for a given token
    /// @param user User address
    /// @param tokenId Token identifier
    /// @return balance Spot balance data
    function getSpotBalance(
        address user,
        uint32 tokenId
    ) external view returns (SpotBalance memory balance);

    /// @notice Get user's total account value in USD
    /// @param user User address
    /// @return value Account value (6 decimals)
    function getAccountValue(address user) external view returns (uint64 value);

    /// @notice Get user's total margin used
    /// @param user User address
    /// @return margin Margin used (6 decimals)
    function getMarginUsed(address user) external view returns (uint64 margin);

    /// @notice Get user's available margin
    /// @param user User address
    /// @return margin Available margin (6 decimals)
    function getAvailableMargin(address user) external view returns (uint64 margin);

    /// @notice Get user's realized PnL
    /// @param user User address
    /// @return pnl Realized PnL (6 decimals, can be negative)
    function getRealizedPnl(address user) external view returns (int64 pnl);

    /// @notice Get complete account summary
    /// @param user User address
    /// @return summary Account summary data
    function getAccountSummary(
        address user
    ) external view returns (AccountSummary memory summary);

    /// @notice Get all open positions for a user
    /// @param user User address
    /// @return assetIds Array of asset IDs with open positions
    /// @return positions Array of position data
    function getAllPositions(
        address user
    ) external view returns (uint32[] memory assetIds, Position[] memory positions);

    

    /// @notice Get current market data for an asset
    /// @param assetId Asset identifier
    /// @return data Market data
    function getMarketData(
        uint32 assetId
    ) external view returns (MarketData memory data);

    /// @notice Get mark price for an asset
    /// @param assetId Asset identifier
    /// @return price Mark price (8 decimals)
    function getMarkPrice(uint32 assetId) external view returns (uint64 price);

    /// @notice Get index price for an asset
    /// @param assetId Asset identifier
    /// @return price Index price (8 decimals)
    function getIndexPrice(uint32 assetId) external view returns (uint64 price);

    /// @notice Get current funding rate for an asset
    /// @param assetId Asset identifier
    /// @return rate Funding rate (6 decimals, can be negative)
    function getFundingRate(uint32 assetId) external view returns (int64 rate);

    

    /// @notice Get total open interest for an asset
    /// @param assetId Asset identifier
    /// @return oi Open interest in contracts
    function getOpenInterest(uint32 assetId) external view returns (uint64 oi);

    /// @notice Get total 24h volume for an asset
    /// @param assetId Asset identifier
    /// @return volume 24h volume in USD (6 decimals)
    function get24hVolume(uint32 assetId) external view returns (uint64 volume);
}

/**
 * @title ICoreWriter
 * @author Kamiyo Protocol
 * @notice Interface for writing to HyperCore from HyperEVM
 * @dev These functions bridge assets between HyperEVM and the core L1.
 *      Requires appropriate approvals and sufficient balances.
 */
interface ICoreWriter {
    

    event SentToCore(address indexed sender, address indexed token, uint256 amount);
    event SentToEvm(address indexed recipient, address indexed token, uint256 amount);

    

    /// @notice Transfer tokens from EVM to Core L1
    /// @dev Tokens are locked on EVM side and credited on Core
    /// @param token Token address (use address(0) for native token)
    /// @param amount Amount to transfer
    function sendToCore(address token, uint256 amount) external;

    /// @notice Transfer tokens from Core L1 to EVM
    /// @dev Tokens are debited from Core and unlocked on EVM
    /// @param token Token address (use address(0) for native token)
    /// @param amount Amount to transfer
    /// @param recipient Recipient address on EVM
    function sendToEvm(address token, uint256 amount, address recipient) external;

    /// @notice Get pending transfer status
    /// @param transferId Transfer identifier
    /// @return completed Whether transfer is completed
    /// @return amount Transfer amount
    function getTransferStatus(
        bytes32 transferId
    ) external view returns (bool completed, uint256 amount);
}

/**
 * @title IHyperCoreAgent
 * @author Kamiyo Protocol
 * @notice Interface for agent-based trading on HyperCore
 * @dev Allows authorized agents to execute trades on behalf of users
 */
interface IHyperCoreAgent {
    /// @notice Order parameters
    struct OrderParams {
        uint32 assetId;         // Asset to trade
        bool isBuy;             // True for buy, false for sell
        uint64 size;            // Size in contracts
        uint64 limitPx;         // Limit price (0 for market)
        bool reduceOnly;        // Only reduce position
        uint32 tpTriggerPx;     // Take profit trigger (0 = none)
        uint32 slTriggerPx;     // Stop loss trigger (0 = none)
    }

    /// @notice Execute a trade for an authorized user
    /// @param user User address
    /// @param params Order parameters
    /// @return orderId Order identifier
    function executeOrder(
        address user,
        OrderParams calldata params
    ) external returns (bytes32 orderId);

    /// @notice Cancel an order
    /// @param user User address
    /// @param orderId Order to cancel
    function cancelOrder(address user, bytes32 orderId) external;

    /// @notice Check if agent is authorized for user
    /// @param user User address
    /// @param agent Agent address
    /// @return authorized Whether agent is authorized
    function isAuthorized(address user, address agent) external view returns (bool authorized);

    /// @notice Authorize an agent to trade on behalf of user
    /// @param agent Agent address to authorize
    function authorizeAgent(address agent) external;

    /// @notice Revoke agent authorization
    /// @param agent Agent address to revoke
    function revokeAgent(address agent) external;
}
