// Test PaymentSchedule contract
// Run with: npx hardhat run scripts/test-payment-schedule.js --network baseSepolia

import hre from "hardhat";

async function main() {
  console.log("🧪 Testing PaymentSchedule contract...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Testing with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  const PAYMENT_SCHEDULE_ADDRESS = "0x9FFa295c07Ec65D9013944b3b15C44608c77bf34";
  const TST_TOKEN_ADDRESS = "0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9";
  
  // Get contracts
  const PaymentSchedule = await hre.ethers.getContractFactory("PaymentSchedule");
  const paymentSchedule = PaymentSchedule.attach(PAYMENT_SCHEDULE_ADDRESS);
  
  const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function mint(address to, uint256 amount)'
  ];
  
  const token = new hre.ethers.Contract(TST_TOKEN_ADDRESS, ERC20_ABI, deployer);
  
  // Test 1: Check contract is accessible
  console.log("Test 1: Checking contract accessibility...");
  try {
    const scheduleCount = await paymentSchedule.scheduleCount();
    console.log("✅ Contract accessible, schedule count:", scheduleCount.toString());
  } catch (err) {
    console.error("❌ Contract not accessible:", err.message);
    return;
  }
  
  // Test 2: Check TST balance
  console.log("\nTest 2: Checking TST balance...");
  const tstBalance = await token.balanceOf(deployer.address);
  console.log("TST Balance:", hre.ethers.formatEther(tstBalance), "TST");
  
  if (tstBalance === 0n) {
    console.log("⚠️  No TST tokens. Minting 1000 TST...");
    try {
      const mintTx = await token.mint(deployer.address, hre.ethers.parseEther("1000"));
      await mintTx.wait();
      console.log("✅ Minted 1000 TST");
    } catch (err) {
      console.error("❌ Failed to mint:", err.message);
      return;
    }
  }
  
  // Test 3: Check allowance
  console.log("\nTest 3: Checking allowance...");
  const allowance = await token.allowance(deployer.address, PAYMENT_SCHEDULE_ADDRESS);
  console.log("Current allowance:", hre.ethers.formatEther(allowance), "TST");
  
  if (allowance === 0n) {
    console.log("⚠️  No allowance. Approving...");
    try {
      const approveTx = await token.approve(PAYMENT_SCHEDULE_ADDRESS, hre.ethers.MaxUint256);
      await approveTx.wait();
      console.log("✅ Approved");
    } catch (err) {
      console.error("❌ Failed to approve:", err.message);
      return;
    }
  }
  
  // Test 4: Create a test schedule
  console.log("\nTest 4: Creating test schedule...");
  const testRecipient = deployer.address; // Send to self for testing
  const testAmount = hre.ethers.parseEther("10"); // 10 TST
  const testInterval = 600; // 10 minutes
  
  try {
    console.log("Creating schedule with:");
    console.log("  Recipient:", testRecipient);
    console.log("  Amount:", hre.ethers.formatEther(testAmount), "TST");
    console.log("  Interval:", testInterval, "seconds");
    
    // Estimate gas first
    const gasEstimate = await paymentSchedule.createSchedule.estimateGas(
      testRecipient,
      testAmount,
      testInterval
    );
    console.log("  Gas estimate:", gasEstimate.toString());
    
    // Create schedule
    const tx = await paymentSchedule.createSchedule(testRecipient, testAmount, testInterval);
    console.log("  Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Schedule created successfully!");
    console.log("  Block number:", receipt.blockNumber);
    
    // Get the schedule ID
    const scheduleCount = await paymentSchedule.scheduleCount();
    const scheduleId = scheduleCount - 1n;
    console.log("  Schedule ID:", scheduleId.toString());
    
    // Get schedule details
    const schedule = await paymentSchedule.getSchedule(scheduleId);
    console.log("\nSchedule details:");
    console.log("  Creator:", schedule.creator);
    console.log("  Recipient:", schedule.recipient);
    console.log("  Amount:", hre.ethers.formatEther(schedule.amount), "TST");
    console.log("  Interval:", schedule.interval.toString(), "seconds");
    console.log("  Active:", schedule.active);
    
  } catch (err) {
    console.error("❌ Failed to create schedule:", err.message);
    if (err.reason) {
      console.error("  Reason:", err.reason);
    }
    if (err.data) {
      console.error("  Data:", err.data);
    }
  }
  
  console.log("\n✅ Testing complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });











