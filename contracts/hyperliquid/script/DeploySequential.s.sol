// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/KamiyoVault.sol";
import "../src/ReputationLimits.sol";

contract DeployRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying AgentRegistry from:", deployer);

        vm.startBroadcast(deployerPrivateKey);
        AgentRegistry registry = new AgentRegistry(deployer);
        vm.stopBroadcast();

        console.log("AgentRegistry:", address(registry));
    }
}

contract DeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying KamiyoVault from:", deployer);
        console.log("Using AgentRegistry:", registryAddr);

        vm.startBroadcast(deployerPrivateKey);
        KamiyoVault vault = new KamiyoVault(registryAddr, deployer);
        vm.stopBroadcast();

        console.log("KamiyoVault:", address(vault));
    }
}

contract DeployReputation is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying ReputationLimits from:", deployer);

        vm.startBroadcast(deployerPrivateKey);
        ReputationLimits rep = new ReputationLimits(registryAddr, deployer);
        vm.stopBroadcast();

        console.log("ReputationLimits:", address(rep));
    }
}

contract ConfigureVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address vaultAddr = vm.envAddress("KAMIYO_VAULT");

        console.log("Configuring vault in registry");

        vm.startBroadcast(deployerPrivateKey);
        AgentRegistry(payable(registryAddr)).setVault(vaultAddr);
        vm.stopBroadcast();

        console.log("Done");
    }
}
