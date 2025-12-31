import { useState, useEffect } from 'react';
import { useToken } from '../hooks/useToken';
import { getActiveTokenConfig } from '../config/tokens';
import CustomOnRampOffRamp from './CustomOnRampOffRamp';
import './OnRampOffRamp.css';

function OnRampOffRamp() {
  const { account, balance, isConnected, connectWallet, chainId } = useToken();
  const [activeMode, setActiveMode] = useState('buy'); // 'buy' or 'sell'
  const [selectedProvider, setSelectedProvider] = useState('transak'); // 'transak', 'moonpay', 'ramp'
  const [showWidget, setShowWidget] = useState(false);

  const tokenConfig = getActiveTokenConfig();

  // Get network name for providers
  const getNetworkName = () => {
    if (!chainId) return 'ethereum';
    // Ethereum Mainnet
    if (chainId === 1) return 'ethereum';
    // Sepolia Testnet
    if (chainId === 11155111) return 'sepolia';
    // Base Mainnet
    if (chainId === 8453) return 'base';
    // Base Sepolia
    if (chainId === 84532) return 'base-sepolia';
    return 'ethereum';
  };

  // Get token address
  const getTokenAddress = () => {
    return tokenConfig?.contractAddress || '';
  };

  // Transak Configuration
  const openTransak = (mode) => {
    if (!account) {
      alert('Please connect your wallet first');
      return;
    }

    const networkName = getNetworkName();
    const tokenAddress = getTokenAddress();
    
    // Transak widget URL
    const transakUrl = new URL('https://global.transak.com');
    transakUrl.searchParams.set('apiKey', 'YOUR_TRANSAK_API_KEY'); // You'll need to get this from Transak
    transakUrl.searchParams.set('network', networkName);
    transakUrl.searchParams.set('cryptoCurrencyCode', 'TST'); // Your token symbol
    transakUrl.searchParams.set('walletAddress', account);
    transakUrl.searchParams.set('themeColor', '2196F3');
    transakUrl.searchParams.set('hideMenu', 'false');
    
    if (mode === 'sell') {
      transakUrl.searchParams.set('isBuyOrSell', 'sell');
    } else {
      transakUrl.searchParams.set('isBuyOrSell', 'buy');
    }

    // Open in new window or iframe
    window.open(transakUrl.toString(), 'Transak', 'width=500,height=700');
  };

  // MoonPay Configuration
  const openMoonPay = (mode) => {
    if (!account) {
      alert('Please connect your wallet first');
      return;
    }

    const networkName = getNetworkName();
    const tokenAddress = getTokenAddress();
    
    // MoonPay widget URL
    const moonPayUrl = new URL('https://buy.moonpay.com');
    moonPayUrl.searchParams.set('apiKey', 'YOUR_MOONPAY_API_KEY'); // You'll need to get this from MoonPay
    moonPayUrl.searchParams.set('currencyCode', 'tst'); // Your token symbol (lowercase)
    moonPayUrl.searchParams.set('walletAddress', account);
    moonPayUrl.searchParams.set('colorCode', '%232196F3');
    
    if (mode === 'sell') {
      moonPayUrl.searchParams.set('defaultCurrencyCode', 'tst');
    }

    window.open(moonPayUrl.toString(), 'MoonPay', 'width=500,height=700');
  };

  // Ramp Configuration
  const openRamp = (mode) => {
    if (!account) {
      alert('Please connect your wallet first');
      return;
    }

    const networkName = getNetworkName();
    const tokenAddress = getTokenAddress();
    
    // Ramp widget URL
    const rampUrl = new URL('https://buy.ramp.network');
    rampUrl.searchParams.set('hostApiKey', 'YOUR_RAMP_API_KEY'); // You'll need to get this from Ramp
    rampUrl.searchParams.set('hostAppName', 'StreamFi');
    rampUrl.searchParams.set('userAddress', account);
    rampUrl.searchParams.set('swapAsset', 'TST'); // Your token symbol
    rampUrl.searchParams.set('variant', 'hosted-auto');
    
    if (mode === 'sell') {
      rampUrl.searchParams.set('swapAmount', '');
      rampUrl.searchParams.set('fiatCurrency', 'USD');
    }

    window.open(rampUrl.toString(), 'Ramp', 'width=500,height=700');
  };

  const handleProviderClick = (provider, mode) => {
    setSelectedProvider(provider);
    setActiveMode(mode);
    
    switch (provider) {
      case 'transak':
        openTransak(mode);
        break;
      case 'moonpay':
        openMoonPay(mode);
        break;
      case 'ramp':
        openRamp(mode);
        break;
      default:
        break;
    }
  };

  // Provider configurations
  const providers = {
    transak: {
      name: 'Transak',
      logo: '🔄',
      description: 'Buy and sell crypto with credit card, bank transfer, or Apple Pay',
      supportsBuy: true,
      supportsSell: true,
      fees: '2.5% - 5%',
      minAmount: '$10',
      countries: '150+ countries'
    },
    moonpay: {
      name: 'MoonPay',
      logo: '🌙',
      description: 'Fast and secure crypto purchases with multiple payment methods',
      supportsBuy: true,
      supportsSell: true,
      fees: '3.5% - 4.5%',
      minAmount: '$20',
      countries: '160+ countries'
    },
    ramp: {
      name: 'Ramp',
      logo: '🚀',
      description: 'Instant crypto purchases with bank cards and open banking',
      supportsBuy: true,
      supportsSell: true,
      fees: '2.5% - 4%',
      minAmount: '$15',
      countries: '100+ countries'
    }
  };

  // Use custom onramp/offramp instead of third-party providers
  // Wallet connection is handled inside CustomOnRampOffRamp component
  return (
    <div className="onramp-offramp-container">
      <CustomOnRampOffRamp />
    </div>
  );
}

export default OnRampOffRamp;

