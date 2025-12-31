import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToken } from '../hooks/useToken';
import { getActiveTokenConfig, ERC20_ABI, getOnRampOffRampContractAddress } from '../config/tokens';
import './CustomOnRampOffRamp.css';

// Contract ABI
const ONRAMP_OFFRAMP_ABI = [
  'function createOnRampRequest(uint256 tokenAmount, string currency, string paymentMethod, string paymentDetailsUser, address walletAddress, string notes) external returns (uint256)',
  'function createOffRampRequest(uint256 tokenAmount, string currency, string paymentMethod, string paymentDetailsUser, string notes) external returns (uint256)',
  'function approveOnRampRequest(uint256 requestId, string adminNotes) external',
  'function approveOffRampRequest(uint256 requestId, string adminNotes) external',
  'function rejectRequest(uint256 requestId, string adminNotes) external',
  'function cancelRequest(uint256 requestId) external',
  'function getUserRequests(address user) external view returns (uint256[])',
  'function getRequest(uint256 requestId) external view returns (tuple(uint256 id, address user, uint8 requestType, uint8 status, uint256 amount, uint256 fiatAmount, string currency, string paymentMethod, string paymentDetails, address walletAddress, string userNotes, string adminNotes, uint256 createdAt, uint256 updatedAt))',
  'function requestCount() external view returns (uint256)',
  'function paymentDetails() external view returns (string)',
  'function exchangeRate() external view returns (uint256)',
  'function calculateFiatAmount(uint256 tokenAmount) external view returns (uint256)',
  'function calculateTokenAmount(uint256 fiatAmountCents) external view returns (uint256)',
  'function minOnRampAmount() external view returns (uint256)',
  'function maxOnRampAmount() external view returns (uint256)',
  'function minOffRampAmount() external view returns (uint256)',
  'function maxOffRampAmount() external view returns (uint256)',
  'function onRampFeePercent() external view returns (uint256)',
  'function offRampFeePercent() external view returns (uint256)',
  'function owner() external view returns (address)',
  'event RequestCreated(uint256 indexed requestId, address indexed user, uint8 requestType, uint256 amount, uint256 fiatAmount)',
  'event RequestStatusChanged(uint256 indexed requestId, uint8 oldStatus, uint8 newStatus, string adminNotes)'
];

// Treasury wallet address for onramp/offramp
const TREASURY_WALLET = '0x12214E5538915d17394f2d2F0c3733e9a32e61c1';

