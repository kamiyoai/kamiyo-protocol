/**
 * ERC-8004 Contract Deployment Script
 * Deploys AgentIdentityRegistry and AgentReputationRegistry to specified network
 */

const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying ERC-8004 contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Deploy AgentIdentityRegistry
    console.log("\n1. Deploying AgentIdentityRegistry...");
    const AgentIdentityRegistry = await hre.ethers.getContractFactory("AgentIdentityRegistry");
    const identityRegistry = await AgentIdentityRegistry.deploy();
    await identityRegistry.deployed();

    console.log("✓ AgentIdentityRegistry deployed to:", identityRegistry.address);

    // Deploy AgentReputationRegistry
    console.log("\n2. Deploying AgentReputationRegistry...");
    const AgentReputationRegistry = await hre.ethers.getContractFactory("AgentReputationRegistry");
    const reputationRegistry = await AgentReputationRegistry.deploy(identityRegistry.address);
    await reputationRegistry.deployed();

    console.log("✓ AgentReputationRegistry deployed to:", reputationRegistry.address);

    // Save deployment addresses
    const deploymentInfo = {
        network: hre.network.name,
        chainId: hre.network.config.chainId,
        identityRegistry: identityRegistry.address,
        reputationRegistry: reputationRegistry.address,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
    };

    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Wait for block confirmations
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        console.log("\nWaiting for 5 block confirmations...");
        await identityRegistry.deployTransaction.wait(5);
        await reputationRegistry.deployTransaction.wait(5);

        // Verify contracts on Etherscan
        console.log("\nVerifying contracts on Etherscan...");

        try {
            await hre.run("verify:verify", {
                address: identityRegistry.address,
                constructorArguments: [],
            });
            console.log("✓ AgentIdentityRegistry verified");
        } catch (error) {
            console.log("! AgentIdentityRegistry verification failed:", error.message);
        }

        try {
            await hre.run("verify:verify", {
                address: reputationRegistry.address,
                constructorArguments: [identityRegistry.address],
            });
            console.log("✓ AgentReputationRegistry verified");
        } catch (error) {
            console.log("! AgentReputationRegistry verification failed:", error.message);
        }
    }

    // Save to file
    const fs = require("fs");
    const deploymentFile = `./deployments/${hre.network.name}-deployment.json`;
    fs.mkdirSync("./deployments", { recursive: true });
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\nDeployment info saved to: ${deploymentFile}`);

    // Generate environment variables
    console.log("\n=== Environment Variables ===");
    console.log(`ERC8004_IDENTITY_REGISTRY_${hre.network.name.toUpperCase()}=${identityRegistry.address}`);
    console.log(`ERC8004_REPUTATION_REGISTRY_${hre.network.name.toUpperCase()}=${reputationRegistry.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
