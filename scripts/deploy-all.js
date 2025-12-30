import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("🚀 Starting Full Deployment to Base Sepolia...\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("📝 Deploying with account:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

    // 1. Deploy TestStablecoin
    console.log("1️⃣  Deploying TestStablecoin...");
    const TestStablecoin = await hre.ethers.getContractFactory("TestStablecoin");
    const testStablecoin = await TestStablecoin.deploy();
    await testStablecoin.waitForDeployment();
    const tokenAddress = await testStablecoin.getAddress();
    console.log("✅ TestStablecoin deployed at:", tokenAddress);

    // 2. Mint tokens to deployer
    console.log("🪙  Minting 100,000 TST to deployer...");
    const mintTx = await testStablecoin.mint(deployer.address, hre.ethers.parseEther("100000"));
    await mintTx.wait();
    console.log("✅ Minted.\n");

    // 3. Deploy StreamFi
    console.log("2️⃣  Deploying StreamFi...");
    const StreamFi = await hre.ethers.getContractFactory("StreamFi");
    const streamFi = await StreamFi.deploy(tokenAddress);
    await streamFi.waitForDeployment();
    const streamFiAddress = await streamFi.getAddress();
    console.log("✅ StreamFi deployed at:", streamFiAddress);

    // 4. Save Deployment Info
    console.log("\n💾 Saving deployment info...");
    const deploymentInfo = {
        network: "Base Sepolia Testnet",
        chainId: 84532,
        rpcUrl: "https://sepolia.base.org",
        explorerUrl: "https://sepolia.basescan.org",
        contractName: "TestStablecoin",
        symbol: "TST",
        decimals: 18,
        deployerAddress: deployer.address,
        tokenAddress: tokenAddress,
        streamFiAddress: streamFiAddress,
        deploymentDate: new Date().toISOString()
    };

    const deployPath = path.join(__dirname, "../deployment-info.json");
    fs.writeFileSync(deployPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ Saved to deployment-info.json\n");

    console.log("🎉 DEPLOYMENT COMPLETE 🎉");
    console.log("------------------------------------------------");
    console.log("Token Address:    ", tokenAddress);
    console.log("StreamFi Address: ", streamFiAddress);
    console.log("------------------------------------------------");
    console.log("\nNext Steps:");
    console.log("1. Use these addresses to update src/config/tokens.js");
    console.log("2. Use these addresses to update src/components/StreamFiDapp.jsx");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
