// Hardhat deployment script for Ethereum Sepolia
// Run with: npx hardhat run scripts/deploy-sepolia.js --network sepolia

import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying TestStablecoin to Ethereum Sepolia...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Error: Account has no ETH. Please fund the account with Sepolia ETH.");
    console.log("💡 Get Sepolia ETH from: https://sepoliafaucet.com/");
    process.exit(1);
  }

  // Deploy contract
  console.log("📦 Deploying TestStablecoin contract...");
  const TestStablecoin = await hre.ethers.getContractFactory("TestStablecoin");
  const testStablecoin = await TestStablecoin.deploy();

  await testStablecoin.waitForDeployment();
  const contractAddress = await testStablecoin.getAddress();

  console.log("✅ Contract deployed!");
  console.log("📍 Address:", contractAddress);
  console.log("🔗 Explorer:", `https://sepolia.etherscan.io/address/${contractAddress}\n`);

  // Mint initial tokens to deployer
  console.log("🪙 Minting 100,000 TST to deployer...");
  const mintTx = await testStablecoin.mint(deployer.address, hre.ethers.parseEther("100000"));
  await mintTx.wait();
  console.log("✅ Minted 100,000 TST tokens\n");

  // Save deployment info
  const deploymentInfo = {
    network: "Ethereum Sepolia Testnet",
    chainId: 11155111,
    rpcUrl: "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    contractName: "TestStablecoin",
    symbol: "TST",
    decimals: 18,
    deployerAddress: deployer.address,
    tokenAddress: contractAddress,
    deploymentDate: new Date().toISOString()
  };

  console.log("💾 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update src/config/tokens.js with contract address:", contractAddress);
  console.log("2. Update StreamFiDapp.jsx chain ID to 11155111");
  console.log("3. Add token to MetaMask");
  console.log("4. Start testing the payment dapp!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });



