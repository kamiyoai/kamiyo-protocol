// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IAdminTimelock {
    function approve(uint256 id) external;
    function getProposal(uint256 id) external view returns (
        address target,
        bytes memory data,
        uint256 value,
        uint256 executeAfter,
        uint256 approvals,
        bool executed,
        bool cancelled
    );
    function hasApproved(uint256 id, address signer) external view returns (bool);
}

/**
 * @title ApproveProposals
 * @notice Approves proposals 3, 4, 5 with Signer 2
 */
contract ApproveProposals is Script {
    address constant TIMELOCK = 0xdb4CEA5Ce78aD8ee36118B667ED2335900615D8a;

    function run() external {
        uint256 signer2Key = vm.envUint("SIGNER_2_KEY");
        address signer2 = vm.addr(signer2Key);
        console.log("Signer 2:", signer2);

        IAdminTimelock timelock = IAdminTimelock(TIMELOCK);

        // Check current state
        console.log("\nProposal states before approval:");
        for (uint256 i = 3; i <= 5; i++) {
            (address target,, , uint256 executeAfter, uint256 approvals, bool executed, bool cancelled) = timelock.getProposal(i);
            console.log("Proposal", i);
            console.log("  Target:", target);
            console.log("  Approvals:", approvals);
            console.log("  Executed:", executed);
            console.log("  Cancelled:", cancelled);
        }

        vm.startBroadcast(signer2Key);

        console.log("\nApproving proposals 3, 4, 5...");
        timelock.approve(3);
        console.log("Approved 3");
        timelock.approve(4);
        console.log("Approved 4");
        timelock.approve(5);
        console.log("Approved 5");

        vm.stopBroadcast();

        // Check updated state
        console.log("\nProposal states after approval:");
        for (uint256 i = 3; i <= 5; i++) {
            (,, , uint256 executeAfter, uint256 approvals,,) = timelock.getProposal(i);
            console.log("Proposal", i);
            console.log("  Approvals:", approvals);
            console.log("  Execute after:", executeAfter);
        }
    }
}
