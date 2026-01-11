// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../AgentRegistry.sol";
import "../ReputationLimits.sol";

contract ReputationLimitsTest is Test {
    AgentRegistry public registry;
    ReputationLimits public limits;

    address public admin = address(1);
    address public disputeResolver = address(2);
    address public agent1 = address(3);
    address public agent2 = address(4);

    uint256 constant MIN_STAKE = 100e18;

    event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit);
    event TierConfigured(uint8 indexed tier, uint256 threshold, uint256 maxCopyLimit, uint256 maxCopiers);

    function setUp() public {
        vm.startPrank(admin);
        registry = new AgentRegistry(disputeResolver);
        limits = new ReputationLimits(address(registry), admin);
        vm.stopPrank();

        vm.deal(agent1, 1000e18);
        vm.deal(agent2, 1000e18);

        vm.prank(agent1);
        registry.register{value: MIN_STAKE}("Agent1");

        vm.prank(agent2);
        registry.register{value: MIN_STAKE}("Agent2");
    }

    // ============ Tier Configuration Tests ============

    function test_defaultTiers() public view {
        assertEq(limits.tierCount(), 5);

        ReputationLimits.Tier memory tier0 = limits.getTier(0);
        assertEq(tier0.threshold, 0);
        assertEq(tier0.maxCopyLimit, 100 ether);
        assertEq(tier0.maxCopiers, 5);

        ReputationLimits.Tier memory tier1 = limits.getTier(1);
        assertEq(tier1.threshold, 25);
        assertEq(tier1.maxCopyLimit, 500 ether);
        assertEq(tier1.maxCopiers, 20);

        ReputationLimits.Tier memory tier4 = limits.getTier(4);
        assertEq(tier4.threshold, 90);
        assertEq(tier4.maxCopyLimit, type(uint256).max);
        assertEq(tier4.maxCopiers, type(uint256).max);
    }

    function test_configureTier() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit TierConfigured(1, 30, 600 ether, 25);
        limits.configureTier(1, 30, 600 ether, 25);

        ReputationLimits.Tier memory tier = limits.getTier(1);
        assertEq(tier.threshold, 30);
        assertEq(tier.maxCopyLimit, 600 ether);
        assertEq(tier.maxCopiers, 25);
    }

    function test_configureTier_revert_notAdmin() public {
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.NotAdmin.selector);
        limits.configureTier(1, 30, 600 ether, 25);
    }

    function test_configureTier_revert_invalidTier() public {
        vm.prank(admin);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.configureTier(10, 30, 600 ether, 25);
    }

    // ============ Copy Limits Tests ============

    function test_getCopyLimits_defaultTier() public view {
        (uint256 maxCopyLimit, uint256 maxCopiers) = limits.getCopyLimits(agent1);
        assertEq(maxCopyLimit, 100 ether);
        assertEq(maxCopiers, 5);
    }

    function test_canAcceptDeposit_allowed() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            50 ether,  // currentAUM
            2,         // currentCopiers
            25 ether   // newDeposit
        );
        assertTrue(allowed);
        assertEq(reason, "");
    }

    function test_canAcceptDeposit_exceedsCopyLimit() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            80 ether,  // currentAUM
            2,         // currentCopiers
            25 ether   // newDeposit -> total 105, exceeds 100
        );
        assertFalse(allowed);
        assertEq(reason, "Exceeds copy limit for tier");
    }

    function test_canAcceptDeposit_exceedsCopierLimit() public view {
        (bool allowed, string memory reason) = limits.canAcceptDeposit(
            agent1,
            50 ether,  // currentAUM
            5,         // currentCopiers -> already at max
            10 ether   // newDeposit
        );
        assertFalse(allowed);
        assertEq(reason, "Exceeds copier limit for tier");
    }

    // ============ Agent Tier Info Tests ============

    function test_getAgentTierInfo_default() public view {
        (uint8 tier, uint64 verifiedAt, ReputationLimits.Tier memory tierInfo) =
            limits.getAgentTierInfo(agent1);

        assertEq(tier, 0);
        assertEq(verifiedAt, 0);
        assertEq(tierInfo.threshold, 0);
        assertEq(tierInfo.maxCopyLimit, 100 ether);
    }

    // ============ Pause Tests ============

    function test_pause() public {
        vm.prank(admin);
        limits.setPaused(true);

        assertTrue(limits.paused());
    }

    function test_unpause() public {
        vm.prank(admin);
        limits.setPaused(true);

        vm.prank(admin);
        limits.setPaused(false);

        assertFalse(limits.paused());
    }

    // ============ Admin Tests ============

    function test_setAdmin() public {
        address newAdmin = address(10);

        vm.prank(admin);
        limits.setAdmin(newAdmin);

        assertEq(limits.admin(), newAdmin);
    }

    function test_setAdmin_revert_notAdmin() public {
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.NotAdmin.selector);
        limits.setAdmin(address(10));
    }

    // ============ Verification Key Tests ============

    function test_setVerificationKey() public {
        uint256[2] memory alpha = [uint256(1), uint256(2)];
        uint256[2][2] memory beta = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        uint256[2][2] memory gamma = [[uint256(7), uint256(8)], [uint256(9), uint256(10)]];
        uint256[2][2] memory delta = [[uint256(11), uint256(12)], [uint256(13), uint256(14)]];
        uint256[2][] memory ic = new uint256[2][](2);
        ic[0] = [uint256(15), uint256(16)];
        ic[1] = [uint256(17), uint256(18)];

        vm.prank(admin);
        limits.setVerificationKey(alpha, beta, gamma, delta, ic);

        (uint256 a0, uint256 a1) = (limits.vkAlpha(0), limits.vkAlpha(1));
        assertEq(a0, 1);
        assertEq(a1, 2);
    }

    // ============ Prove Reputation Tests ============

    function test_proveReputation_revert_notRegistered() public {
        address unregistered = address(100);

        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(unregistered);
        vm.expectRevert(ReputationLimits.NotRegistered.selector);
        limits.proveReputation(1, bytes32(0), proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_invalidTier() public {
        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.proveReputation(0, bytes32(0), proofA, proofB, proofC, pubInputs);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.InvalidTier.selector);
        limits.proveReputation(10, bytes32(0), proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_paused() public {
        vm.prank(admin);
        limits.setPaused(true);

        uint256[2] memory proofA;
        uint256[2][2] memory proofB;
        uint256[2] memory proofC;
        uint256[] memory pubInputs = new uint256[](2);

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.IsPaused.selector);
        limits.proveReputation(1, bytes32(0), proofA, proofB, proofC, pubInputs);
    }

    // ============ On-chain ZK Proof Verification Test ============

    function _setProductionVK() internal {
        // VK from circuits/build/verification_key.json
        uint256[2] memory alpha = [
            uint256(20491192805390485299153009773594534940189261866228447918068658471970481763042),
            uint256(9383485363053290200918347156157836566562967994039712273449902621266178545958)
        ];

        uint256[2][2] memory beta = [
            [uint256(4252822878758300859123897981450591353533073413197771768651442665752259397132),
             uint256(6375614351688725206403948262868962793625744043794305715222011528459656738731)],
            [uint256(21847035105528745403288232691147584728191162732299865338377159692350059136679),
             uint256(10505242626370262277552901082094356697409835680220590971873171140371331206856)]
        ];

        uint256[2][2] memory gamma = [
            [uint256(11559732032986387107991004021392285783925812861821192530917403151452391805634),
             uint256(10857046999023057135944570762232829481370756359578518086990519993285655852781)],
            [uint256(4082367875863433681332203403145435568316851327593401208105741076214120093531),
             uint256(8495653923123431417604973247489272438418190587263600148770280649306958101930)]
        ];

        uint256[2][2] memory delta = [
            [uint256(15792935853340806678541013381236318957525297919032586847243418110990829175574),
             uint256(6270982721560078223710675548946658623431242131309150325368548470725422924278)],
            [uint256(5417747995245839142507193961378167256446211105957420991676709608916407799877),
             uint256(12618417429723660274849279621605746554718616322161197798238886403862908372775)]
        ];

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

        vm.prank(admin);
        limits.setVerificationKey(alpha, beta, gamma, delta, ic);
    }

    function test_proveReputation_validProof() public {
        _setProductionVK();

        // Proof generated for score=85, threshold=75 (Gold tier)
        // Generated by: npx tsx examples/tetsuo-demo/export-proof.ts
        bytes32 commitment = bytes32(uint256(12716744992787170208634265639094739006435413343713602468320418486773788151152));

        uint256[2] memory proofA = [
            uint256(19022056641996587162019436378123462165919801281188835382141289665405734489213),
            uint256(15972056816754255191227949115323096576582604694258194666369093523781851338648)
        ];

        uint256[2][2] memory proofB = [
            [uint256(2326937415402991511375925596093835559060081636747798473816421221609693431205),
             uint256(10407195687200356577554457507994720296950250166940604808579035002708267077109)],
            [uint256(19141088319652749515296066323503091653269865088136655319072494581370430078803),
             uint256(5861943882914413752474356025581604655570757314552000281489514010702140001275)]
        ];

        uint256[2] memory proofC = [
            uint256(2104640690936108291214556824646326261246618196820458019368269297342575541211),
            uint256(20171233286739114642026156958543545009776066764415469497349319027733862520125)
        ];

        uint256[] memory pubInputs = new uint256[](2);
        pubInputs[0] = 75; // threshold (Gold tier)
        pubInputs[1] = 12716744992787170208634265639094739006435413343713602468320418486773788151152; // commitment

        // Prove Gold tier (tier 3)
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit TierVerified(agent1, 3, 10000 ether);
        limits.proveReputation(3, commitment, proofA, proofB, proofC, pubInputs);

        // Verify tier was updated
        (uint8 tier, uint64 verifiedAt, ReputationLimits.Tier memory tierInfo) =
            limits.getAgentTierInfo(agent1);

        assertEq(tier, 3);
        assertGt(verifiedAt, 0);
        assertEq(tierInfo.threshold, 75);
        assertEq(tierInfo.maxCopyLimit, 10000 ether);
        assertEq(tierInfo.maxCopiers, 200);

        // Verify new copy limits
        (uint256 maxCopyLimit, uint256 maxCopiers) = limits.getCopyLimits(agent1);
        assertEq(maxCopyLimit, 10000 ether);
        assertEq(maxCopiers, 200);
    }

    function test_proveReputation_revert_invalidProof() public {
        _setProductionVK();

        bytes32 commitment = bytes32(uint256(12716744992787170208634265639094739006435413343713602468320418486773788151152));

        // Tampered proof (first value changed) - point not on curve
        // This causes the precompile to fail outright (revert with no data)
        uint256[2] memory proofA = [
            uint256(12345678901234567890123456789012345678901234567890123456789012345),
            uint256(15972056816754255191227949115323096576582604694258194666369093523781851338648)
        ];

        uint256[2][2] memory proofB = [
            [uint256(2326937415402991511375925596093835559060081636747798473816421221609693431205),
             uint256(10407195687200356577554457507994720296950250166940604808579035002708267077109)],
            [uint256(19141088319652749515296066323503091653269865088136655319072494581370430078803),
             uint256(5861943882914413752474356025581604655570757314552000281489514010702140001275)]
        ];

        uint256[2] memory proofC = [
            uint256(2104640690936108291214556824646326261246618196820458019368269297342575541211),
            uint256(20171233286739114642026156958543545009776066764415469497349319027733862520125)
        ];

        uint256[] memory pubInputs = new uint256[](2);
        pubInputs[0] = 75;
        pubInputs[1] = 12716744992787170208634265639094739006435413343713602468320418486773788151152;

        // Tampered proof with point not on curve causes precompile to fail
        vm.prank(agent1);
        vm.expectRevert();
        limits.proveReputation(3, commitment, proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_wrongThreshold() public {
        _setProductionVK();

        // Valid proof but for threshold=75, trying to prove tier 4 (threshold=90)
        bytes32 commitment = bytes32(uint256(12716744992787170208634265639094739006435413343713602468320418486773788151152));

        uint256[2] memory proofA = [
            uint256(19022056641996587162019436378123462165919801281188835382141289665405734489213),
            uint256(15972056816754255191227949115323096576582604694258194666369093523781851338648)
        ];

        uint256[2][2] memory proofB = [
            [uint256(2326937415402991511375925596093835559060081636747798473816421221609693431205),
             uint256(10407195687200356577554457507994720296950250166940604808579035002708267077109)],
            [uint256(19141088319652749515296066323503091653269865088136655319072494581370430078803),
             uint256(5861943882914413752474356025581604655570757314552000281489514010702140001275)]
        ];

        uint256[2] memory proofC = [
            uint256(2104640690936108291214556824646326261246618196820458019368269297342575541211),
            uint256(20171233286739114642026156958543545009776066764415469497349319027733862520125)
        ];

        // Public inputs say threshold=75, but tier 4 requires threshold=90
        uint256[] memory pubInputs = new uint256[](2);
        pubInputs[0] = 75;
        pubInputs[1] = 12716744992787170208634265639094739006435413343713602468320418486773788151152;

        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.BadInputs.selector);
        limits.proveReputation(4, commitment, proofA, proofB, proofC, pubInputs);
    }

    function test_proveReputation_revert_alreadyHigherTier() public {
        _setProductionVK();

        bytes32 commitment = bytes32(uint256(12716744992787170208634265639094739006435413343713602468320418486773788151152));

        uint256[2] memory proofA = [
            uint256(19022056641996587162019436378123462165919801281188835382141289665405734489213),
            uint256(15972056816754255191227949115323096576582604694258194666369093523781851338648)
        ];

        uint256[2][2] memory proofB = [
            [uint256(2326937415402991511375925596093835559060081636747798473816421221609693431205),
             uint256(10407195687200356577554457507994720296950250166940604808579035002708267077109)],
            [uint256(19141088319652749515296066323503091653269865088136655319072494581370430078803),
             uint256(5861943882914413752474356025581604655570757314552000281489514010702140001275)]
        ];

        uint256[2] memory proofC = [
            uint256(2104640690936108291214556824646326261246618196820458019368269297342575541211),
            uint256(20171233286739114642026156958543545009776066764415469497349319027733862520125)
        ];

        uint256[] memory pubInputs = new uint256[](2);
        pubInputs[0] = 75;
        pubInputs[1] = 12716744992787170208634265639094739006435413343713602468320418486773788151152;

        // First prove tier 3
        vm.prank(agent1);
        limits.proveReputation(3, commitment, proofA, proofB, proofC, pubInputs);

        // Try to prove tier 3 again (same tier)
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.AlreadyHigherTier.selector);
        limits.proveReputation(3, commitment, proofA, proofB, proofC, pubInputs);

        // Try to prove tier 2 (lower tier)
        pubInputs[0] = 50;
        vm.prank(agent1);
        vm.expectRevert(ReputationLimits.AlreadyHigherTier.selector);
        limits.proveReputation(2, commitment, proofA, proofB, proofC, pubInputs);
    }
}
