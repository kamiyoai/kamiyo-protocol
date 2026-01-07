// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../AgentProxy.sol";
import "../ReputationMirror.sol";
import "../SwarmSimulator.sol";

contract DeployKamiyo is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy implementation contracts
        AgentProxy agentImpl = new AgentProxy();
        ReputationMirror reputationMirror = new ReputationMirror(admin);
        SwarmSimulator swarmSimulator = new SwarmSimulator(admin);

        vm.stopBroadcast();

        console.log("AgentProxy implementation:", address(agentImpl));
        console.log("ReputationMirror:", address(reputationMirror));
        console.log("SwarmSimulator:", address(swarmSimulator));
    }
}
