// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IHyperCore
 * @notice Interface for Hyperliquid precompile interactions
 * @dev Precompiles are at addresses 0x0000...0800+
 */
interface IHyperCore {
    struct Position {
        int64 szi;           // Position size (negative = short)
        uint64 entryPx;      // Entry price
        int64 unrealizedPnl; // Unrealized PnL
        uint64 marginUsed;   // Margin used
    }

    struct SpotBalance {
        uint64 total;
        uint64 hold;
    }

    /// @notice Get user's perp position for a given asset
    function getUserPosition(address user, uint32 assetId) external view returns (Position memory);

    /// @notice Get user's spot balance for a given token
    function getSpotBalance(address user, uint32 tokenId) external view returns (SpotBalance memory);

    /// @notice Get user's total account value in USD
    function getAccountValue(address user) external view returns (uint64);

    /// @notice Get user's total margin used
    function getMarginUsed(address user) external view returns (uint64);

    /// @notice Get user's realized PnL
    function getRealizedPnl(address user) external view returns (int64);
}

/**
 * @title ICoreWriter
 * @notice Interface for writing to HyperCore from HyperEVM
 */
interface ICoreWriter {
    /// @notice Transfer tokens from EVM to Core
    function sendToCore(address token, uint256 amount) external;

    /// @notice Transfer tokens from Core to EVM
    function sendToEvm(address token, uint256 amount, address recipient) external;
}
