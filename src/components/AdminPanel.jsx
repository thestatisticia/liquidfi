import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToken } from '../hooks/useToken';
import { getOnRampOffRampContractAddress, getActiveTokenConfig } from '../config/tokens';
import './CustomOnRampOffRamp.css';

// Contract ABI
const ONRAMP_OFFRAMP_ABI = [
  'function getRequest(uint256 requestId) external view returns (tuple(uint256 id, address user, uint8 requestType, uint8 status, uint256 amount, uint256 fiatAmount, string currency, string paymentMethod, string paymentDetails, address walletAddress, string userNotes, string adminNotes, uint256 createdAt, uint256 updatedAt))',
  'function requestCount() external view returns (uint256)',
  'function approveOnRampRequest(uint256 requestId, string adminNotes) external',
  'function approveOffRampRequest(uint256 requestId, string adminNotes) external',
  'function rejectRequest(uint256 requestId, string adminNotes) external',
  'function treasuryWallet() external view returns (address)',
  'function token() external view returns (address)',
  'function onRampFeePercent() external view returns (uint256)',
];

// ERC20 ABI for checking balances and allowances
const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const ADMIN_ADDRESS = '0x12214E5538915d17394f2d2F0c3733e9a32e61c1';

// Currency conversion rates
const CURRENCY_RATES = {
  USD: 1,
  UGX: 3500, // 1 USD = 3500 UGX
  KES: 128   // 1 USD = 128 KES
};

