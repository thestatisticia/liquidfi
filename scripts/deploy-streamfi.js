import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying StreamFi contract...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // TST Token address on Base Sepolia
  const TST_TOKEN_ADDRESS = "0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9";
  console.log("📌 Using TST token:", TST_TOKEN_ADDRESS);

  // Deploy StreamFi contract
  const StreamFi = await hre.ethers.getContractFactory("StreamFi");
  const streamFi = await StreamFi.deploy(TST_TOKEN_ADDRESS);

  await streamFi.waitForDeployment();
  const address = await streamFi.getAddress();

  console.log("✅ StreamFi deployed!");
  console.log("📍 Address:", address);
  console.log("🔗 Explorer: https://sepolia.basescan.org/address/" + address);
  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update StreamingPaymentDapp.jsx with contract address:", address);
  console.log("2. Start the app and test streaming payments!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

