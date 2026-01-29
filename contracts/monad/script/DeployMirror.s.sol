// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC8004IdentityMirror} from "../src/ERC8004IdentityMirror.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployMirror
 * @notice Deploys ERC8004IdentityMirror to Monad
 *
 * Usage:
 *   forge script script/DeployMirror.s.sol:DeployMirror \
 *     --rpc-url $MONAD_RPC_URL \
 *     --broadcast \
 *     -vvvv
 */
contract DeployMirror is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Mirror
        ERC8004IdentityMirror mirrorImpl = new ERC8004IdentityMirror();
        bytes memory mirrorInit = abi.encodeWithSelector(
            ERC8004IdentityMirror.initialize.selector,
            deployer,
            address(0) // ZK verifier - set later
        );
        ERC1967Proxy mirrorProxy = new ERC1967Proxy(
            address(mirrorImpl),
            mirrorInit
        );
        ERC8004IdentityMirror mirror = ERC8004IdentityMirror(address(mirrorProxy));

        vm.stopBroadcast();

        console2.log("\n=== Monad Deployment ===");
        console2.log("ERC8004IdentityMirror:", address(mirror));
    }
}

/**
 * @title DeployMirrorTestnet
 * @notice Deploys to Monad testnet
 */
contract DeployMirrorTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        require(block.chainid == 10143, "Must deploy to Monad Testnet");

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        ERC8004IdentityMirror mirrorImpl = new ERC8004IdentityMirror();
        bytes memory mirrorInit = abi.encodeWithSelector(
            ERC8004IdentityMirror.initialize.selector,
            deployer,
            address(0)
        );
        ERC1967Proxy mirrorProxy = new ERC1967Proxy(
            address(mirrorImpl),
            mirrorInit
        );
        ERC8004IdentityMirror mirror = ERC8004IdentityMirror(address(mirrorProxy));

        vm.stopBroadcast();

        console2.log("\n=== Monad Testnet Deployment ===");
        console2.log("ERC8004IdentityMirror:", address(mirror));
    }
}
