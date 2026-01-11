// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../AgentRegistry.sol";
import "../KamiyoVault.sol";
import "../ReputationLimits.sol";

/**
 * @title Deploy
 * @notice Deployment script for Kamiyo Hyperliquid contracts
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url hyperliquid-testnet --broadcast
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AgentRegistry with deployer as initial dispute resolver
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at:", address(registry));

        // Deploy KamiyoVault
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        console.log("KamiyoVault deployed at:", address(vault));

        // Deploy ReputationLimits
        ReputationLimits reputationLimits = new ReputationLimits(address(registry), deployer);
        console.log("ReputationLimits deployed at:", address(reputationLimits));

        // Configure AgentRegistry to allow vault to update copiers
        registry.setVault(address(vault));
        console.log("Vault configured in AgentRegistry");

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n========== DEPLOYMENT SUMMARY ==========");
        console.log("Network: Hyperliquid");
        console.log("Deployer:", deployer);
        console.log("");
        console.log("AgentRegistry:", address(registry));
        console.log("KamiyoVault:", address(vault));
        console.log("ReputationLimits:", address(reputationLimits));
        console.log("");
        console.log("Admin:", deployer);
        console.log("Dispute Resolver:", deployer);
        console.log("=========================================\n");

        // Output for SDK types.ts update
        console.log("// Update packages/kamiyo-hyperliquid/src/types.ts:");
        console.log("contracts: {");
        console.log("  agentRegistry: '%s',", address(registry));
        console.log("  kamiyoVault: '%s',", address(vault));
        console.log("  reputationLimits: '%s',", address(reputationLimits));
        console.log("}");
    }
}

/**
 * @title DeployTestnet
 * @notice Testnet deployment with test configuration
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying to TESTNET from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        AgentRegistry registry = new AgentRegistry(deployer);
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        ReputationLimits reputationLimits = new ReputationLimits(address(registry), deployer);
        registry.setVault(address(vault));

        // Set a lower dispute fee for testnet
        vault.setDisputeFee(0.001 ether);

        vm.stopBroadcast();

        console.log("\n========== TESTNET DEPLOYMENT ==========");
        console.log("AgentRegistry:", address(registry));
        console.log("KamiyoVault:", address(vault));
        console.log("ReputationLimits:", address(reputationLimits));
        console.log("Dispute Fee: 0.001 HYPE");
        console.log("=========================================\n");
    }
}

/**
 * @title UploadVK
 * @notice Upload Groth16 verification key to ReputationLimits
 * @dev VK values from circuits/build/verification_key.json
 */
contract UploadVK is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address reputationLimitsAddr = vm.envAddress("REPUTATION_LIMITS");

        // Values from circuits/build/verification_key.json (reputation_threshold circuit)
        uint256[2] memory alpha = [
            uint256(19687788750966213435272653627052398458365200705945065655918392433672235595637),
            uint256(8412692021608171652433342622880920174195020811652199669439178550344548565692)
        ];

        uint256[2][2] memory beta = [
            [uint256(11048034987308014892302699221719044812920802107559703694541891528801186873743),
             uint256(7265739936943910762390921703635215985297500143079651581224217492165888908451)],
            [uint256(16176642613023971730161303523097164296181026106706543363911172533661922330696),
             uint256(6589649486194421614971065605382473354394933078595011334479087421067367339200)]
        ];

        uint256[2][2] memory gamma = [
            [uint256(11559732032986387107991004021392285783925812861821192530917403151452391805634),
             uint256(10857046999023057135944570762232829481370756359578518086990519993285655852781)],
            [uint256(4082367875863433681332203403145435568316851327593401208105741076214120093531),
             uint256(8495653923123431417604973247489272438418190587263600148770280649306958101930)]
        ];

        uint256[2][2] memory delta = [
            [uint256(4232187558395822073507751086230669127040621561887175921754999021050217735993),
             uint256(195511122929969342933028040988738138408926130862304360613739539947400705031)],
            [uint256(13219241083029510189548183779177293653066796979361806999965969792742760029823),
             uint256(14463069747656446852229766090620478286459266330040664208518317218426599852888)]
        ];

        // IC points for 2 public inputs (threshold, commitment)
        uint256[2][] memory ic = new uint256[2][](3);
        ic[0] = [
            uint256(3885179342893076760146590059896255916234200223180573966675491680991774567925),
            uint256(5714148625987338345107837279162592146498544597236501412542808103584526247578)
        ];
        ic[1] = [
            uint256(1464778759128886018046126095393212240271135607367742357457072963758008867501),
            uint256(12882906718780226601036224618599977105387918282629373841228213846747904670304)
        ];
        ic[2] = [
            uint256(1776940340468540159058882835467851000599078153228635420115649963989259773731),
            uint256(18409479773723235411941712226007450022791300813415429953300847879324535710086)
        ];

        console.log("Uploading VK to ReputationLimits:", reputationLimitsAddr);

        vm.startBroadcast(deployerPrivateKey);

        ReputationLimits reputationLimits = ReputationLimits(reputationLimitsAddr);
        reputationLimits.setVerificationKey(alpha, beta, gamma, delta, ic);

        vm.stopBroadcast();

        console.log("VK uploaded successfully");
    }
}

