const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentIdentityRegistry Production Tests", function () {
    let registry;
    let owner, user1, user2, pauser, admin;

    beforeEach(async function () {
        [owner, user1, user2, pauser, admin] = await ethers.getSigners();

        const Registry = await ethers.getContractFactory("AgentIdentityRegistry_Production");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        const PAUSER_ROLE = await registry.PAUSER_ROLE();
        const ADMIN_ROLE = await registry.REGISTRY_ADMIN_ROLE();
        await registry.grantRole(PAUSER_ROLE, pauser.address);
        await registry.grantRole(ADMIN_ROLE, admin.address);
    });

    describe("Registration", function () {
        it("Should register agent successfully", async function () {
            const tx = await registry.connect(user1).functions["register(string)"]("https://example.com/agent/1");
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => {
                try {
                    return registry.interface.parseLog(log).name === "Registered";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
        });

        it("Should auto-generate URI", async function () {
            await registry.connect(user1).functions["register()"]();

            const uri = await registry.tokenURI(1);
            expect(uri).to.include("kamiyo.ai/api/v1/agents/1");
        });

        it("Should fail when paused", async function () {
            await registry.connect(pauser).pause();

            await expect(
                registry.connect(user1).functions["register()"]()
            ).to.be.revertedWithCustomError(registry, "EnforcedPause");
        });

        it("Should register with metadata", async function () {
            const metadata = [
                { key: "name", value: ethers.toUtf8Bytes("Test Agent") },
                { key: "version", value: ethers.toUtf8Bytes("1.0") }
            ];

            const tx = await registry.connect(user1).functions["register(string,(string,bytes)[])"](
                "https://example.com/agent/1",
                metadata
            );
            await tx.wait();

            const nameValue = await registry.getMetadata(1, "name");
            expect(ethers.toUtf8String(nameValue)).to.equal("Test Agent");
        });

        it("Should reject oversized metadata", async function () {
            const largeValue = new Uint8Array(11000);

            const metadata = [
                { key: "large", value: largeValue }
            ];

            await expect(
                registry.connect(user1).functions["register(string,(string,bytes)[])"](
                    "https://example.com/agent/1",
                    metadata
                )
            ).to.be.revertedWithCustomError(registry, "RegistrationFailed");
        });
    });

    describe("Metadata", function () {
        beforeEach(async function () {
            await registry.connect(user1).functions["register()"]();
        });

        it("Should set metadata as owner", async function () {
            await registry.connect(user1).setMetadata(
                1,
                "test_key",
                ethers.toUtf8Bytes("test_value")
            );

            const value = await registry.getMetadata(1, "test_key");
            expect(ethers.toUtf8String(value)).to.equal("test_value");
        });

        it("Should reject metadata from non-owner", async function () {
            await expect(
                registry.connect(user2).setMetadata(
                    1,
                    "test_key",
                    ethers.toUtf8Bytes("test_value")
                )
            ).to.be.revertedWithCustomError(registry, "Unauthorized");
        });

        it("Should allow admin to set metadata", async function () {
            await registry.connect(admin).setMetadata(
                1,
                "admin_key",
                ethers.toUtf8Bytes("admin_value")
            );

            const value = await registry.getMetadata(1, "admin_key");
            expect(ethers.toUtf8String(value)).to.equal("admin_value");
        });

        it("Should enforce metadata size limit", async function () {
            const largeValue = new Uint8Array(11000);

            await expect(
                registry.connect(user1).setMetadata(1, "large", largeValue)
            ).to.be.revertedWithCustomError(registry, "RegistrationFailed");
        });

        it("Should enforce metadata key limit", async function () {
            for (let i = 0; i < 50; i++) {
                await registry.connect(user1).setMetadata(
                    1,
                    `key_${i}`,
                    ethers.toUtf8Bytes("value")
                );
            }

            await expect(
                registry.connect(user1).setMetadata(
                    1,
                    "key_51",
                    ethers.toUtf8Bytes("value")
                )
            ).to.be.revertedWithCustomError(registry, "MetadataLimitExceeded");
        });

        it("Should reject empty metadata key", async function () {
            await expect(
                registry.connect(user1).setMetadata(1, "", ethers.toUtf8Bytes("value"))
            ).to.be.revertedWithCustomError(registry, "InvalidMetadataKey");
        });

        it("Should get metadata keys", async function () {
            await registry.connect(user1).setMetadata(1, "key1", ethers.toUtf8Bytes("val1"));
            await registry.connect(user1).setMetadata(1, "key2", ethers.toUtf8Bytes("val2"));

            const keys = await registry.getMetadataKeys(1);
            expect(keys.length).to.equal(2);
            expect(keys).to.include("key1");
            expect(keys).to.include("key2");
        });
    });

    describe("Security", function () {
        it("Should pause/unpause with correct role", async function () {
            await registry.connect(pauser).pause();
            expect(await registry.paused()).to.be.true;

            await registry.connect(pauser).unpause();
            expect(await registry.paused()).to.be.false;
        });

        it("Should reject pause from non-pauser", async function () {
            await expect(
                registry.connect(user1).pause()
            ).to.be.reverted;
        });

        it("Should reject operations when paused", async function () {
            await registry.connect(pauser).pause();

            await expect(
                registry.connect(user1).functions["register()"]()
            ).to.be.revertedWithCustomError(registry, "EnforcedPause");
        });

        it("Should emit pause events", async function () {
            await expect(registry.connect(pauser).pause())
                .to.emit(registry, "RegistryPaused");

            await expect(registry.connect(pauser).unpause())
                .to.emit(registry, "RegistryUnpaused");
        });
    });

    describe("Access Control", function () {
        it("Should have correct default roles", async function () {
            const DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
            expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should grant and revoke roles", async function () {
            const PAUSER_ROLE = await registry.PAUSER_ROLE();

            await registry.grantRole(PAUSER_ROLE, user1.address);
            expect(await registry.hasRole(PAUSER_ROLE, user1.address)).to.be.true;

            await registry.revokeRole(PAUSER_ROLE, user1.address);
            expect(await registry.hasRole(PAUSER_ROLE, user1.address)).to.be.false;
        });
    });

    describe("URI Management", function () {
        beforeEach(async function () {
            await registry.connect(user1).functions["register()"]();
        });

        it("Should update registration URI as owner", async function () {
            const newURI = "https://newuri.com/agent/1";
            await registry.connect(user1).updateRegistrationURI(1, newURI);

            const uri = await registry.tokenURI(1);
            expect(uri).to.equal(newURI);
        });

        it("Should reject URI update from non-owner", async function () {
            await expect(
                registry.connect(user2).updateRegistrationURI(1, "https://hack.com")
            ).to.be.revertedWithCustomError(registry, "Unauthorized");
        });
    });

    describe("Gas Optimization", function () {
        it("Should use custom errors efficiently", async function () {
            await expect(
                registry.connect(user2).setMetadata(
                    999,
                    "key",
                    ethers.toUtf8Bytes("value")
                )
            ).to.be.revertedWithCustomError(registry, "ERC721NonexistentToken");
        });
    });

    describe("Total Agents Counter", function () {
        it("Should track total agents correctly", async function () {
            expect(await registry.totalAgents()).to.equal(0);

            await registry.connect(user1).functions["register()"]();
            expect(await registry.totalAgents()).to.equal(1);

            await registry.connect(user2).functions["register()"]();
            expect(await registry.totalAgents()).to.equal(2);
        });
    });

    describe("ERC721 Compliance", function () {
        beforeEach(async function () {
            await registry.connect(user1).functions["register()"]();
        });

        it("Should support ERC721 interface", async function () {
            const ERC721_INTERFACE_ID = "0x80ac58cd";
            expect(await registry.supportsInterface(ERC721_INTERFACE_ID)).to.be.true;
        });

        it("Should transfer agent ownership", async function () {
            await registry.connect(user1).transferFrom(user1.address, user2.address, 1);
            expect(await registry.ownerOf(1)).to.equal(user2.address);
        });

        it("Should approve and transferFrom", async function () {
            await registry.connect(user1).approve(user2.address, 1);
            await registry.connect(user2).transferFrom(user1.address, user2.address, 1);
            expect(await registry.ownerOf(1)).to.equal(user2.address);
        });
    });
});
