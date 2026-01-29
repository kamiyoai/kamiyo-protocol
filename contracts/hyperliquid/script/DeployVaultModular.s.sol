// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/vault/VaultCore.sol";
import "../src/vault/PositionModule.sol";
import "../src/vault/DisputeModule.sol";

contract DeployVaultCore is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");

        console.log("Deploying VaultCore from:", deployer);
        console.log("AgentRegistry:", agentRegistry);

        vm.startBroadcast(deployerPrivateKey);
        VaultCore vault = new VaultCore(agentRegistry, deployer);
        vm.stopBroadcast();

        console.log("VaultCore:", address(vault));
    }
}

contract DeployPositionModule is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vaultCore = vm.envAddress("VAULT_CORE");

        console.log("Deploying PositionModule");
        console.log("VaultCore:", vaultCore);

        vm.startBroadcast(deployerPrivateKey);
        PositionModule module = new PositionModule(vaultCore);
        vm.stopBroadcast();

        console.log("PositionModule:", address(module));
    }
}

contract DeployDisputeModule is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vaultCore = vm.envAddress("VAULT_CORE");

        console.log("Deploying DisputeModule");
        console.log("VaultCore:", vaultCore);

        vm.startBroadcast(deployerPrivateKey);
        DisputeModule module = new DisputeModule(vaultCore);
        vm.stopBroadcast();

        console.log("DisputeModule:", address(module));
    }
}

contract DeployValueUpdateModule is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vaultCore = vm.envAddress("VAULT_CORE");

        console.log("Deploying ValueUpdateModule");

        vm.startBroadcast(deployerPrivateKey);
        // Import at top of file won't work, use inline
        vm.stopBroadcast();
    }
}

contract ConfigureVaultModules is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address vaultCore = vm.envAddress("VAULT_CORE");
        address positionModule = vm.envAddress("POSITION_MODULE");
        address disputeModule = vm.envAddress("DISPUTE_MODULE");

        console.log("Configuring VaultCore modules");

        vm.startBroadcast(deployerPrivateKey);
        VaultCore(payable(vaultCore)).setModules(positionModule, disputeModule);
        vm.stopBroadcast();

        console.log("Modules configured");
    }
}
