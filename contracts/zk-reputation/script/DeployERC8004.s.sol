// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC8004IdentityRegistry} from "../src/ERC8004IdentityRegistry.sol";
import {ERC8004ReputationRegistry} from "../src/ERC8004ReputationRegistry.sol";
import {ERC8004ValidationRegistry} from "../src/ERC8004ValidationRegistry.sol";
import {ZKReputationBridge} from "../src/ZKReputationBridge.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployERC8004
 * @notice Deploys ERC-8004 contracts to Base mainnet
 *
 * Usage:
 *   forge script script/DeployERC8004.s.sol:DeployERC8004 \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     -vvvv
 */
contract DeployERC8004 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Identity Registry
        ERC8004IdentityRegistry identityImpl = new ERC8004IdentityRegistry();
        bytes memory identityInit = abi.encodeWithSelector(
            ERC8004IdentityRegistry.initialize.selector,
            deployer
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(
            address(identityImpl),
            identityInit
        );
        ERC8004IdentityRegistry identity = ERC8004IdentityRegistry(address(identityProxy));
        console2.log("ERC8004IdentityRegistry:", address(identity));

        // Deploy Reputation Registry
        ERC8004ReputationRegistry reputationImpl = new ERC8004ReputationRegistry();
        bytes memory reputationInit = abi.encodeWithSelector(
            ERC8004ReputationRegistry.initialize.selector,
            deployer,
            address(identity)
        );
        ERC1967Proxy reputationProxy = new ERC1967Proxy(
            address(reputationImpl),
            reputationInit
        );
        ERC8004ReputationRegistry reputation = ERC8004ReputationRegistry(address(reputationProxy));
        console2.log("ERC8004ReputationRegistry:", address(reputation));

        // Deploy Validation Registry
        ERC8004ValidationRegistry validationImpl = new ERC8004ValidationRegistry();
        bytes memory validationInit = abi.encodeWithSelector(
            ERC8004ValidationRegistry.initialize.selector,
            deployer,
            address(identity)
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(
            address(validationImpl),
            validationInit
        );
        ERC8004ValidationRegistry validation = ERC8004ValidationRegistry(address(validationProxy));
        console2.log("ERC8004ValidationRegistry:", address(validation));

        // Note: ZKReputationBridge requires existing ZKReputation contract
        // Deploy separately with DeployZKBridge script after ZK infrastructure is ready

        vm.stopBroadcast();

        // Output summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("Identity Registry:   ", address(identity));
        console2.log("Reputation Registry: ", address(reputation));
        console2.log("Validation Registry: ", address(validation));
    }
}

/**
 * @title DeployERC8004Testnet
 * @notice Deploys to Base Sepolia for testing
 */
contract DeployERC8004Testnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        require(block.chainid == 84532, "Must deploy to Base Sepolia");

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Identity Registry
        ERC8004IdentityRegistry identityImpl = new ERC8004IdentityRegistry();
        bytes memory identityInit = abi.encodeWithSelector(
            ERC8004IdentityRegistry.initialize.selector,
            deployer
        );
        ERC1967Proxy identityProxy = new ERC1967Proxy(
            address(identityImpl),
            identityInit
        );
        ERC8004IdentityRegistry identity = ERC8004IdentityRegistry(address(identityProxy));
        console2.log("ERC8004IdentityRegistry:", address(identity));

        // Deploy Reputation Registry
        ERC8004ReputationRegistry reputationImpl = new ERC8004ReputationRegistry();
        bytes memory reputationInit = abi.encodeWithSelector(
            ERC8004ReputationRegistry.initialize.selector,
            deployer,
            address(identity)
        );
        ERC1967Proxy reputationProxy = new ERC1967Proxy(
            address(reputationImpl),
            reputationInit
        );
        ERC8004ReputationRegistry reputation = ERC8004ReputationRegistry(address(reputationProxy));
        console2.log("ERC8004ReputationRegistry:", address(reputation));

        // Deploy Validation Registry
        ERC8004ValidationRegistry validationImpl = new ERC8004ValidationRegistry();
        bytes memory validationInit = abi.encodeWithSelector(
            ERC8004ValidationRegistry.initialize.selector,
            deployer,
            address(identity)
        );
        ERC1967Proxy validationProxy = new ERC1967Proxy(
            address(validationImpl),
            validationInit
        );
        ERC8004ValidationRegistry validation = ERC8004ValidationRegistry(address(validationProxy));
        console2.log("ERC8004ValidationRegistry:", address(validation));

        // Note: ZKReputationBridge requires existing ZKReputation contract
        // Deploy separately after ZK infrastructure is ready

        vm.stopBroadcast();

        console2.log("\n=== Base Sepolia Deployment ===");
        console2.log("Identity Registry:   ", address(identity));
        console2.log("Reputation Registry: ", address(reputation));
        console2.log("Validation Registry: ", address(validation));
    }
}
