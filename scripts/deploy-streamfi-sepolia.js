import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying StreamFi contract to Ethereum Sepolia...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Error: Account has no ETH. Please fund the account with Sepolia ETH.");
    console.log("💡 Get Sepolia ETH from: https://sepoliafaucet.com/");
    process.exit(1);
  }

  // TST Token address on Ethereum Sepolia (deployed earlier)
  const TST_TOKEN_ADDRESS = "0xd93950A7Ef6153E49A8E08818cbED3b854ed3217";
  console.log("📌 Using TST token:", TST_TOKEN_ADDRESS);

  // Deploy StreamFi contract
  console.log("📦 Deploying StreamFi contract...");
  const StreamFi = await hre.ethers.getContractFactory("StreamFi");
  const streamFi = await StreamFi.deploy(TST_TOKEN_ADDRESS);

  await streamFi.waitForDeployment();
  const address = await streamFi.getAddress();

  console.log("✅ StreamFi deployed!");
  console.log("📍 Address:", address);
  console.log("🔗 Explorer: https://sepolia.etherscan.io/address/" + address);
  
  // Save deployment info
  const deploymentInfo = {
    network: "Ethereum Sepolia Testnet",
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    tokenAddress: TST_TOKEN_ADDRESS,
    streamFiAddress: address,
    deployerAddress: deployer.address,
    deploymentDate: new Date().toISOString()
  };

  console.log("\n💾 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update StreamFiDapp.jsx with contract address:", address);
  console.log("2. Start the app and test streaming payments!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });



