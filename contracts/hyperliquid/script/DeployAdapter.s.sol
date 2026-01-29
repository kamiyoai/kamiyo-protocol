// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistryAdapter} from "../src/AgentRegistryAdapter.sol";

/**
 * @title DeployAdapter
 * @notice Deploys AgentRegistryAdapter to Hyperliquid
 *
 * Usage:
 *   AGENT_REGISTRY=0x... forge script script/DeployAdapter.s.sol:DeployAdapter \
 *     --rpc-url $HYPERLIQUID_RPC_URL \
 *     --broadcast \
 *     -vvvv
 */
contract DeployAdapter is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);
        console2.log("AgentRegistry:", agentRegistry);

        vm.startBroadcast(deployerPrivateKey);

        AgentRegistryAdapter adapter = new AgentRegistryAdapter(agentRegistry);

        vm.stopBroadcast();

        console2.log("\n=== Hyperliquid Deployment ===");
        console2.log("AgentRegistryAdapter:", address(adapter));
    }
}
