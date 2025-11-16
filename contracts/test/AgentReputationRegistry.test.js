const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentReputationRegistry Production Tests", function () {
    let identityRegistry, reputationRegistry;
    let owner, agentOwner, client1, client2, pauser;
    let agentId;

    beforeEach(async function () {
        [owner, agentOwner, client1, client2, pauser] = await ethers.getSigners();

        const IdentityRegistry = await ethers.getContractFactory("AgentIdentityRegistry_Production");
        identityRegistry = await IdentityRegistry.deploy();
        await identityRegistry.waitForDeployment();

        const ReputationRegistry = await ethers.getContractFactory("AgentReputationRegistry_Production");
        reputationRegistry = await ReputationRegistry.deploy(await identityRegistry.getAddress());
        await reputationRegistry.waitForDeployment();

        const PAUSER_ROLE = await reputationRegistry.PAUSER_ROLE();
        await reputationRegistry.grantRole(PAUSER_ROLE, pauser.address);

        const tx = await identityRegistry.connect(agentOwner).functions["register()"]();
        await tx.wait();
        agentId = 1;
    });

    describe("Feedback Submission", function () {
        it("Should submit feedback successfully", async function () {
            const tx = await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "https://feedback.com/1",
                ethers.id("hash123"),
                "0x"
            );

            await expect(tx).to.emit(reputationRegistry, "NewFeedback");
        });

        it("Should reject invalid score", async function () {
            await expect(
                reputationRegistry.connect(client1).giveFeedback(
                    agentId,
                    101,
                    ethers.id("quality"),
                    ethers.id("responsive"),
                    "",
                    ethers.ZeroHash,
                    "0x"
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "InvalidScore");
        });

        it("Should reject feedback for nonexistent agent", async function () {
            await expect(
                reputationRegistry.connect(client1).giveFeedback(
                    999,
                    85,
                    ethers.id("quality"),
                    ethers.id("responsive"),
                    "",
                    ethers.ZeroHash,
                    "0x"
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "AgentNotFound");
        });

        it("Should enforce rate limiting", async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );

            await expect(
                reputationRegistry.connect(client1).giveFeedback(
                    agentId,
                    90,
                    ethers.id("quality"),
                    ethers.id("responsive"),
                    "",
                    ethers.ZeroHash,
                    "0x"
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "RateLimitExceeded");
        });

        it("Should reject oversized file URI", async function () {
            const longUri = "a".repeat(513);

            await expect(
                reputationRegistry.connect(client1).giveFeedback(
                    agentId,
                    85,
                    ethers.id("quality"),
                    ethers.id("responsive"),
                    longUri,
                    ethers.ZeroHash,
                    "0x"
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "InvalidFileUri");
        });

        it("Should track multiple clients", async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine");

            await reputationRegistry.connect(client2).giveFeedback(
                agentId,
                90,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );

            const clients = await reputationRegistry.getClients(agentId);
            expect(clients.length).to.equal(2);
            expect(clients).to.include(client1.address);
            expect(clients).to.include(client2.address);
        });
    });

    describe("Feedback Revocation", function () {
        beforeEach(async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );
        });

        it("Should revoke feedback successfully", async function () {
            const tx = await reputationRegistry.connect(client1).revokeFeedback(agentId, 0);
            await expect(tx).to.emit(reputationRegistry, "FeedbackRevoked");

            const feedback = await reputationRegistry.readFeedback(agentId, client1.address, 0);
            expect(feedback.isRevoked).to.be.true;
        });

        it("Should reject revoking nonexistent feedback", async function () {
            await expect(
                reputationRegistry.connect(client1).revokeFeedback(agentId, 999)
            ).to.be.revertedWithCustomError(reputationRegistry, "FeedbackNotFound");
        });

        it("Should reject double revocation", async function () {
            await reputationRegistry.connect(client1).revokeFeedback(agentId, 0);

            await expect(
                reputationRegistry.connect(client1).revokeFeedback(agentId, 0)
            ).to.be.revertedWithCustomError(reputationRegistry, "FeedbackAlreadyRevoked");
        });
    });

    describe("Response Management", function () {
        beforeEach(async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );
        });

        it("Should append response as agent owner", async function () {
            const tx = await reputationRegistry.connect(agentOwner).appendResponse(
                agentId,
                client1.address,
                0,
                "https://response.com/1",
                ethers.id("response_hash")
            );

            await expect(tx).to.emit(reputationRegistry, "ResponseAppended");
        });

        it("Should reject response from non-owner", async function () {
            await expect(
                reputationRegistry.connect(client2).appendResponse(
                    agentId,
                    client1.address,
                    0,
                    "https://response.com/1",
                    ethers.id("response_hash")
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "NotAgentOwner");
        });

        it("Should reject oversized response URI", async function () {
            const longUri = "a".repeat(513);

            await expect(
                reputationRegistry.connect(agentOwner).appendResponse(
                    agentId,
                    client1.address,
                    0,
                    longUri,
                    ethers.id("response_hash")
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "InvalidFileUri");
        });

        it("Should track response count", async function () {
            await reputationRegistry.connect(agentOwner).appendResponse(
                agentId,
                client1.address,
                0,
                "https://response.com/1",
                ethers.id("hash1")
            );

            await reputationRegistry.connect(agentOwner).appendResponse(
                agentId,
                client1.address,
                0,
                "https://response.com/2",
                ethers.id("hash2")
            );

            const count = await reputationRegistry.getResponseCount(
                agentId,
                client1.address,
                0,
                agentOwner.address
            );
            expect(count).to.equal(2);
        });
    });

    describe("Reputation Summary", function () {
        beforeEach(async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                80,
                ethers.id("quality"),
                ethers.id("responsive"),
                "",
                ethers.ZeroHash,
                "0x"
            );

            await ethers.provider.send("evm_increaseTime", [61]);
            await ethers.provider.send("evm_mine");

            await reputationRegistry.connect(client2).giveFeedback(
                agentId,
                90,
                ethers.id("quality"),
                ethers.id("fast"),
                "",
                ethers.ZeroHash,
                "0x"
            );
        });

        it("Should calculate average score correctly", async function () {
            const summary = await reputationRegistry.getSummary(
                agentId,
                [],
                ethers.ZeroHash,
                ethers.ZeroHash
            );

            expect(summary.count).to.equal(2);
            expect(summary.averageScore).to.equal(85);
        });

        it("Should filter by tag1", async function () {
            const summary = await reputationRegistry.getSummary(
                agentId,
                [],
                ethers.id("quality"),
                ethers.ZeroHash
            );

            expect(summary.count).to.equal(2);
        });

        it("Should filter by tag2", async function () {
            const summary = await reputationRegistry.getSummary(
                agentId,
                [],
                ethers.ZeroHash,
                ethers.id("responsive")
            );

            expect(summary.count).to.equal(1);
            expect(summary.averageScore).to.equal(80);
        });

        it("Should filter by specific clients", async function () {
            const summary = await reputationRegistry.getSummary(
                agentId,
                [client1.address],
                ethers.ZeroHash,
                ethers.ZeroHash
            );

            expect(summary.count).to.equal(1);
            expect(summary.averageScore).to.equal(80);
        });

        it("Should exclude revoked feedback", async function () {
            await reputationRegistry.connect(client1).revokeFeedback(agentId, 0);

            const summary = await reputationRegistry.getSummary(
                agentId,
                [],
                ethers.ZeroHash,
                ethers.ZeroHash
            );

            expect(summary.count).to.equal(1);
            expect(summary.averageScore).to.equal(90);
        });
    });

    describe("Security Features", function () {
        it("Should pause/unpause with correct role", async function () {
            await reputationRegistry.connect(pauser).pause();
            expect(await reputationRegistry.paused()).to.be.true;

            await reputationRegistry.connect(pauser).unpause();
            expect(await reputationRegistry.paused()).to.be.false;
        });

        it("Should block operations when paused", async function () {
            await reputationRegistry.connect(pauser).pause();

            await expect(
                reputationRegistry.connect(client1).giveFeedback(
                    agentId,
                    85,
                    ethers.id("quality"),
                    ethers.id("responsive"),
                    "",
                    ethers.ZeroHash,
                    "0x"
                )
            ).to.be.revertedWithCustomError(reputationRegistry, "EnforcedPause");
        });
    });

    describe("Data Reading", function () {
        beforeEach(async function () {
            await reputationRegistry.connect(client1).giveFeedback(
                agentId,
                85,
                ethers.id("quality"),
                ethers.id("responsive"),
                "https://feedback.com/1",
                ethers.id("hash123"),
                "0x"
            );
        });

        it("Should read feedback correctly", async function () {
            const feedback = await reputationRegistry.readFeedback(
                agentId,
                client1.address,
                0
            );

            expect(feedback.score).to.equal(85);
            expect(feedback.tag1).to.equal(ethers.id("quality"));
            expect(feedback.tag2).to.equal(ethers.id("responsive"));
            expect(feedback.fileuri).to.equal("https://feedback.com/1");
            expect(feedback.isRevoked).to.be.false;
        });

        it("Should get last index", async function () {
            const lastIndex = await reputationRegistry.getLastIndex(agentId, client1.address);
            expect(lastIndex).to.equal(1);
        });
    });
});
