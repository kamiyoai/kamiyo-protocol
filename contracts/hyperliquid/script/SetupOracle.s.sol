// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IAdminTimelock {
    function propose(address target, bytes calldata data, uint256 value) external returns (uint256);
    function approve(uint256 id) external;
    function execute(uint256 id) external;
    function getProposal(uint256 id) external view returns (
        address target,
        bytes memory data,
        uint256 value,
        uint256 executeAfter,
        uint256 approvals,
        bool executed,
        bool cancelled
    );
}

interface IAgentRegistry {
    function setDisputeResolver(address _resolver) external;
    function disputeResolver() external view returns (address);
}

/**
 * @title SetupOracle
 * @notice Proposes, approves, and executes setting the dispute resolver via AdminTimelock
 * @dev Run: forge script script/SetupOracle.s.sol --rpc-url $RPC_URL --broadcast --legacy
 */
contract SetupOracle is Script {
    address constant TIMELOCK = 0xdb4CEA5Ce78aD8ee36118B667ED2335900615D8a;
    address constant AGENT_REGISTRY = 0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d;
    address constant ORACLE_WALLET = 0x1D5df06E32bBF1ee2150E04a071C34D0C28C4409;

    function run() external {
        uint256 signer1Key = vm.envUint("PRIVATE_KEY");
        uint256 signer2Key = vm.envUint("SIGNER_2_KEY");

        console.log("Current dispute resolver:", IAgentRegistry(AGENT_REGISTRY).disputeResolver());
        console.log("New oracle wallet:", ORACLE_WALLET);

        bytes memory data = abi.encodeWithSelector(
            IAgentRegistry.setDisputeResolver.selector,
            ORACLE_WALLET
        );

        // Signer 1 proposes
        vm.startBroadcast(signer1Key);
        uint256 proposalId = IAdminTimelock(TIMELOCK).propose(AGENT_REGISTRY, data, 0);
        console.log("Proposal ID:", proposalId);
        vm.stopBroadcast();

        // Signer 2 approves
        vm.startBroadcast(signer2Key);
        IAdminTimelock(TIMELOCK).approve(proposalId);
        console.log("Approved by signer 2");
        vm.stopBroadcast();

        // Execute immediately (timelock period is 0)
        vm.startBroadcast(signer1Key);
        IAdminTimelock(TIMELOCK).execute(proposalId);
        console.log("Executed");
        vm.stopBroadcast();

        console.log("Dispute resolver set to:", IAgentRegistry(AGENT_REGISTRY).disputeResolver());
    }
}
