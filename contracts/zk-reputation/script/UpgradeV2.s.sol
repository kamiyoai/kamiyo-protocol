// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ZKReputationV2.sol";

contract UpgradeV2 is Script {
    function run() external returns (address newImplementation) {
        address proxy = vm.envAddress("PROXY_ADDRESS");

        vm.startBroadcast();

        // Deploy new implementation
        newImplementation = address(new ZKReputationV2());
        console.log("New implementation:", newImplementation);

        // Upgrade proxy
        ZKReputationV2(proxy).upgradeToAndCall(newImplementation, "");
        console.log("Proxy upgraded:", proxy);

        vm.stopBroadcast();
    }
}
