// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Groth16Verifier.sol";
import "../src/ZKReputation.sol";

contract DeployZKReputation is Script {
    function run() external returns (Groth16Verifier verifier, ZKReputation reputation) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        verifier = new Groth16Verifier();
        reputation = new ZKReputation(address(verifier));

        vm.stopBroadcast();

        console.log("Groth16Verifier deployed at:", address(verifier));
        console.log("ZKReputation deployed at:", address(reputation));
    }
}
