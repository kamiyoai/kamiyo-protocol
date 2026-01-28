// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IReputationLimits {
    function setVerificationKey(
        uint256[2] calldata _alpha,
        uint256[2][2] calldata _beta,
        uint256[2][2] calldata _gamma,
        uint256[2][2] calldata _delta,
        uint256[2][] calldata _ic
    ) external;

    function admin() external view returns (address);
}

/**
 * @title SetVerificationKey
 * @notice Sets the Groth16 verification key on ReputationLimits
 * @dev Run: forge script script/SetVerificationKey.s.sol --rpc-url $RPC_URL --broadcast
 *
 * VK generated from circuits/build/verification_key.json
 * Circuit: reputation_threshold.circom
 * Trusted setup: powersOfTau28_hez_final_14.ptau
 */
contract SetVerificationKey is Script {
    // Deployed ReputationLimits on Hyperliquid mainnet
    address constant REPUTATION_LIMITS = 0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console.log("Setting VK on ReputationLimits:", REPUTATION_LIMITS);

        IReputationLimits limits = IReputationLimits(REPUTATION_LIMITS);
        console.log("Current admin:", limits.admin());

        // VK from circuits/build/verification_key.json
        // Generated via snarkjs groth16 setup with powersOfTau28_hez_final_14.ptau

        uint256[2] memory alpha = [
            uint256(20491192805390485299153009773594534940189261866228447918068658471970481763042),
            uint256(9383485363053290200918347156157836566562967994039712273449902621266178545958)
        ];

        uint256[2][2] memory beta = [
            [
                uint256(6375614351688725206403948262868962793625744043794305715222011528459656738731),
                uint256(4252822878758300859123897981450591353533073413197771768651442665752259397132)
            ],
            [
                uint256(10505242626370262277552901082094356697409835680220590971873171140371331206856),
                uint256(21847035105528745403288232691147584728191162732299865338377159692350059136679)
            ]
        ];

        uint256[2][2] memory gamma = [
            [
                uint256(10857046999023057135944570762232829481370756359578518086990519993285655852781),
                uint256(11559732032986387107991004021392285783925812861821192530917403151452391805634)
            ],
            [
                uint256(8495653923123431417604973247489272438418190587263600148770280649306958101930),
                uint256(4082367875863433681332203403145435568316851327593401208105741076214120093531)
            ]
        ];

        uint256[2][2] memory delta = [
            [
                uint256(6270982721560078223710675548946658623431242131309150325368548470725422924278),
                uint256(15792935853340806678541013381236318957525297919032586847243418110990829175574)
            ],
            [
                uint256(12618417429723660274849279621605746554718616322161197798238886403862908372775),
                uint256(5417747995245839142507193961378167256446211105957420991676709608916407799877)
            ]
        ];

        // IC array (3 elements for 2 public inputs)
        uint256[2][] memory ic = new uint256[2][](3);
        ic[0] = [
            uint256(10378135837474478460620464632455258028049008296913588133072760774368897943674),
            uint256(17507773511028576401554235685832436646795063431492176864637841356341846548533)
        ];
        ic[1] = [
            uint256(3125674560301784404012638097642365033871446711040183509403191186767986437600),
            uint256(11280427027174520751550264199503656097825639246826311845971817383100601513234)
        ];
        ic[2] = [
            uint256(6734726672255423786775157509470369691770481756273187188387361047720157490982),
            uint256(15717810961147472403549612059851035472285228238395046593226801399058876297477)
        ];

        vm.startBroadcast(deployerKey);

        limits.setVerificationKey(alpha, beta, gamma, delta, ic);
        console.log("VK set successfully");

        vm.stopBroadcast();
    }
}
