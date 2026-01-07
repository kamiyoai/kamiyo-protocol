// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../AgentRegistry.sol";
import "../KamiyoVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AgentRegistry with deployer as initial dispute resolver
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at:", address(registry));

        // Deploy KamiyoVault
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        console.log("KamiyoVault deployed at:", address(vault));

        vm.stopBroadcast();
    }
}
