import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy AgentIdentityRegistry_Production
    console.log("\n🚀 Deploying AgentIdentityRegistry_Production...");
    const IdentityRegistry = await ethers.getContractFactory("AgentIdentityRegistry_Production");
    const identityRegistry = await IdentityRegistry.deploy();
    await identityRegistry.waitForDeployment();

    const identityAddress = await identityRegistry.getAddress();
    console.log("✓ AgentIdentityRegistry_Production deployed to:", identityAddress);

    // Deploy AgentReputationRegistry_Production
    console.log("\n🚀 Deploying AgentReputationRegistry_Production...");
    const ReputationRegistry = await ethers.getContractFactory("AgentReputationRegistry_Production");
    const reputationRegistry = await ReputationRegistry.deploy(identityAddress);
    await reputationRegistry.waitForDeployment();

    const reputationAddress = await reputationRegistry.getAddress();
    console.log("✓ AgentReputationRegistry_Production deployed to:", reputationAddress);

    // Setup roles
    console.log("\n⚙️  Setting up roles...");

    const PAUSER_ROLE = await identityRegistry.PAUSER_ROLE();
    const ADMIN_ROLE = await identityRegistry.REGISTRY_ADMIN_ROLE();

    // Grant roles to deployer (can be changed later)
    await identityRegistry.grantRole(PAUSER_ROLE, deployer.address);
    await identityRegistry.grantRole(ADMIN_ROLE, deployer.address);
    console.log("✓ Roles granted to deployer");

    // Output deployment info
    console.log("\n📝 Deployment Summary:");
    console.log("========================");
    console.log("Network:", (await deployer.provider.getNetwork()).name);
    console.log("AgentIdentityRegistry_Production:", identityAddress);
    console.log("AgentReputationRegistry_Production:", reputationAddress);
    console.log("\n💡 Environment Variables:");
    console.log(`ERC8004_IDENTITY_REGISTRY_ADDRESS=${identityAddress}`);
    console.log(`ERC8004_REPUTATION_REGISTRY_ADDRESS=${reputationAddress}`);

    // Output contract verification commands
    console.log("\n🔍 Contract Verification Commands:");
    console.log(`npx hardhat verify --network ${(await deployer.provider.getNetwork()).name} ${identityAddress}`);
    console.log(`npx hardhat verify --network ${(await deployer.provider.getNetwork()).name} ${reputationAddress} ${identityAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
