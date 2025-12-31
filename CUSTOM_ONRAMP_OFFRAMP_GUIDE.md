# Custom OnRamp/OffRamp System Guide

This guide explains how to set up and use the custom onramp/offramp system for buying and selling TST tokens.

## Overview

The custom onramp/offramp system allows you to:
- **OnRamp (Buy)**: Users request tokens, send fiat payment to your account, and receive tokens after admin approval
- **OffRamp (Sell)**: Users send tokens to the contract, request cash, and receive payment after admin approval

## Smart Contract Features

### OnRamp Process
1. User creates a request with:
   - Token amount they want to buy
   - Wallet address to receive tokens
   - Payment details (bank account, phone number, etc.)
   - Payment method
2. User sends fiat payment to your account (bank, mobile money, etc.)
3. Admin approves the request
4. Tokens are automatically sent to user's wallet (minus fee)

### OffRamp Process
1. User creates a request with:
   - Token amount they want to sell
   - Where to send cash (bank account, phone number, etc.)
   - Payment method
2. Tokens are automatically locked in the contract
3. Admin approves the request
4. Admin sends cash to user (manually)
5. Tokens are sent to treasury wallet

## Deployment

### 1. Deploy the Contract

```bash
# Set environment variables (optional)
export TOKEN_ADDRESS=0xYourTokenAddress
export TREASURY_WALLET=0xYourTreasuryWallet
export PAYMENT_DETAILS="Bank: Your Bank, Account: 123456789, Phone: +1234567890"
export EXCHANGE_RATE=1000000  # 1 token = $1 (with 6 decimals)

# Deploy
npx hardhat run scripts/deploy-onramp-offramp.js --network sepolia
```

### 2. Configure Frontend

Set the contract address in your frontend:

**Option 1: Environment Variable**
```env
VITE_ONRAMP_OFFRAMP_CONTRACT=0xYourDeployedContractAddress
```

**Option 2: In the UI**
- Navigate to Buy/Sell tab
- Enter contract address when prompted
- Click "Initialize Contract"

## Configuration

### Update Payment Details

As the contract owner, you can update payment details:

```javascript
// In your admin interface or via ethers.js
await contract.updatePaymentDetails("Bank: New Bank, Account: 987654321, Phone: +0987654321");
```

### Update Exchange Rate

```javascript
// Set exchange rate (1 token = $1 means 1000000 with 6 decimals)
// For 1 token = $0.50, use 500000
await contract.updateExchangeRate(1000000);
```

### Update Limits

```javascript
// Set min/max amounts (in wei)
await contract.updateLimits(
  ethers.parseEther("10"),    // minOnRamp: 10 tokens
  ethers.parseEther("100000"), // maxOnRamp: 100,000 tokens
  ethers.parseEther("10"),    // minOffRamp: 10 tokens
  ethers.parseEther("100000")  // maxOffRamp: 100,000 tokens
);
```

### Update Fees

```javascript
// Set fees in basis points (200 = 2%, 500 = 5%)
await contract.updateFees(200, 200); // 2% onramp fee, 2% offramp fee
```

## Admin Operations

### Approve OnRamp Request

1. User creates onramp request
2. User sends fiat payment to your account
3. Verify payment received
4. Approve request:
   ```javascript
   await contract.approveOnRampRequest(requestId, "Payment verified");
   ```
5. Tokens are automatically sent to user

### Approve OffRamp Request

1. User creates offramp request (tokens are locked)
2. Verify request details
3. Send cash to user's payment details
4. Approve request:
   ```javascript
   await contract.approveOffRampRequest(requestId, "Cash sent to bank account");
   ```
5. Tokens are sent to treasury wallet

### Reject Request

```javascript
await contract.rejectRequest(requestId, "Reason for rejection");
// For offramp, tokens are automatically refunded
```

## User Operations

### Create OnRamp Request

1. Connect wallet
2. Navigate to Buy/Sell tab
3. Select "Buy Tokens (OnRamp)"
4. Fill in:
   - Token amount
   - Wallet address (or use connected wallet)
   - Currency
   - Payment method
   - Your payment details (where you'll send money)
   - Notes (optional)
5. Submit request
6. Send fiat payment to the payment details shown
7. Wait for admin approval

### Create OffRamp Request

1. Connect wallet
2. Navigate to Buy/Sell tab
3. Select "Sell Tokens (OffRamp)"
4. Fill in:
   - Token amount (tokens will be locked)
   - Currency
   - Payment method
   - Where to receive cash
   - Notes (optional)
5. Submit request (approve token transfer if needed)
6. Wait for admin approval
7. Receive cash after approval

### Cancel Request

Users can cancel their own pending requests:
- Click "Cancel Request" on any pending request
- For offramp, tokens are automatically refunded

## Security Considerations

1. **Treasury Wallet**: Use a secure wallet for receiving tokens
2. **Payment Verification**: Always verify payments before approving requests
3. **Rate Limits**: Set appropriate min/max limits to prevent abuse
4. **Fees**: Configure fees to cover operational costs
5. **Emergency Withdraw**: Owner can withdraw tokens in emergency (use carefully)

## Monitoring

### View User Requests

```javascript
// Get all requests for a user
const requestIds = await contract.getUserRequests(userAddress);

// Get request details
const request = await contract.getRequest(requestId);
```

### Events

Listen to contract events:
- `RequestCreated`: New request created
- `RequestStatusChanged`: Request status updated
- `OnRampCompleted`: Onramp request completed
- `OffRampCompleted`: Offramp request completed

## Troubleshooting

### Contract not initializing
- Check contract address is correct
- Ensure you're on the correct network
- Verify contract is deployed

### Token transfer failing
- Check user has approved tokens (for offramp)
- Verify contract has token balance (for onramp)
- Check token contract address is correct

### Request not showing
- Refresh the page
- Check user's wallet is connected
- Verify request was created successfully

## Best Practices

1. **Payment Verification**: Always verify payments before approving
2. **Communication**: Keep users informed about request status
3. **Documentation**: Maintain records of all transactions
4. **Security**: Use multi-sig wallet for treasury
5. **Monitoring**: Regularly check contract balance and requests
6. **Support**: Provide clear instructions for users

## Example Workflow

### OnRamp Example
1. Alice wants to buy 100 TST tokens
2. Alice creates onramp request with her wallet address
3. System shows: "Send $100 to Bank: ABC, Account: 123456"
4. Alice sends $100 to the bank account
5. Admin verifies payment and approves request
6. Alice receives 98 TST (100 - 2% fee) to her wallet

### OffRamp Example
1. Bob wants to sell 50 TST tokens for cash
2. Bob creates offramp request with his bank details
3. 50 TST tokens are locked in the contract
4. Admin approves request
5. Admin sends $49 cash (50 - 2% fee) to Bob's bank account
6. 50 TST tokens are sent to treasury wallet

## Support

For issues or questions:
- Check contract events on block explorer
- Review transaction history
- Contact support with request ID


