// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Groth16Verifier.sol";
import "../src/ZKReputationV2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployV2 is Script {
    function run() external returns (address proxy, address implementation) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier:", address(verifier));

        // Deploy implementation
        ZKReputationV2 impl = new ZKReputationV2();
        console.log("ZKReputationV2 impl:", address(impl));

        // Deploy proxy
        bytes memory initData = abi.encodeWithSelector(
            ZKReputationV2.initialize.selector,
            address(verifier),
            deployer
        );
        ERC1967Proxy proxyContract = new ERC1967Proxy(address(impl), initData);
        proxy = address(proxyContract);
        implementation = address(impl);

        console.log("ZKReputationV2 proxy:", proxy);
        console.log("Owner:", deployer);

        vm.stopBroadcast();
    }
}
