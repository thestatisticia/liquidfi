// Token Configuration for Automatic Payment System
// TST (Test Stablecoin) on Ethereum Sepolia Testnet

export const TOKEN_CONFIG = {
  testStablecoin: {
    contractAddress: '0xd93950A7Ef6153E49A8E08818cbED3b854ed3217', // Deployed on Ethereum Sepolia
    chainId: 11155111, // Ethereum Sepolia Testnet
    decimals: 18,
    symbol: 'TST',
    name: 'Test Stablecoin',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', // Public Ethereum Sepolia RPC
    explorerUrl: 'https://sepolia.etherscan.io',
    networkName: 'Ethereum Sepolia Testnet',
    isTestnet: true
  }
}

// OnRampOffRamp contract address
// Deployed on Ethereum Sepolia: 0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9
// Can be overridden via VITE_ONRAMP_OFFRAMP_CONTRACT environment variable
export const getOnRampOffRampContractAddress = () => {
  return import.meta.env.VITE_ONRAMP_OFFRAMP_CONTRACT || '0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9';
}

// Get active token config
export const getActiveTokenConfig = () => {
  return TOKEN_CONFIG.testStablecoin
}

// ERC-20 ABI (includes mint for Test Stablecoin)
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)', // For Test Stablecoin
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
]

