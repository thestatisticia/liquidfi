// Deploy StreamingPayment contract
// Run with: npx hardhat run scripts/deploy-streaming-payment.js --network baseSepolia

import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying StreamingPayment contract...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // TST token address
  const TST_TOKEN_ADDRESS = "0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9";
  
  console.log("📌 Using TST token:", TST_TOKEN_ADDRESS);

  // Deploy StreamingPayment contract
  const StreamingPayment = await hre.ethers.getContractFactory("StreamingPayment");
  const streamingPayment = await StreamingPayment.deploy(TST_TOKEN_ADDRESS);

  await streamingPayment.waitForDeployment();
  const contractAddress = await streamingPayment.getAddress();

  console.log("✅ StreamingPayment deployed!");
  console.log("📍 Address:", contractAddress);
  console.log("🔗 Explorer:", `https://sepolia.basescan.org/address/${contractAddress}\n`);

  console.log("🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update AutomaticPaymentDapp.jsx with contract address:", contractAddress);
  console.log("2. Start the app and test streaming payments!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });











