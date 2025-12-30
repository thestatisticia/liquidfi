// Hardhat deployment script
// Run with: npx hardhat run scripts/deploy.js --network baseSepolia

import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying TestStablecoin to Base Sepolia...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy contract
  const TestStablecoin = await hre.ethers.getContractFactory("TestStablecoin");
  const testStablecoin = await TestStablecoin.deploy();

  await testStablecoin.waitForDeployment();
  const contractAddress = await testStablecoin.getAddress();

  console.log("✅ Contract deployed!");
  console.log("📍 Address:", contractAddress);
  console.log("🔗 Explorer:", `https://sepolia.basescan.org/address/${contractAddress}\n`);

  // Mint initial tokens to deployer
  console.log("🪙 Minting 1000 TST to deployer...");
  const mintTx = await testStablecoin.mint(deployer.address, hre.ethers.parseEther("1000"));
  await mintTx.wait();
  console.log("✅ Minted 1000 TST tokens\n");

  console.log("🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update src/config/tokens.js with contract address:", contractAddress);
  console.log("2. Add token to MetaMask");
  console.log("3. Start testing the payment dapp!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