/**
 * @title DeployWithVK
 * @notice Full deployment including VK setup (for test VK)
 */
contract DeployWithVK is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying with test VK from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy contracts
        AgentRegistry registry = new AgentRegistry(deployer);
        KamiyoVault vault = new KamiyoVault(address(registry), deployer);
        ReputationLimits reputationLimits = new ReputationLimits(address(registry), deployer);
        registry.setVault(address(vault));

        // Upload test VK (all zeros - for testing only)
        // In production, replace with actual VK from trusted setup
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];

        uint256[2][] memory ic = new uint256[2][](3);
        ic[0] = [uint256(15), uint256(16)];
        ic[1] = [uint256(17), uint256(18)];
        ic[2] = [uint256(19), uint256(20)];

        reputationLimits.setVerificationKey(alpha, beta, gamma, delta, ic);

        vm.stopBroadcast();

        console.log("\n========== FULL DEPLOYMENT ==========");
        console.log("AgentRegistry:", address(registry));
        console.log("KamiyoVault:", address(vault));
        console.log("ReputationLimits:", address(reputationLimits));
        console.log("VK: test values (replace for production)");
        console.log("======================================\n");
    }
}

/**
 * @title Verify
 * @notice Verify deployed contracts
 */
contract Verify is Script {
    function run() external view {
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address vaultAddr = vm.envAddress("KAMIYO_VAULT");

        AgentRegistry registry = AgentRegistry(payable(registryAddr));
        KamiyoVault vault = KamiyoVault(payable(vaultAddr));

        console.log("\n========== CONTRACT VERIFICATION ==========");

        // Verify AgentRegistry
        console.log("AgentRegistry:");
        console.log("  Address:", registryAddr);
        console.log("  Admin:", registry.admin());
        console.log("  Dispute Resolver:", registry.disputeResolver());
        console.log("  Vault:", registry.vault());
        console.log("  Total Agents:", registry.totalAgents());
        console.log("  Total Staked:", registry.totalStaked());
        console.log("  Min Stake:", registry.minStake());

        // Verify KamiyoVault
        console.log("\nKamiyoVault:");
        console.log("  Address:", vaultAddr);
        console.log("  Admin:", vault.admin());
        console.log("  Dispute Resolver:", vault.disputeResolver());
        console.log("  Agent Registry:", address(vault.agentRegistry()));
        console.log("  Position Count:", vault.positionCount());
        console.log("  Dispute Count:", vault.disputeCount());
        console.log("  Total Deposits:", vault.totalDeposits());
        console.log("  Dispute Fee:", vault.disputeFee());

        console.log("===========================================\n");
    }
}
