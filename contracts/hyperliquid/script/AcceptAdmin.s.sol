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
    function isSigner(address addr) external view returns (bool);
}

interface IAdminTransferable {
    function acceptAdmin() external;
    function admin() external view returns (address);
    function pendingAdmin() external view returns (address);
}

/**
 * @title AcceptAdmin
 * @notice Creates proposals for AdminTimelock to accept admin on all contracts
 * @dev Run: forge script script/AcceptAdmin.s.sol --rpc-url $RPC_URL --broadcast --legacy
 */
contract AcceptAdmin is Script {
    address constant TIMELOCK = 0xdb4CEA5Ce78aD8ee36118B667ED2335900615D8a;
    address constant AGENT_REGISTRY = 0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d;
    address constant KAMIYO_VAULT = 0xF5B2b62f014459B98991AaE001e33aF75f4fbD15;
    address constant REPUTATION_LIMITS = 0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33;

    function run() external {
        uint256 signer1Key = vm.envUint("PRIVATE_KEY");
        uint256 signer2Key = vm.envUint("SIGNER_2_KEY");

        address signer1 = vm.addr(signer1Key);
        address signer2 = vm.addr(signer2Key);

        console.log("Signer 1:", signer1);
        console.log("Signer 2:", signer2);

        IAdminTimelock timelock = IAdminTimelock(TIMELOCK);

        // Verify signers
        require(timelock.isSigner(signer1), "Signer 1 not authorized");
        require(timelock.isSigner(signer2), "Signer 2 not authorized");

        // Verify pending admin is the timelock
        console.log("\nVerifying pending admin status...");
        console.log("AgentRegistry pending admin:", IAdminTransferable(AGENT_REGISTRY).pendingAdmin());
        console.log("KamiyoVault pending admin:", IAdminTransferable(KAMIYO_VAULT).pendingAdmin());
        console.log("ReputationLimits pending admin:", IAdminTransferable(REPUTATION_LIMITS).pendingAdmin());

        bytes memory acceptAdminData = abi.encodeWithSelector(IAdminTransferable.acceptAdmin.selector);

        vm.startBroadcast(signer1Key);

        // Create proposals
        console.log("\nCreating proposals...");

        uint256 id1 = timelock.propose(AGENT_REGISTRY, acceptAdminData, 0);
        console.log("Proposal 1 (AgentRegistry):", id1);

        uint256 id2 = timelock.propose(KAMIYO_VAULT, acceptAdminData, 0);
        console.log("Proposal 2 (KamiyoVault):", id2);

        uint256 id3 = timelock.propose(REPUTATION_LIMITS, acceptAdminData, 0);
        console.log("Proposal 3 (ReputationLimits):", id3);

        vm.stopBroadcast();

        // Second signer approves
        vm.startBroadcast(signer2Key);

        console.log("\nSigner 2 approving proposals...");
        timelock.approve(id1);
        console.log("Approved proposal 1");
        timelock.approve(id2);
        console.log("Approved proposal 2");
        timelock.approve(id3);
        console.log("Approved proposal 3");

        vm.stopBroadcast();

        // Get proposal details
        console.log("\n=== PROPOSALS CREATED ===");
        (,, , uint256 exec0, uint256 app0,,) = timelock.getProposal(0);
        console.log("Proposal 0 - Approvals:", app0);
        console.log("  Execute after:", exec0);
        (,, , uint256 exec1, uint256 app1,,) = timelock.getProposal(1);
        console.log("Proposal 1 - Approvals:", app1);
        console.log("  Execute after:", exec1);
        (,, , uint256 exec2, uint256 app2,,) = timelock.getProposal(2);
        console.log("Proposal 2 - Approvals:", app2);
        console.log("  Execute after:", exec2);

        console.log("\n=== NEXT STEPS ===");
        console.log("Wait 24 hours, then run ExecuteProposals.s.sol to finalize admin transfer.");
        console.log("Execute after timestamp:", block.timestamp + 1 days);
    }
}
