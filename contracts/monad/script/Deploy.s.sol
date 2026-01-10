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

        AgentProxy agentImpl = new AgentProxy();
        ReputationMirror mirror = new ReputationMirror(admin);
        SwarmSimulator swarm = new SwarmSimulator(admin);

        // Set Groth16 verification key for reputation proofs
        // Generated from packages/kamiyo-tetsuo-privacy/circuits
        uint256[2] memory vkAlpha = [
            uint256(20491192805390485299153009773594534940189261866228447918068658471970481763042),
            uint256(9383485363053290200918347156157836566562967994039712273449902621266178545958)
        ];
        uint256[2][2] memory vkBeta = [
            [
                uint256(6375614351688725206403948262868962793625744043794305715222011528459656738731),
                uint256(4252822878758300859123897981450591353533073413197771768651442665752259397132)
            ],
            [
                uint256(10505242626370262277552901082094356697409835680220590971873171140371331206856),
                uint256(21847035105528745403288232691147584728191162732299865338377159692350059136679)
            ]
        ];
        uint256[2] memory vkGamma = [
            uint256(10857046999023057135944570762232829481370756359578518086990519993285655852781),
            uint256(11559732032986387107991004021392285783925812861821192530917403151452391805634)
        ];
        uint256[2] memory vkDelta = [
            uint256(7422028046727469583505112022659498311472498424963097459401571541672046882398),
            uint256(545229837926706996696480582954902474862276270149132437671728996268925816802)
        ];

        uint256[2][] memory vkIC = new uint256[2][](4);
        vkIC[0] = [
            uint256(2405013962824901842528667901568838024327948927815301360992765684898248090492),
            uint256(4883010368487184631202276504988909418605537710610038877123385055689016665468)
        ];
        vkIC[1] = [
            uint256(4242397595191221712596461254292080984598496379300451992691026377096361305478),
            uint256(16152470245277020621376620288401023741188061379139905266448693252645388461577)
        ];
        vkIC[2] = [
            uint256(14725311820668089339782406896254293122748377888693627227689426619568139223204),
            uint256(20117626262038261506388855414135215814411085883671050899101139291576538979346)
        ];
        vkIC[3] = [
            uint256(54161165046577088063380753814918218158773795313437050195267711884687624340),
            uint256(12784654970333953428761609698605749424715451282037693680219310556259523036384)
        ];

        mirror.setVerificationKey(vkAlpha, vkBeta, vkGamma, vkDelta, vkIC);

        vm.stopBroadcast();

        console.log("=== Kamiyo Monad Deployment ===");
        console.log("AgentProxy impl:", address(agentImpl));
        console.log("ReputationMirror:", address(mirror));
        console.log("SwarmSimulator:", address(swarm));
        console.log("VK set: 3 public inputs");
    }
}