function CustomOnRampOffRamp() {
  const { account, balance, isConnected, connectWallet, provider } = useToken();
  const [contract, setContract] = useState(null);
  const [contractAddress, setContractAddress] = useState('');
  const [activeMode, setActiveMode] = useState('buy'); // 'buy' or 'sell'
  
  // Form state
  const [tokenAmount, setTokenAmount] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money');
  const [paymentDetails, setPaymentDetails] = useState(''); // User's phone number
  const [walletAddress, setWalletAddress] = useState('');
  
  // Default payment recipient (where users send money TO for onramp)
  const DEFAULT_PAYMENT_RECIPIENT = '+256786430457';
  
  // Contract info
  const [contractInfo, setContractInfo] = useState(null);
  const [userRequests, setUserRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [calculatedFiat, setCalculatedFiat] = useState(0);
  const [showQuote, setShowQuote] = useState(false);
  const [quoteData, setQuoteData] = useState(null);

  // Currency conversion rates
  const CURRENCY_RATES = {
    USD: 1,
    UGX: 3500, // 1 USD = 3500 UGX
    KES: 128   // 1 USD = 128 KES
  };

  // Initialize contract address from config or env
  useEffect(() => {
    const defaultContractAddress = getOnRampOffRampContractAddress();
    if (defaultContractAddress) {
      setContractAddress(defaultContractAddress);
    }
  }, []);

  useEffect(() => {
    // Initialize contract if we have contract address and provider
    // Re-initialize when wallet connects/disconnects to ensure correct provider
    if (contractAddress && provider) {
      initializeContract();
    } else if (contractAddress && !provider) {
      // If we have address but no provider, try to initialize with read-only provider
      initializeContract();
    }
  }, [isConnected, account, provider, contractAddress]);

  useEffect(() => {
    if (contract) {
      loadContractInfo();
      if (account) {
      loadUserRequests();
      }
    }
  }, [contract, account]);

  useEffect(() => {
    if (tokenAmount && contract) {
      calculateFiatAmount(tokenAmount).then(setCalculatedFiat);
    } else {
      setCalculatedFiat(0);
    }
  }, [tokenAmount, contract]);

  const initializeContract = async () => {
    try {
      if (!contractAddress) return;
      
      let contractInstance;
      
      // Always try to use signer if wallet is connected, otherwise use read-only provider
      if (isConnected && account && provider) {
        try {
      const signer = await provider.getSigner();
          contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);
        } catch (err) {
          console.warn('Could not get signer, using read-only provider:', err);
          // Fallback to read-only provider
          const tokenConfig = getActiveTokenConfig();
          const providerInstance = new ethers.JsonRpcProvider(tokenConfig.rpcUrl);
          contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, providerInstance);
        }
      } else {
        // Create read-only provider from RPC URL for viewing contract info
        const tokenConfig = getActiveTokenConfig();
        const providerInstance = new ethers.JsonRpcProvider(tokenConfig.rpcUrl);
        contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, providerInstance);
      }
      setContract(contractInstance);
      setError(''); // Clear any previous errors
    } catch (err) {
      console.error('Error initializing contract:', err);
      const errorMsg = err.message || err.toString() || 'Unknown error';
      // Ignore filter errors - they're harmless and come from ethers.js internal polling
      if (errorMsg.includes('filter not found') || errorMsg.includes('eth_getFilterChanges')) {
        console.warn('Filter error (can be ignored):', errorMsg);
        // Still try to set contract if we can
        if (contractAddress) {
          try {
            const tokenConfig = getActiveTokenConfig();
            const providerInstance = new ethers.JsonRpcProvider(tokenConfig.rpcUrl);
            const contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, providerInstance);
            setContract(contractInstance);
          } catch (fallbackErr) {
            console.error('Fallback initialization also failed:', fallbackErr);
          }
        }
      } else {
        setError(`Failed to initialize contract: ${errorMsg}`);
      }
    }
  };


  const loadContractInfo = async () => {
    try {
      if (!contract) return;
      const [paymentDetails, exchangeRate, minOnRamp, maxOnRamp, minOffRamp, maxOffRamp, onRampFee, offRampFee] = await Promise.all([
        contract.paymentDetails(),
        contract.exchangeRate(),
        contract.minOnRampAmount(),
        contract.maxOnRampAmount(),
        contract.minOffRampAmount(),
        contract.maxOffRampAmount(),
        contract.onRampFeePercent(),
        contract.offRampFeePercent()
      ]);

      setContractInfo({
        paymentDetails,
        exchangeRate: Number(exchangeRate),
        minOnRamp: ethers.formatEther(minOnRamp),
        maxOnRamp: ethers.formatEther(maxOnRamp),
        minOffRamp: ethers.formatEther(minOffRamp),
        maxOffRamp: ethers.formatEther(maxOffRamp),
        onRampFee: Number(onRampFee) / 100,
        offRampFee: Number(offRampFee) / 100
      });
    } catch (err) {
      console.error('Error loading contract info:', err);
      // Don't show error for read-only operations if wallet not connected
      if (isConnected) {
        setError('Failed to load contract information.');
      }
    }
  };

  const loadUserRequests = async () => {
    try {
      if (!contract || !account) return;
      const requestIds = await contract.getUserRequests(account);
      const requests = await Promise.all(
        requestIds.map(async (id) => {
          const request = await contract.getRequest(id);
            // Contract: fiatAmount = (tokenAmount * 1e6) / exchangeRate
            // For 1 token (1e18 wei) with exchangeRate 1000000: (1e18 * 1e6) / 1000000 = 1e18
            // This should represent $1 = 100 cents
            // So: 1e18 units = 100 cents, meaning divide by 1e16 to get cents, then by 100 for dollars
            // For 10 tokens: 10e18 / 1e16 = 1000 cents = $10 ✓
            const fiatAmountStr = request.fiatAmount.toString();
            const fiatAmountCents = parseFloat(fiatAmountStr) / 1e16; // Convert to cents
            const fiatAmountDollars = fiatAmountCents / 100; // Convert to dollars
            
            return {
              id: Number(id),
              user: request.user,
              requestType: Number(request.requestType), // 0 = OnRamp, 1 = OffRamp
              status: Number(request.status), // 0 = Pending, 1 = Approved, 2 = Rejected, 3 = Completed, 4 = Cancelled
              amount: ethers.formatEther(request.amount),
              fiatAmount: fiatAmountDollars, // Now in USD dollars
              currency: request.currency,
              paymentMethod: request.paymentMethod,
              paymentDetails: request.paymentDetails,
              walletAddress: request.walletAddress,
              userNotes: request.userNotes,
              adminNotes: request.adminNotes,
              createdAt: Number(request.createdAt),
              updatedAt: Number(request.updatedAt)
            };
        })
      );
      setUserRequests(requests.sort((a, b) => b.id - a.id));
    } catch (err) {
      console.error('Error loading user requests:', err);
    }
  };

  const calculateFiatAmount = async (tokenAmt) => {
    if (!contract || !tokenAmt) return 0;
    try {
      const tokenAmtNum = parseFloat(tokenAmt);
      if (!contractInfo || !contractInfo.exchangeRate) return 0;
      const exchangeRate = contractInfo.exchangeRate;
      // exchangeRate is in 1e6 scale, so 1000000 = $1 per token
      // Formula: USD = tokenAmount * (1e6 / exchangeRate)
      const usdAmount = tokenAmtNum * (1e6 / exchangeRate);
      return usdAmount;
    } catch (err) {
      console.error('Error calculating fiat amount:', err);
      return 0;
    }
  };

  const handleOnRampRequest = async (e) => {
    e.preventDefault();
    if (!isConnected || !account) {
      setError('Please connect your wallet');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not set. Please configure the contract address.');
      return;
    }

    // Check if provider is available, if not try to get it from window.ethereum
    let currentProvider = provider;
    if (!currentProvider && typeof window !== 'undefined' && window.ethereum) {
      try {
        currentProvider = new ethers.BrowserProvider(window.ethereum);
        console.log('Created provider from window.ethereum');
      } catch (err) {
        console.error('Failed to create provider:', err);
      }
    }

    if (!currentProvider) {
      setError('Wallet provider not available. Please ensure MetaMask is connected and unlocked.');
      return;
    }

    // Ensure contract is initialized
    if (!contract) {
      setError('Contract not initialized. Please wait a moment and try again.');
      await initializeContract();
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('Getting signer...');
      const signer = await currentProvider.getSigner();
      if (!signer) {
        throw new Error('Failed to get signer. Please ensure MetaMask is unlocked.');
      }
      console.log('Signer obtained:', await signer.getAddress());

      // Create contract instance with signer - this will trigger MetaMask
      const contractWithSigner = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);

      const amount = ethers.parseEther(tokenAmount);
      const walletAddr = walletAddress || account; // Use connected wallet if not specified

      console.log('Calling createOnRampRequest - this should trigger MetaMask...');
      // Include both user's phone number and recipient number in payment details
      const fullPaymentDetails = `From: ${paymentDetails}, Send to: ${DEFAULT_PAYMENT_RECIPIENT}`;
      // This will trigger MetaMask popup
      const tx = await contractWithSigner.createOnRampRequest(
        amount,
        currency,
        paymentMethod,
        fullPaymentDetails,
        walletAddr,
        '' // No notes
      );
      console.log('Transaction sent:', tx.hash);

      setSuccess('Transaction submitted! Waiting for confirmation...');
      await tx.wait();
      setSuccess('OnRamp request created successfully! Please send the payment to the provided details.');
      resetForm();
      await loadUserRequests();
    } catch (err) {
      console.error('Error creating onramp request:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
      setError(err.reason || err.message || 'Failed to create onramp request');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOffRampRequest = async (e) => {
    e.preventDefault();
    if (!isConnected || !account) {
      setError('Please connect your wallet');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not set. Please configure the contract address.');
      return;
    }

    // Check if provider is available, if not try to get it from window.ethereum
    let currentProvider = provider;
    if (!currentProvider && typeof window !== 'undefined' && window.ethereum) {
      try {
        currentProvider = new ethers.BrowserProvider(window.ethereum);
        console.log('Created provider from window.ethereum for offramp');
      } catch (err) {
        console.error('Failed to create provider:', err);
      }
    }

    if (!currentProvider) {
      setError('Wallet provider not available. Please ensure MetaMask is connected and unlocked.');
      return;
    }

    // Ensure contract is initialized
    if (!contract) {
      setError('Contract not initialized. Please wait a moment and try again.');
      await initializeContract();
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('Getting signer for offramp...');
      const signer = await currentProvider.getSigner();
      if (!signer) {
        throw new Error('Failed to get signer. Please ensure MetaMask is unlocked.');
      }
      console.log('Signer obtained:', await signer.getAddress());

      // Create contract instance with signer - this will trigger MetaMask
      const contractWithSigner = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);

      // For offramp, user needs to send tokens to treasury wallet first
      // Then create the request
      const tokenConfig = getActiveTokenConfig();
      const tokenContract = new ethers.Contract(
        tokenConfig.contractAddress,
        ERC20_ABI,
        signer
      );

      const amount = ethers.parseEther(tokenAmount);
      
      // Check if user has enough balance
      const balance = await tokenContract.balanceOf(account);
      if (balance < amount) {
        throw new Error('Insufficient token balance');
      }

      // Step 1: Transfer tokens to treasury wallet first
      setSuccess('Sending tokens to treasury wallet...');
      console.log('Transferring tokens - this should trigger MetaMask...');
      const transferTx = await tokenContract.transfer(TREASURY_WALLET, amount);
      console.log('Transfer transaction sent:', transferTx.hash);
      await transferTx.wait();

      // Step 2: Create offramp request (tokens already sent to treasury)
      setSuccess('Creating offramp request...');
      console.log('Creating offramp request - this should trigger MetaMask...');
      const tx = await contractWithSigner.createOffRampRequest(
        amount,
        currency,
        paymentMethod,
        paymentDetails,
        '' // No notes field
      );

      await tx.wait();
      setSuccess(`✅ OffRamp request created! ${parseFloat(tokenAmount).toFixed(4)} TST sent to treasury wallet (${TREASURY_WALLET.slice(0, 6)}...${TREASURY_WALLET.slice(-4)}). You will receive ${currency} payment after admin approval.`);
      resetForm();
      await loadUserRequests();
    } catch (err) {
      console.error('Error creating offramp request:', err);
      setError(err.reason || err.message || 'Failed to create offramp request');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTokenAmount('');
    setCurrency('UGX');
    setPaymentMethod('Mobile Money');
    setPaymentDetails(''); // User's phone number
    setWalletAddress('');
  };

  const getStatusLabel = (status) => {
    const statuses = ['Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'];
    return statuses[status] || 'Unknown';
  };

  const getStatusColor = (status) => {
    const colors = {
      0: '#FFC107', // Pending - Yellow
      1: '#4CAF50', // Approved - Green
      2: '#F44336', // Rejected - Red
      3: '#2196F3', // Completed - Blue
      4: '#9E9E9E'  // Cancelled - Grey
    };
    return colors[status] || '#000';
  };

  if (!contractAddress) {
    return (
      <div className="custom-onramp-container">
        <div className="config-prompt">
          <h2>Contract Not Configured</h2>
          <p>Please set the OnRampOffRamp contract address to use this feature.</p>
          <p className="config-hint">
            You can set it via environment variable <code>VITE_ONRAMP_OFFRAMP_CONTRACT</code> or enter it below:
          </p>
          <input
            type="text"
            placeholder="0x..."
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="contract-input"
          />
          <button 
            onClick={() => {
              if (contractAddress && contractAddress.startsWith('0x') && contractAddress.length === 42) {
                initializeContract();
              } else {
                setError('Please enter a valid contract address (0x followed by 40 hex characters)');
              }
            }} 
            className="action-btn"
            disabled={!contractAddress}
          >
            Initialize Contract
          </button>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  // Check if all required fields are filled
  const isFormComplete = () => {
    if (!tokenAmount || !paymentDetails || !currency || !paymentMethod) {
      return false;
    }
    if (activeMode === 'buy' && !isConnected && !walletAddress) {
      return false;
    }
    return true;
  };

  // Calculate quote
  const calculateQuote = async () => {
    if (!tokenAmount || !contractInfo) {
      setError('Please enter a token amount');
      return;
    }

    try {
      const tokenAmt = parseFloat(tokenAmount);
      if (isNaN(tokenAmt) || tokenAmt <= 0) {
        setError('Please enter a valid token amount');
        return;
      }

      // Recalculate fiat amount to ensure it's up to date
      let baseUsdAmount = calculatedFiat;
      if (!baseUsdAmount || baseUsdAmount === 0) {
        baseUsdAmount = await calculateFiatAmount(tokenAmount);
      }
      
      if (!baseUsdAmount || baseUsdAmount === 0) {
        setError('Failed to calculate base amount. Please check your token amount.');
        return;
      }

      // Apply fees
      const feePercent = activeMode === 'buy' ? contractInfo.onRampFee : contractInfo.offRampFee;
      const feeAmount = (baseUsdAmount * feePercent) / 100;
      const totalUsdAmount = activeMode === 'buy' 
        ? baseUsdAmount + feeAmount  // For buy: user pays more
        : baseUsdAmount - feeAmount; // For sell: user receives less

      // Convert to selected currency
      const rate = CURRENCY_RATES[currency] || 1;
      const totalAmount = totalUsdAmount * rate;

      setQuoteData({
        tokenAmount: tokenAmt,
        baseUsdAmount,
        feeAmount,
        totalUsdAmount,
        currency,
        totalAmount,
        feePercent,
        mode: activeMode
      });
      setShowQuote(true);
      setError(''); // Clear any errors
    } catch (err) {
      setError('Failed to calculate quote: ' + err.message);
      console.error('Quote calculation error:', err);
    }
  };

  return (
    <div className="custom-onramp-container">
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}


      {/* Mode Selector */}
      <div className="mode-selector">
        <button
          className={`mode-btn ${activeMode === 'buy' ? 'active' : ''}`}
          onClick={() => setActiveMode('buy')}
        >
          💳 Buy Tokens
        </button>
        <button
          className={`mode-btn ${activeMode === 'sell' ? 'active' : ''}`}
          onClick={() => setActiveMode('sell')}
        >
          💰 Sell Tokens
        </button>
      </div>

      {/* Request Form */}
      <div className="request-form-section">
        <h2 style={{ fontSize: '32px', marginBottom: '35px', marginTop: 0, fontWeight: '700', color: 'var(--text-primary, #ffffff)' }}>{activeMode === 'buy' ? 'Buy Tokens (OnRamp)' : 'Sell Tokens (OffRamp)'}</h2>
        <form onSubmit={activeMode === 'buy' ? handleOnRampRequest : handleOffRampRequest} style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          {/* First Row: Token Amount and Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>Token Amount (TST)</label>
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder={`Min: ${contractInfo?.minOnRamp || '10'}`}
                step="0.01"
                min={contractInfo?.minOnRamp || '10'}
                max={contractInfo?.maxOnRamp || '100000'}
                required
                style={{ 
                  padding: '16px 20px', 
                  fontSize: '18px', 
                  height: '56px',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'var(--bg-input, #0f1429)',
                  color: 'var(--text-primary, #ffffff)',
                  fontFamily: 'inherit',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6366f1';
                  e.target.style.backgroundColor = 'var(--bg-card, #151b33)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.backgroundColor = 'var(--bg-input, #0f1429)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>Currency</label>
              <select 
                value={currency} 
                onChange={(e) => setCurrency(e.target.value)} 
                required
                style={{ 
                  padding: '16px 20px', 
                  fontSize: '18px', 
                  height: '56px',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'var(--bg-input, #0f1429)',
                  color: 'var(--text-primary, #ffffff)',
                  fontFamily: 'inherit',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  outline: 'none',
                  cursor: 'pointer'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6366f1';
                  e.target.style.backgroundColor = 'var(--bg-card, #151b33)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.backgroundColor = 'var(--bg-input, #0f1429)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <option value="USD">USD ($)</option>
                <option value="UGX">UGX (USh)</option>
                <option value="KES">KES (KSh)</option>
              </select>
            </div>
          </div>

          {/* Second Row: Payment Method and Wallet Address (if buy) */}
          <div style={{ display: 'grid', gridTemplateColumns: activeMode === 'buy' ? '1fr 1fr' : '1fr', gap: '25px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>Payment Method</label>
              <select 
                value={paymentMethod} 
                onChange={(e) => setPaymentMethod(e.target.value)} 
                required
                style={{ 
                  padding: '16px 20px', 
                  fontSize: '18px', 
                  height: '56px',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  transition: 'all 0.3s ease',
                  backgroundColor: 'var(--bg-input, #0f1429)',
                  color: 'var(--text-primary, #ffffff)',
                  fontFamily: 'inherit',
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  outline: 'none',
                  cursor: 'pointer'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6366f1';
                  e.target.style.backgroundColor = 'var(--bg-card, #151b33)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.backgroundColor = 'var(--bg-input, #0f1429)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Cash App">Cash App</option>
                <option value="PayPal">PayPal</option>
                <option value="Venmo">Venmo</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {activeMode === 'buy' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>Wallet (Optional)</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder={account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Enter wallet address'}
                  disabled={!isConnected}
                  style={{ 
                    padding: '16px 20px', 
                    fontSize: '18px', 
                    height: '56px',
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    transition: 'all 0.3s ease',
                    backgroundColor: !isConnected ? 'rgba(15, 20, 41, 0.5)' : 'var(--bg-input, #0f1429)',
                    color: 'var(--text-primary, #ffffff)',
                    fontFamily: 'inherit',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    outline: 'none',
                    opacity: !isConnected ? 0.6 : 1
                  }}
                  onFocus={(e) => {
                    if (!e.target.disabled) {
                      e.target.style.borderColor = '#6366f1';
                      e.target.style.backgroundColor = 'var(--bg-card, #151b33)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.target.style.backgroundColor = !isConnected ? 'rgba(15, 20, 41, 0.5)' : 'var(--bg-input, #0f1429)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {isConnected && account && (
                  <small style={{ fontSize: '15px', color: 'var(--text-secondary, #a8b3d0)', marginTop: '8px', display: 'block' }}>
                    Leave empty to use: {account.slice(0, 6)}...{account.slice(-4)}
                  </small>
                )}
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '18px', marginBottom: '12px', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>
              {activeMode === 'buy' ? 'Your Phone Number (Sending From)' : 'Your Phone Number (Receiving Cash)'}
            </label>
            <input
              type="text"
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder={activeMode === 'buy' 
                ? '+256XXXXXXXXX (Your number to send money from)' 
                : '+256XXXXXXXXX (Your number to receive cash)'}
              required
              style={{ 
                padding: '16px 20px', 
                fontSize: '18px', 
                height: '56px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                transition: 'border-color 0.3s ease',
                backgroundColor: '#ffffff',
                color: '#2c3e50',
                fontFamily: 'inherit',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2196F3'}
              onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
            />
            {activeMode === 'buy' && (
              <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '10px', fontSize: '16px', color: '#1976d2', fontWeight: '500', border: '1px solid #90caf9' }}>
                <strong>Send Mobile Money to:</strong> {DEFAULT_PAYMENT_RECIPIENT}
              </div>
            )}
            {activeMode === 'sell' && (
              <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '10px', fontSize: '16px', color: '#2e7d32', fontWeight: '500', border: '1px solid #81c784' }}>
                <strong>You will receive cash on this number</strong>
              </div>
            )}
          </div>


          {/* Get Quote Button - Only show when form is complete */}
          <div className="form-group" style={{ marginTop: '15px', marginBottom: '20px' }}>
            <button 
              type="button"
              onClick={calculateQuote}
              disabled={!isFormComplete() || !contractInfo}
              className="quote-btn"
              style={{ 
                padding: '18px 32px', 
                backgroundColor: isFormComplete() && contractInfo ? '#2196F3' : '#cccccc', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                cursor: isFormComplete() && contractInfo ? 'pointer' : 'not-allowed',
                fontSize: '20px',
                fontWeight: '700',
                width: '100%',
                opacity: isFormComplete() && contractInfo ? 1 : 0.6,
                boxShadow: isFormComplete() && contractInfo ? '0 4px 12px rgba(33, 150, 243, 0.3)' : 'none',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                if (isFormComplete() && contractInfo) {
                  e.target.style.backgroundColor = '#1976D2';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
                }
              }}
              onMouseOut={(e) => {
                if (isFormComplete() && contractInfo) {
                  e.target.style.backgroundColor = '#2196F3';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
                }
              }}
            >
              📊 Get Quote
            </button>
            {(!isFormComplete() || !contractInfo) && (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary, #a8b3d0)', fontSize: '15px', marginTop: '10px', marginBottom: 0 }}>
                {!contractInfo ? 'Loading contract info...' : 'Please fill all required fields'}
              </p>
            )}
          </div>

          {/* Quote Display - Below Get Quote Button */}
          {showQuote && quoteData && (
            <div className="quote-section" style={{ 
              marginBottom: '8px', 
              padding: '12px', 
              backgroundColor: '#ffffff', 
              borderRadius: '6px',
              border: '2px solid #4CAF50',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              position: 'relative'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '12px', color: 'var(--text-primary, #ffffff)', fontSize: '22px', fontWeight: 'bold' }}>Quote Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-input, #0f1429)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <strong style={{ color: 'var(--text-secondary, #a8b3d0)', fontSize: '14px' }}>Token:</strong> 
                  <div style={{ fontSize: '18px', color: 'var(--text-primary, #ffffff)', marginTop: '4px', fontWeight: 'bold' }}>{quoteData.tokenAmount.toFixed(4)} TST</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-input, #0f1429)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <strong style={{ color: 'var(--text-secondary, #a8b3d0)', fontSize: '14px' }}>Base:</strong> 
                  <div style={{ fontSize: '18px', color: 'var(--text-primary, #ffffff)', marginTop: '4px' }}>${quoteData.baseUsdAmount.toFixed(2)}</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-input, #0f1429)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <strong style={{ color: 'var(--text-secondary, #a8b3d0)', fontSize: '14px' }}>Fee ({quoteData.feePercent}%):</strong> 
                  <div style={{ fontSize: '18px', color: '#ef4444', marginTop: '4px' }}>${quoteData.feeAmount.toFixed(2)}</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: '8px', border: '2px solid #10b981' }}>
                  <strong style={{ color: 'var(--text-secondary, #a8b3d0)', fontSize: '14px' }}>Total:</strong> 
                  <div style={{ fontSize: '20px', color: '#10b981', marginTop: '4px', fontWeight: 'bold' }}>{quoteData.totalAmount.toFixed(2)} {quoteData.currency}</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', padding: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: '8px', border: '2px solid #10b981' }}>
                {quoteData.mode === 'buy' ? (
                  <p style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary, #ffffff)' }}>
                    <strong>Pay:</strong> <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{quoteData.totalAmount.toFixed(2)} {quoteData.currency}</span> → <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary, #ffffff)' }}>{quoteData.tokenAmount.toFixed(4)} TST</span>
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary, #ffffff)' }}>
                    <strong>Receive:</strong> <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{quoteData.totalAmount.toFixed(2)} {quoteData.currency}</span> for <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary, #ffffff)' }}>{quoteData.tokenAmount.toFixed(4)} TST</span>
                  </p>
                )}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                <button 
                  type="button"
                  onClick={() => setShowQuote(false)}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: '#6c757d', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    flex: 1
                  }}
                >
                  Close
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setShowQuote(false);
                    setTimeout(() => {
                      const submitBtn = document.querySelector('.submit-btn');
                      if (submitBtn) {
                        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        submitBtn.focus();
                      }
                    }, 100);
                  }}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: '#4CAF50', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    flex: 1
                  }}
                >
                  Proceed
                </button>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="submit-btn" 
            disabled={loading || !isConnected}
            style={{
              padding: '20px 32px',
              fontSize: '20px',
              marginTop: '20px',
              backgroundColor: loading || !isConnected ? '#cccccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: loading || !isConnected ? 'not-allowed' : 'pointer',
              fontWeight: '700',
              width: '100%',
              opacity: loading || !isConnected ? 0.6 : 1,
              transition: 'all 0.3s ease',
              boxShadow: loading || !isConnected ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.3)'
            }}
            onMouseOver={(e) => {
              if (!loading && isConnected) {
                e.target.style.backgroundColor = '#218838';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(40, 167, 69, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading && isConnected) {
                e.target.style.backgroundColor = '#28a745';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
              }
            }}
          >
            {loading ? '⏳ Processing...' : activeMode === 'buy' ? '✅ Create Buy Order' : '✅ Create Sell Order'}
          </button>
          {!isConnected && (
            <p className="connect-hint" style={{ color: '#FFC107', marginTop: '15px', fontSize: '16px', textAlign: 'center', fontWeight: '500' }}>
              💡 Connect your wallet to create orders
            </p>
          )}
        </form>
      </div>

      {/* User Requests */}
      <div className="requests-section">
        <h2>My Requests</h2>
        {userRequests.length === 0 ? (
          <p className="no-requests">No requests yet. Create your first request above.</p>
        ) : (
          <div className="requests-list">
            {userRequests.map((request) => (
              <div key={request.id} className="request-card">
                <div className="request-header">
                  <span className="request-id">Request #{request.id}</span>
                  <span 
                    className="request-status"
                    style={{ backgroundColor: getStatusColor(request.status) }}
                  >
                    {getStatusLabel(request.status)}
                  </span>
                </div>
                <div className="request-details">
                  <div className="detail-row">
                    <span className="detail-label">Type:</span>
                    <span className="detail-value">{request.requestType === 0 ? 'OnRamp (Buy)' : 'OffRamp (Sell)'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Amount:</span>
                    <span className="detail-value">{parseFloat(request.amount).toFixed(4)} TST</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Fiat Amount:</span>
                    <span className="detail-value">
                      {(() => {
                        // fiatAmount is in USD dollars, convert to selected currency
                        const usdAmount = request.fiatAmount;
                        const rate = CURRENCY_RATES[request.currency] || 1;
                        const convertedAmount = usdAmount * rate;
                        return `${convertedAmount.toFixed(2)} ${request.currency}`;
                      })()}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Payment Method:</span>
                    <span className="detail-value">{request.paymentMethod}</span>
                  </div>
                  {request.userNotes && (
                    <div className="detail-row">
                      <span className="detail-label">Your Notes:</span>
                      <span className="detail-value">{request.userNotes}</span>
                    </div>
                  )}
                  {request.adminNotes && (
                    <div className="detail-row">
                      <span className="detail-label">Admin Notes:</span>
                      <span className="detail-value">{request.adminNotes}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Created:</span>
                    <span className="detail-value">{new Date(request.createdAt * 1000).toLocaleString()}</span>
                  </div>
                </div>
                {request.status === 0 && (
                  <button
                    onClick={async () => {
                      if (!isConnected || !account) {
                        setError('Please connect your wallet to cancel requests');
                        return;
                      }
                      try {
                        setLoading(true);
                        setError('');
                        // Get signer for transaction - use fallback if provider not available
                        let currentProvider = provider;
                        if (!currentProvider && typeof window !== 'undefined' && window.ethereum) {
                          currentProvider = new ethers.BrowserProvider(window.ethereum);
                          console.log('Using window.ethereum provider for cancel');
                        }
                        if (!currentProvider) {
                          throw new Error('Wallet provider not available. Please ensure MetaMask is connected.');
                        }
                        const signer = await currentProvider.getSigner();
                        if (!signer) {
                          throw new Error('Failed to get signer. Please ensure MetaMask is unlocked.');
                        }
                        const contractWithSigner = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);
                        console.log('Cancelling request:', request.id);
                        const tx = await contractWithSigner.cancelRequest(request.id);
                        console.log('Cancel transaction sent:', tx.hash);
                        await tx.wait();
                        await loadUserRequests();
                        setSuccess('Request cancelled successfully');
                      } catch (err) {
                        console.error('Cancel error:', err);
                        if (err.code === 4001) {
                          setError('Transaction rejected by user');
                        } else {
                          setError(err.reason || err.message || 'Failed to cancel request');
                        }
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="cancel-btn"
                    disabled={loading || !isConnected}
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomOnRampOffRamp;

