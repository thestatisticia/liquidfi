import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying OnRampOffRamp contract...\n");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Configuration
  const TST_TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0xd93950A7Ef6153E49A8E08818cbED3b854ed3217"; // TST on Sepolia
  const TREASURY_WALLET = process.env.TREASURY_WALLET || "0x12214E5538915d17394f2d2F0c3733e9a32e61c1"; // Official onramp/offramp wallet
  const PAYMENT_DETAILS = process.env.PAYMENT_DETAILS || "Bank: Example Bank, Account: 123456789, Phone: +1234567890";
  const EXCHANGE_RATE = process.env.EXCHANGE_RATE || "1000000"; // 1 token = $1 (with 6 decimals)

  console.log("📌 Configuration:");
  console.log("   Token Address:", TST_TOKEN_ADDRESS);
  console.log("   Treasury Wallet:", TREASURY_WALLET);
  console.log("   Payment Details:", PAYMENT_DETAILS);
  console.log("   Exchange Rate:", EXCHANGE_RATE, "(1 token = $1)\n");

  // Deploy OnRampOffRamp contract
  const OnRampOffRamp = await hre.ethers.getContractFactory("OnRampOffRamp");
  const onRampOffRamp = await OnRampOffRamp.deploy(
    TST_TOKEN_ADDRESS,
    TREASURY_WALLET,
    PAYMENT_DETAILS,
    EXCHANGE_RATE
  );

  await onRampOffRamp.waitForDeployment();
  const address = await onRampOffRamp.getAddress();

  console.log("✅ OnRampOffRamp deployed!");
  console.log("📍 Address:", address);
  console.log("🔗 Explorer:", `https://sepolia.etherscan.io/address/${address}\n`);
  
  // Get network info
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  
  let explorerUrl = "";
  if (chainId === 11155111) {
    explorerUrl = `https://sepolia.etherscan.io/address/${address}`;
  } else if (chainId === 84532) {
    explorerUrl = `https://sepolia.basescan.org/address/${address}`;
  } else if (chainId === 8453) {
    explorerUrl = `https://basescan.org/address/${address}`;
  } else if (chainId === 1) {
    explorerUrl = `https://etherscan.io/address/${address}`;
  }
  
  if (explorerUrl) {
    console.log("🔗 Explorer:", explorerUrl);
  }

  console.log("\n💾 Deployment Info:");
  const deploymentInfo = {
    network: chainId === 11155111 ? "Ethereum Sepolia" : 
             chainId === 84532 ? "Base Sepolia" :
             chainId === 8453 ? "Base Mainnet" :
             chainId === 1 ? "Ethereum Mainnet" : "Unknown",
    chainId: chainId,
    contractAddress: address,
    tokenAddress: TST_TOKEN_ADDRESS,
    treasuryWallet: TREASURY_WALLET,
    paymentDetails: PAYMENT_DETAILS,
    exchangeRate: EXCHANGE_RATE,
    deployerAddress: deployer.address,
    deploymentDate: new Date().toISOString()
  };

  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log("1. Update the frontend with contract address:", address);
  console.log("2. Set payment details in the contract (bank account, phone number, etc.)");
  console.log("3. Configure exchange rate if needed");
  console.log("4. Start accepting onramp/offramp requests!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