function AdminPanel() {
  const { account, isConnected, connectWallet, provider } = useToken();
  const [contract, setContract] = useState(null);
  const [contractAddress, setContractAddress] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isAdmin = account && account.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  // Initialize contract
  useEffect(() => {
    const defaultContractAddress = getOnRampOffRampContractAddress();
    if (defaultContractAddress) {
      setContractAddress(defaultContractAddress);
    }
  }, []);

  useEffect(() => {
    if (contractAddress) {
      initializeContract();
    }
  }, [contractAddress, provider, isConnected]);

  useEffect(() => {
    if (contract && isAdmin) {
      loadAllRequests();
      // Use polling instead of event listeners - refresh more frequently
      const interval = setInterval(() => {
        loadAllRequests();
      }, 3000); // Refresh every 3 seconds
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [contract, isAdmin]);

  // Also reload when contract changes
  useEffect(() => {
    if (contract && isAdmin) {
      loadAllRequests();
    }
  }, [contract]);

  const initializeContract = async () => {
    try {
      if (!contractAddress) {
        console.warn('Contract address not set');
        return;
      }
      
      let contractInstance;
      // Always try to use signer if connected, otherwise use read-only provider
      if (isConnected && account && provider) {
        try {
          const signer = await provider.getSigner();
          contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);
          console.log('Admin panel contract initialized with signer');
        } catch (err) {
          console.warn('Could not get signer, using read-only provider:', err);
          const tokenConfig = getActiveTokenConfig();
          const providerInstance = new ethers.JsonRpcProvider(tokenConfig.rpcUrl);
          contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, providerInstance);
          console.log('Admin panel contract initialized with read-only provider');
        }
      } else {
        // Use read-only provider if not connected
        const tokenConfig = getActiveTokenConfig();
        const providerInstance = new ethers.JsonRpcProvider(tokenConfig.rpcUrl);
        contractInstance = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, providerInstance);
        console.log('Admin panel contract initialized with read-only provider (not connected)');
      }
      setContract(contractInstance);
      setError(''); // Clear any errors
    } catch (err) {
      console.error('Error initializing contract:', err);
      setError(`Failed to initialize contract: ${err.message}`);
    }
  };

  const loadAllRequests = async () => {
    if (!contract) {
      console.warn('Contract not available for loading requests');
      return;
    }
    try {
      console.log('Loading all requests...');
      const count = await contract.requestCount();
      console.log('Request count:', Number(count));
      const requestIds = [];
      for (let i = 1; i <= Number(count); i++) {
        requestIds.push(i);
      }
      console.log('Request IDs to load:', requestIds);

      const allRequests = await Promise.all(
        requestIds.map(async (id) => {
          try {
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
              id: Number(request.id),
              user: request.user,
              requestType: Number(request.requestType),
              status: Number(request.status),
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
          } catch (err) {
            return null;
          }
        })
      );

      const validRequests = allRequests.filter(r => r !== null);
      setRequests(validRequests.sort((a, b) => b.id - a.id));
      
      const pending = validRequests.filter(r => r.status === 0).length;
      setPendingCount(pending);
    } catch (err) {
      console.error('Error loading requests:', err);
    }
  };

  const handleApprove = async (requestId, isOnRamp) => {
    if (!isConnected || !account) {
      setError('Please connect your wallet to approve requests');
      return;
    }

    // Get provider - use fallback if needed
    let currentProvider = provider;
    if (!currentProvider && typeof window !== 'undefined' && window.ethereum) {
      try {
        currentProvider = new ethers.BrowserProvider(window.ethereum);
        console.log('Created provider from window.ethereum for approve');
      } catch (err) {
        console.error('Failed to create provider:', err);
      }
    }

    if (!currentProvider) {
      setError('Wallet provider not available. Please ensure MetaMask is connected and unlocked.');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not set');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const signer = await currentProvider.getSigner();
      if (!signer) {
        throw new Error('Failed to get signer. Please ensure MetaMask is unlocked.');
      }
      const contractWithSigner = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);
      
      console.log(`Approving ${isOnRamp ? 'OnRamp' : 'OffRamp'} request ${requestId}...`);
      
      // For onramp requests, check treasury wallet balance and approval first
      if (isOnRamp) {
        try {
          // Get request details to calculate amount needed
          const request = await contractWithSigner.getRequest(requestId);
          const tokenAddress = await contractWithSigner.token();
          const treasuryAddress = await contractWithSigner.treasuryWallet();
          const feePercent = await contractWithSigner.onRampFeePercent();
          
          // Calculate amount to send (amount - fee)
          const fee = (request.amount * feePercent) / 10000n;
          const amountToSend = request.amount - fee;
          
          // Check treasury balance and allowance
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, currentProvider);
          const treasuryBalance = await tokenContract.balanceOf(treasuryAddress);
          const allowance = await tokenContract.allowance(treasuryAddress, contractAddress);
          
          console.log('Treasury balance:', ethers.formatEther(treasuryBalance));
          console.log('Treasury allowance:', ethers.formatEther(allowance));
          console.log('Amount needed:', ethers.formatEther(amountToSend));
          
          if (treasuryBalance < amountToSend) {
            throw new Error(`Treasury wallet has insufficient tokens. Required: ${ethers.formatEther(amountToSend)}, Available: ${ethers.formatEther(treasuryBalance)}`);
          }
          
          if (allowance < amountToSend) {
            throw new Error(`Treasury wallet has not approved enough tokens. Required: ${ethers.formatEther(amountToSend)}, Approved: ${ethers.formatEther(allowance)}. Please approve the contract from the treasury wallet.`);
          }
        } catch (checkError) {
          console.error('Pre-flight check failed:', checkError);
          if (checkError.message && (checkError.message.includes('insufficient') || checkError.message.includes('not approved'))) {
            throw checkError;
          }
          // If it's not a balance/allowance issue, continue with transaction attempt
        }
        
        const tx = await contractWithSigner.approveOnRampRequest(requestId, adminNotes || 'Funds received and tokens sent');
        console.log('Approve transaction sent:', tx.hash);
        await tx.wait();
      } else {
        const tx = await contractWithSigner.approveOffRampRequest(requestId, adminNotes || 'Funds sent to user');
        console.log('Approve transaction sent:', tx.hash);
        await tx.wait();
      }
      setSuccess('Request marked as complete successfully');
      setAdminNotes('');
      await loadAllRequests();
    } catch (err) {
      console.error('Approve error:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else if (err.message && (err.message.includes('insufficient') || err.message.includes('not approved') || err.message.includes('Token transfer failed'))) {
        setError(err.message);
      } else if (err.reason) {
        setError(`Contract error: ${err.reason}`);
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('Failed to approve request. This may be due to: 1) Treasury wallet insufficient balance, 2) Treasury wallet not approved, 3) Request already processed, or 4) Network issues. Please check the contract state.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    if (!isConnected || !account) {
      setError('Please connect your wallet to reject requests');
      return;
    }

    // Get provider - use fallback if needed
    let currentProvider = provider;
    if (!currentProvider && typeof window !== 'undefined' && window.ethereum) {
      try {
        currentProvider = new ethers.BrowserProvider(window.ethereum);
        console.log('Created provider from window.ethereum for reject');
      } catch (err) {
        console.error('Failed to create provider:', err);
      }
    }

    if (!currentProvider) {
      setError('Wallet provider not available. Please ensure MetaMask is connected and unlocked.');
      return;
    }

    if (!contractAddress) {
      setError('Contract address not set');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const signer = await currentProvider.getSigner();
      if (!signer) {
        throw new Error('Failed to get signer. Please ensure MetaMask is unlocked.');
      }
      const contractWithSigner = new ethers.Contract(contractAddress, ONRAMP_OFFRAMP_ABI, signer);
      
      console.log('Rejecting request:', requestId);
      const tx = await contractWithSigner.rejectRequest(requestId, adminNotes || 'Rejected');
      console.log('Reject transaction sent:', tx.hash);
      await tx.wait();
      setSuccess('Request rejected');
      setAdminNotes('');
      await loadAllRequests();
    } catch (err) {
      console.error('Reject error:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(err.reason || err.message || 'Failed to reject request');
      }
    } finally {
      setLoading(false);
    }
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

  if (!isConnected) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Connect Your Wallet</h2>
        <p>Please connect your wallet to access the admin panel</p>
        <button onClick={connectWallet} style={{
          padding: '12px 24px',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          marginTop: '20px'
        }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>Only the admin wallet can access this page.</p>
        <p style={{ marginTop: '10px', color: '#666' }}>
          Admin Address: {ADMIN_ADDRESS}
        </p>
        <p style={{ marginTop: '10px', color: '#666' }}>
          Your Address: {account}
        </p>
      </div>
    );
  }

  const pendingRequests = requests.filter(r => r.status === 0);

  return (
    <div style={{ 
      padding: '50px', 
      maxWidth: '1600px', 
      margin: '0 auto',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      fontSize: '18px'
    }}>
      <div style={{ 
        marginBottom: '50px',
        padding: '30px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px',
        color: 'white',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)'
      }}>
        <h1 style={{ marginBottom: '10px', color: 'white', fontSize: '48px', fontWeight: 'bold' }}>Admin Panel</h1>
        <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '20px', margin: 0 }}>Manage onramp/offramp requests</p>
      </div>

      {error && (
        <div style={{
          padding: '20px 25px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '12px',
          marginBottom: '25px',
          border: '2px solid #f5c6cb',
          fontSize: '18px',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(220, 53, 69, 0.2)'
        }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '20px 25px',
          backgroundColor: '#d4edda',
          color: '#155724',
          borderRadius: '12px',
          marginBottom: '25px',
          border: '2px solid #c3e6cb',
          fontSize: '18px',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(40, 167, 69, 0.2)'
        }}>
          ✅ {success}
        </div>
      )}

      <div style={{ 
        marginTop: '30px', 
        padding: '40px', 
        backgroundColor: '#ffffff', 
        borderRadius: '16px',
        border: '3px solid #e0e0e0',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '50px' }}>
          <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '36px', fontWeight: 'bold' }}>Order Management</h2>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <button
              onClick={loadAllRequests}
              disabled={loading}
              style={{
                padding: '14px 28px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '18px',
                fontWeight: 'bold',
                opacity: loading ? 0.6 : 1,
                boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => !loading && (e.target.style.transform = 'translateY(-2px)', e.target.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)')}
              onMouseOut={(e) => !loading && (e.target.style.transform = 'translateY(0)', e.target.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)')}
            >
              🔄 Refresh
            </button>
            {pendingCount > 0 && (
              <div style={{
                backgroundColor: '#dc3545',
                color: 'white',
                padding: '16px 32px',
                borderRadius: '30px',
                fontWeight: 'bold',
                fontSize: '20px',
                boxShadow: '0 4px 12px rgba(220, 53, 69, 0.3)'
              }}>
                🔔 {pendingCount} Pending Request{pendingCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ color: '#FFC107', marginBottom: '30px', fontSize: '32px', fontWeight: 'bold' }}>⚠️ Pending Requests (Action Required)</h3>
            {pendingRequests.map((request) => (
              <div key={request.id} style={{
                backgroundColor: '#ffffff',
                padding: '35px',
                marginBottom: '30px',
                borderRadius: '16px',
                border: '4px solid #FFC107',
                boxShadow: '0 8px 24px rgba(255, 193, 7, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '24px', color: '#2c3e50' }}>Request #{request.id}</strong>
                    <span style={{
                      marginLeft: '15px',
                      padding: '8px 16px',
                      backgroundColor: getStatusColor(request.status),
                      color: 'white',
                      borderRadius: '8px',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}>
                      {getStatusLabel(request.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', color: '#666', fontWeight: '500' }}>
                    {new Date(request.createdAt * 1000).toLocaleString()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
                  <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '2px solid #e0e0e0' }}>
                    <strong style={{ color: '#495057', fontSize: '18px' }}>Type:</strong>
                    <div style={{ fontSize: '20px', color: '#2c3e50', marginTop: '10px', fontWeight: '600' }}>{request.requestType === 0 ? 'OnRamp (Buy)' : 'OffRamp (Sell)'}</div>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '2px solid #e0e0e0' }}>
                    <strong style={{ color: '#495057', fontSize: '18px' }}>User:</strong>
                    <div style={{ fontSize: '20px', color: '#2c3e50', marginTop: '10px', fontFamily: 'monospace', fontWeight: '600' }}>{request.user.slice(0, 6)}...{request.user.slice(-4)}</div>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '2px solid #e0e0e0' }}>
                    <strong style={{ color: '#495057', fontSize: '18px' }}>Payment Method:</strong>
                    <div style={{ fontSize: '20px', color: '#2c3e50', marginTop: '10px', fontWeight: '600' }}>{request.paymentMethod}</div>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '12px', border: '2px solid #90caf9' }}>
                    <strong style={{ color: '#1976d2', fontSize: '18px' }}>Token Amount:</strong>
                    <div style={{ fontSize: '24px', color: '#1976d2', marginTop: '10px', fontWeight: 'bold' }}>{parseFloat(request.amount).toFixed(4)} TST</div>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '12px', border: '2px solid #81c784' }}>
                    <strong style={{ color: '#2e7d32', fontSize: '18px' }}>Fiat Amount:</strong>
                    <div style={{ fontSize: '24px', color: '#2e7d32', marginTop: '10px', fontWeight: 'bold' }}>
                      {(() => {
                        const usdAmount = request.fiatAmount;
                        const rate = CURRENCY_RATES[request.currency] || 1;
                        const convertedAmount = usdAmount * rate;
                        return `${convertedAmount.toFixed(2)} ${request.currency}`;
                      })()}
                    </div>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '2px solid #e0e0e0' }}>
                    <strong style={{ color: '#495057', fontSize: '18px' }}>Currency:</strong>
                    <div style={{ fontSize: '20px', color: '#2c3e50', marginTop: '10px', fontWeight: '600' }}>{request.currency}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '20px', padding: '18px', backgroundColor: '#f0f0f0', borderRadius: '10px', border: '2px solid #dee2e6' }}>
                  <strong style={{ color: '#495057', fontSize: '18px' }}>Payment Details:</strong>
                  <div style={{ marginTop: '10px', fontSize: '17px', color: '#2c3e50', lineHeight: '1.6' }}>{request.paymentDetails}</div>
                </div>

                {request.requestType === 0 && (
                  <div style={{ marginBottom: '20px', padding: '18px', backgroundColor: '#e3f2fd', borderRadius: '10px', border: '2px solid #90caf9' }}>
                    <strong style={{ color: '#1976d2', fontSize: '18px' }}>Wallet to Receive Tokens:</strong>
                    <div style={{ marginTop: '10px', fontSize: '17px', color: '#2c3e50', fontFamily: 'monospace' }}>{request.walletAddress}</div>
                  </div>
                )}

                {request.userNotes && (
                  <div style={{ marginBottom: '20px', padding: '18px', backgroundColor: '#fff3cd', borderRadius: '10px', border: '2px solid #ffc107' }}>
                    <strong style={{ color: '#856404', fontSize: '18px' }}>User Notes:</strong>
                    <div style={{ marginTop: '10px', fontSize: '17px', color: '#2c3e50', lineHeight: '1.6' }}>{request.userNotes}</div>
                  </div>
                )}

                <div style={{ marginTop: '25px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: '#495057', fontSize: '18px' }}>
                    Admin Notes:
                  </label>
                  <textarea
                    placeholder="Add admin notes (e.g., 'Funds received', 'Payment sent', etc.)"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '15px', 
                      marginBottom: '20px', 
                      borderRadius: '10px', 
                      border: '2px solid #dee2e6',
                      fontSize: '17px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      minHeight: '100px'
                    }}
                    rows={4}
                  />
                  <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                    <button
                      onClick={() => handleApprove(request.id, request.requestType === 0)}
                      disabled={loading || !isConnected}
                      style={{
                        flex: 1,
                        padding: '20px 32px',
                        backgroundColor: loading || !isConnected ? '#6c757d' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: loading || !isConnected ? 'not-allowed' : 'pointer',
                        fontSize: '22px',
                        fontWeight: 'bold',
                        opacity: loading || !isConnected ? 0.6 : 1,
                        boxShadow: loading || !isConnected ? 'none' : '0 6px 16px rgba(40, 167, 69, 0.4)',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseOver={(e) => {
                        if (!loading && isConnected) {
                          e.target.style.backgroundColor = '#218838';
                          e.target.style.transform = 'translateY(-2px)';
                          e.target.style.boxShadow = '0 8px 20px rgba(40, 167, 69, 0.5)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!loading && isConnected) {
                          e.target.style.backgroundColor = '#28a745';
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = '0 6px 16px rgba(40, 167, 69, 0.4)';
                        }
                      }}
                    >
                      {loading ? 'Processing...' : '✅ Mark as Complete'}
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      disabled={loading || !isConnected}
                      style={{
                        flex: 1,
                        padding: '20px 32px',
                        backgroundColor: loading || !isConnected ? '#6c757d' : '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: loading || !isConnected ? 'not-allowed' : 'pointer',
                        fontSize: '22px',
                        fontWeight: 'bold',
                        opacity: loading || !isConnected ? 0.6 : 1,
                        boxShadow: loading || !isConnected ? 'none' : '0 6px 16px rgba(220, 53, 69, 0.4)',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseOver={(e) => {
                        if (!loading && isConnected) {
                          e.target.style.backgroundColor = '#c82333';
                          e.target.style.transform = 'translateY(-2px)';
                          e.target.style.boxShadow = '0 8px 20px rgba(220, 53, 69, 0.5)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!loading && isConnected) {
                          e.target.style.backgroundColor = '#dc3545';
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = '0 6px 16px rgba(220, 53, 69, 0.4)';
                        }
                      }}
                    >
                      {loading ? 'Processing...' : '❌ Reject'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <h3 style={{ marginBottom: '30px', fontSize: '32px', fontWeight: 'bold', color: '#2c3e50' }}>All Requests ({requests.length})</h3>
          {requests.length === 0 ? (
            <p style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '16px' }}>No requests found.</p>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto', padding: '10px' }}>
              {requests.map((request) => (
                <div key={request.id} style={{
                  backgroundColor: '#ffffff',
                  padding: '18px',
                  marginBottom: '12px',
                  borderRadius: '8px',
                  border: '2px solid #dee2e6',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#28a745';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#dee2e6';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '20px', color: '#2c3e50' }}>Request #{request.id}</strong>
                      <span style={{ marginLeft: '12px', color: '#666', fontSize: '18px' }}>
                        - {request.requestType === 0 ? 'OnRamp' : 'OffRamp'}
                      </span>
                      <span style={{
                        marginLeft: '15px',
                        padding: '8px 16px',
                        backgroundColor: getStatusColor(request.status),
                        color: 'white',
                        borderRadius: '15px',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}>
                        {getStatusLabel(request.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: '18px', color: '#495057', fontWeight: '600' }}>
                      {parseFloat(request.amount).toFixed(4)} TST = {(() => {
                        const usdAmount = request.fiatAmount;
                        const rate = CURRENCY_RATES[request.currency] || 1;
                        const convertedAmount = usdAmount * rate;
                        return `${convertedAmount.toFixed(2)} ${request.currency}`;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;

