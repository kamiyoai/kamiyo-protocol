// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AdminTimelock} from "../src/AdminTimelock.sol";

interface IAdminTransferable {
    function transferAdmin(address newAdmin) external;
    function admin() external view returns (address);
}

/**
 * @title DeployTimelock
 * @notice Deploys AdminTimelock and transfers admin from contracts
 * @dev Run: forge script script/DeployTimelock.s.sol --rpc-url $RPC_URL --broadcast
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer private key (must be current admin)
 *   SIGNER_1 - First signer address (default: deployer)
 *   SIGNER_2 - Second signer address
 *   SIGNER_3 - Third signer address
 */
contract DeployTimelock is Script {
    // Deployed contracts on Hyperliquid mainnet
    address constant AGENT_REGISTRY = 0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d;
    address constant KAMIYO_VAULT = 0xF5B2b62f014459B98991AaE001e33aF75f4fbD15;
    address constant REPUTATION_LIMITS = 0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Get signer addresses from env or use deployer as signer 1
        address signer1 = vm.envOr("SIGNER_1", deployer);
        address signer2 = vm.envAddress("SIGNER_2");
        address signer3 = vm.envAddress("SIGNER_3");

        console.log("Deployer:", deployer);
        console.log("Signer 1:", signer1);
        console.log("Signer 2:", signer2);
        console.log("Signer 3:", signer3);

        address[3] memory signers = [signer1, signer2, signer3];

        vm.startBroadcast(deployerKey);

        // Deploy timelock
        AdminTimelock timelock = new AdminTimelock(signers);
        console.log("AdminTimelock deployed:", address(timelock));

        // Transfer admin on each contract (initiates 2-step transfer)
        console.log("\nInitiating admin transfers...");

        IAdminTransferable registry = IAdminTransferable(AGENT_REGISTRY);
        console.log("AgentRegistry current admin:", registry.admin());
        registry.transferAdmin(address(timelock));
        console.log("AgentRegistry transfer initiated");

        IAdminTransferable vault = IAdminTransferable(KAMIYO_VAULT);
        console.log("KamiyoVault current admin:", vault.admin());
        vault.transferAdmin(address(timelock));
        console.log("KamiyoVault transfer initiated");

        IAdminTransferable limits = IAdminTransferable(REPUTATION_LIMITS);
        console.log("ReputationLimits current admin:", limits.admin());
        limits.transferAdmin(address(timelock));
        console.log("ReputationLimits transfer initiated");

        vm.stopBroadcast();

        console.log("\n=== NEXT STEPS ===");
        console.log("The timelock must accept admin on each contract.");
        console.log("Create proposals to call acceptAdmin() on each contract:");
        console.log("");
        console.log("1. propose(AGENT_REGISTRY, acceptAdmin(), 0)");
        console.log("2. propose(KAMIYO_VAULT, acceptAdmin(), 0)");
        console.log("3. propose(REPUTATION_LIMITS, acceptAdmin(), 0)");
        console.log("");
        console.log("Then wait 24h and execute each proposal.");
    }
}
