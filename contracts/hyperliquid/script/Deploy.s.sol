// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../AgentRegistry.sol";
import "../KamiyoVault.sol";

/**
 * @title Deploy
 * @notice Deployment script for Kamiyo Hyperliquid contracts
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url hyperliquid-testnet --broadcast
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AgentRegistry with deployer as initial dispute resolver
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at:", address(registry));

        // Deploy KamiyoVault
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        console.log("KamiyoVault deployed at:", address(vault));

        // Configure AgentRegistry to allow vault to update copiers
        registry.setVault(address(vault));
        console.log("Vault configured in AgentRegistry");

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n========== DEPLOYMENT SUMMARY ==========");
        console.log("Network: Hyperliquid");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("AgentRegistry:", address(registry));
        console.log("KamiyoVault:", address(vault));
        console.log("");
        console.log("Admin:", deployer);
        console.log("Dispute Resolver:", deployer);
        console.log("=========================================\n");

        // Output for SDK types.ts update
        console.log("// Update packages/kamiyo-hyperliquid/src/types.ts:");
        console.log("contracts: {");
        console.log("  agentRegistry: '%s',", address(registry));
        console.log("  kamiyoVault: '%s',", address(vault));
        console.log("}");
    }
}

/**
 * @title DeployTestnet
 * @notice Testnet deployment with test configuration
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying to TESTNET from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        AgentRegistry registry = new AgentRegistry(deployer);
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        registry.setVault(address(vault));

        // Set a lower dispute fee for testnet
        vault.setDisputeFee(0.001 ether);

        vm.stopBroadcast();

        console.log("\n========== TESTNET DEPLOYMENT ==========");
        console.log("AgentRegistry:", address(registry));
        console.log("KamiyoVault:", address(vault));
        console.log("Dispute Fee: 0.001 HYPE");
        console.log("=========================================\n");
    }
}

/**
 * @title Verify
 * @notice Verify deployed contracts
 */
contract Verify is Script {
    function run() external view {
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address vaultAddr = vm.envAddress("KAMIYO_VAULT");

        AgentRegistry registry = AgentRegistry(payable(registryAddr));
        KamiyoVault vault = KamiyoVault(payable(vaultAddr));

        console.log("\n========== CONTRACT VERIFICATION ==========");

        // Verify AgentRegistry
        console.log("AgentRegistry:");
        console.log("  Address:", registryAddr);
        console.log("  Admin:", registry.admin());
        console.log("  Dispute Resolver:", registry.disputeResolver());
        console.log("  Vault:", registry.vault());
        console.log("  Total Agents:", registry.totalAgents());
        console.log("  Total Staked:", registry.totalStaked());
        console.log("  Min Stake:", registry.minStake());

        // Verify KamiyoVault
        console.log("\nKamiyoVault:");
        console.log("  Address:", vaultAddr);
        console.log("  Admin:", vault.admin());
        console.log("  Dispute Resolver:", vault.disputeResolver());
        console.log("  Agent Registry:", address(vault.agentRegistry()));
        console.log("  Position Count:", vault.positionCount());
        console.log("  Dispute Count:", vault.disputeCount());
        console.log("  Total Deposits:", vault.totalDeposits());
        console.log("  Dispute Fee:", vault.disputeFee());

        console.log("===========================================\n");
    }
}
