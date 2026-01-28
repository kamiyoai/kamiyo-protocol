// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

interface IAdminTimelock {
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

interface IAdminTransferable {
    function admin() external view returns (address);
}

/**
 * @title ExecuteProposals
 * @notice Executes proposals 3, 4, 5 after timelock period
 * @dev Run after 24h: forge script script/ExecuteProposals.s.sol --rpc-url $RPC_URL --broadcast --legacy
 */
contract ExecuteProposals is Script {
    address constant TIMELOCK = 0xdb4CEA5Ce78aD8ee36118B667ED2335900615D8a;
    address constant AGENT_REGISTRY = 0xCa034D63c67ADd6CA127a575F0097C203DAcaE9d;
    address constant KAMIYO_VAULT = 0xF5B2b62f014459B98991AaE001e33aF75f4fbD15;
    address constant REPUTATION_LIMITS = 0xbECa9c722EeF9897b5aa87363F3Bd9C94e16fE33;

    function run() external {
        uint256 signerKey = vm.envUint("PRIVATE_KEY");
        address signer = vm.addr(signerKey);
        console.log("Executor:", signer);
        console.log("Current time:", block.timestamp);

        IAdminTimelock timelock = IAdminTimelock(TIMELOCK);

        // Check proposal states
        console.log("\nProposal states:");
        for (uint256 i = 0; i <= 2; i++) {
            (address target,, , uint256 executeAfter, uint256 approvals, bool executed, bool cancelled) = timelock.getProposal(i);
            console.log("Proposal", i);
            console.log("  Target:", target);
            console.log("  Approvals:", approvals);
            console.log("  Execute after:", executeAfter);
            console.log("  Executed:", executed);
            console.log("  Cancelled:", cancelled);

            if (block.timestamp < executeAfter) {
                console.log("  STATUS: Not ready - wait until", executeAfter);
            } else if (executed) {
                console.log("  STATUS: Already executed");
            } else if (cancelled) {
                console.log("  STATUS: Cancelled");
            } else if (approvals >= 2) {
                console.log("  STATUS: Ready to execute");
            } else {
                console.log("  STATUS: Insufficient approvals");
            }
        }

        // Check current admin status
        console.log("\nCurrent admin status:");
        console.log("AgentRegistry admin:", IAdminTransferable(AGENT_REGISTRY).admin());
        console.log("KamiyoVault admin:", IAdminTransferable(KAMIYO_VAULT).admin());
        console.log("ReputationLimits admin:", IAdminTransferable(REPUTATION_LIMITS).admin());

        vm.startBroadcast(signerKey);

        console.log("\nExecuting proposals...");

        timelock.execute(0);
        console.log("Executed proposal 0 (AgentRegistry)");

        timelock.execute(1);
        console.log("Executed proposal 1 (KamiyoVault)");

        timelock.execute(2);
        console.log("Executed proposal 2 (ReputationLimits)");

        vm.stopBroadcast();

        // Verify new admin status
        console.log("\n=== ADMIN TRANSFER COMPLETE ===");
        console.log("AgentRegistry admin:", IAdminTransferable(AGENT_REGISTRY).admin());
        console.log("KamiyoVault admin:", IAdminTransferable(KAMIYO_VAULT).admin());
        console.log("ReputationLimits admin:", IAdminTransferable(REPUTATION_LIMITS).admin());
        console.log("\nAll contracts now managed by AdminTimelock:", TIMELOCK);
    }
}
