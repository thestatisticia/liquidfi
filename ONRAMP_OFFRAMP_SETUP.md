# OnRamp & OffRamp Setup Guide

This guide explains how to set up the onramp and offramp features for buying and selling TST tokens.

## Overview

The app integrates with three major payment providers:
- **Transak** - Buy and sell crypto with credit card, bank transfer, or Apple Pay
- **MoonPay** - Fast and secure crypto purchases with multiple payment methods
- **Ramp** - Instant crypto purchases with bank cards and open banking

## Setup Instructions

### 1. Transak Setup

1. Go to [Transak Dashboard](https://dashboard.transak.com/)
2. Sign up or log in
3. Create a new application
4. Get your API key from the dashboard
5. Update `src/components/OnRampOffRamp.jsx`:
   - Replace `YOUR_TRANSAK_API_KEY` with your actual API key (line ~50)

**Note:** For production, use environment variables instead of hardcoding API keys.

### 2. MoonPay Setup

1. Go to [MoonPay Dashboard](https://www.moonpay.com/business)
2. Sign up for a business account
3. Complete KYC/verification
4. Get your API key from the dashboard
5. Update `src/components/OnRampOffRamp.jsx`:
   - Replace `YOUR_MOONPAY_API_KEY` with your actual API key (line ~70)

### 3. Ramp Setup

1. Go to [Ramp Network](https://ramp.network/)
2. Sign up for a developer account
3. Create a new application
4. Get your API key from the dashboard
5. Update `src/components/OnRampOffRamp.jsx`:
   - Replace `YOUR_RAMP_API_KEY` with your actual API key (line ~90)

## Environment Variables (Recommended)

For better security, use environment variables:

1. Create a `.env` file in the root directory:
```env
VITE_TRANSAK_API_KEY=your_transak_key_here
VITE_MOONPAY_API_KEY=your_moonpay_key_here
VITE_RAMP_API_KEY=your_ramp_key_here
```

2. Update `src/components/OnRampOffRamp.jsx` to use environment variables:
```javascript
transakUrl.searchParams.set('apiKey', import.meta.env.VITE_TRANSAK_API_KEY);
moonPayUrl.searchParams.set('apiKey', import.meta.env.VITE_MOONPAY_API_KEY);
rampUrl.searchParams.set('hostApiKey', import.meta.env.VITE_RAMP_API_KEY);
```

## Token Configuration

Make sure your token is properly configured in the providers:

1. **Token Symbol**: Currently set to `TST` - update if different
2. **Token Address**: Automatically detected from `src/config/tokens.js`
3. **Network**: Automatically detected based on connected chain

## Supported Networks

The component automatically detects the network:
- Ethereum Mainnet (Chain ID: 1)
- Ethereum Sepolia Testnet (Chain ID: 11155111)
- Base Mainnet (Chain ID: 8453)
- Base Sepolia (Chain ID: 84532)

## Testing

1. Connect your wallet
2. Navigate to the "Buy/Sell" tab
3. Select a provider
4. Complete the purchase/sale flow

## Important Notes

- Each provider has different KYC requirements
- Transaction fees vary by provider (2.5% - 5%)
- Minimum purchase amounts vary ($10 - $20)
- Some providers may not support all countries
- Testnet tokens may not be available on all providers

## Troubleshooting

### Widget doesn't open
- Check that API keys are correctly set
- Verify wallet is connected
- Check browser console for errors

### Token not found
- Verify token address is correct
- Check if token is listed on the provider
- Contact provider support for token listing

### Network issues
- Ensure you're on a supported network
- Check provider's network support
- Try switching networks

## Support

For provider-specific issues:
- Transak: [support@transak.com](mailto:support@transak.com)
- MoonPay: [support@moonpay.com](mailto:support@moonpay.com)
- Ramp: [support@ramp.network](mailto:support@ramp.network)


