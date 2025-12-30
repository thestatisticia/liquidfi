import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToken } from '../hooks/useToken';
import { TOKEN_CONFIG, ERC20_ABI } from '../config/tokens';
import './StreamingPaymentDapp.css';

// StreamingPayment Contract ABI
const STREAMING_PAYMENT_ABI = [
  'function createStream(address[] recipients, uint256[] amounts, uint256 durationHours) external returns (uint256)',
  'function removeRecipient(uint256 streamId, address recipient) external',
  'function claimPayment(uint256 streamId) external',
  'function cancelStream(uint256 streamId) external',
  'function getAccumulatedBalance(uint256 streamId, address recipient) external view returns (uint256)',
  'function getRecipientStreams(address recipient) external view returns (uint256[])',
  'function getCreatorStreams(address creator) external view returns (uint256[])',
  'function getStreamRecipients(uint256 streamId) external view returns (address[] memory)',
  'function getRecipientDetails(uint256 streamId, address recipient) external view returns (tuple(address recipient, uint256 amount, uint256 claimedAmount, bool active))',
  'function streams(uint256) external view returns (address creator, uint256 totalAmount, uint256 durationHours, uint256 startTime, uint256 stopTime, bool active)',
  'function streamCount() external view returns (uint256)',
  'event StreamCreated(uint256 indexed streamId, address indexed creator, uint256 totalAmount, uint256 startTime, uint256 stopTime)',
  'event RecipientAdded(uint256 indexed streamId, address indexed recipient, uint256 amount, uint256 ratePerSecond)',
  'event RecipientRemoved(uint256 indexed streamId, address indexed recipient)',
  'event PaymentClaimed(uint256 indexed streamId, address indexed recipient, uint256 amount)',
  'event StreamCancelled(uint256 indexed streamId)'
];

function StreamingPaymentDapp() {
  const { account, balance, isConnected, connectWallet, error: tokenError } = useToken();
  const [streamingContract, setStreamingContract] = useState(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'my-streams', 'claim'
  const [needsApproval, setNeedsApproval] = useState(false);
  
  // Form state for creating stream
  const [recipients, setRecipients] = useState([{ address: '', amount: '' }]); // Array of {address, amount}
  const [durationHours, setDurationHours] = useState('24');
  
  // Contract address - StreamingPayment deployed contract
  const [contractAddress, setContractAddress] = useState('0x2622dB2D3391bDA6D7A15F442Ea236391276DcB9');

  useEffect(() => {
    if (isConnected && account && contractAddress) {
      initializeContract();
    }
  }, [isConnected, account, contractAddress]);

  useEffect(() => {
    if (streamingContract && account) {
      loadStreams();
      // Update balances every second
      const interval = setInterval(() => {
        updateStreamBalances();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [streamingContract, account]);

  const initializeContract = async () => {
    if (!window.ethereum || !contractAddress) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, STREAMING_PAYMENT_ABI, signer);
      
      // Verify contract is accessible
      try {
        const count = await contract.streamCount();
        console.log('Contract verified, stream count:', count.toString());
        setStreamingContract(contract);
        setError('');
      } catch (verifyErr) {
        console.error('Contract verification failed:', verifyErr);
        setError('Contract not accessible. Please check the contract address.');
      }
    } catch (err) {
      console.error('Failed to initialize contract:', err);
      setError('Failed to connect to streaming payment contract');
    }
  };

  const loadStreams = async () => {
    if (!streamingContract || !account) return;
    
    try {
      setLoading(true);
      
      // Get streams where user is recipient
      const recipientStreamIds = await streamingContract.getRecipientStreams(account);
      
      // Get streams where user is creator
      const creatorStreamIds = await streamingContract.getCreatorStreams(account);
      
      // Combine and deduplicate
      const allStreamIds = [...new Set([...recipientStreamIds, ...creatorStreamIds])];
      
      if (allStreamIds.length === 0) {
        setStreams([]);
        return;
      }
      
      // Load stream details
      const streamPromises = allStreamIds.map(async (id) => {
        const stream = await streamingContract.streams(id);
        const recipientAddresses = await streamingContract.getStreamRecipients(id);
        
        // Get recipient data for current user if they're a recipient
        let recipientData = null;
        let accumulated = '0';
        let isRecipient = false;
        
        if (recipientAddresses.includes(account)) {
          isRecipient = true;
          try {
            recipientData = await streamingContract.getRecipientDetails(id, account);
            accumulated = ethers.formatEther(await streamingContract.getAccumulatedBalance(id, account));
          } catch (err) {
            console.error('Failed to load recipient data:', err);
            // If recipient doesn't exist or is not active, set defaults
            recipientData = null;
            accumulated = '0';
          }
        }
        
        // Get all recipient data
        const allRecipientsData = await Promise.all(
          recipientAddresses.map(async (addr) => {
            try {
              const data = await streamingContract.getRecipientDetails(id, addr);
              // Calculate rate per second from amount and duration
              const streamData = await streamingContract.streams(id);
              const durationSeconds = (Number(streamData.stopTime) - Number(streamData.startTime));
              const amountWei = BigInt(data.amount);
              const ratePerSecondWei = durationSeconds > 0 ? amountWei / BigInt(durationSeconds) : 0n;
              
              return {
                address: addr,
                amount: ethers.formatEther(data.amount),
                ratePerSecond: ratePerSecondWei.toString(),
                claimedAmount: ethers.formatEther(data.claimedAmount),
                active: data.active
              };
            } catch (err) {
              console.warn(`Failed to load recipient data for ${addr}:`, err);
              return null;
            }
          })
        );
        
        return {
          id: id.toString(),
          creator: stream.creator,
          recipients: recipientAddresses,
          recipientsData: allRecipientsData.filter(r => r !== null),
          totalAmount: ethers.formatEther(stream.totalAmount),
          durationHours: Number(stream.durationHours),
          startTime: Number(stream.startTime),
          stopTime: Number(stream.stopTime),
          active: stream.active,
          accumulated: accumulated,
          recipientData: recipientData,
          isRecipient: isRecipient,
          isCreator: stream.creator === account
        };
      });
      
      const streamData = await Promise.all(streamPromises);
      setStreams(streamData);
    } catch (err) {
      console.error('Failed to load streams:', err);
      setError('Failed to load streams');
    } finally {
      setLoading(false);
    }
  };

  const updateStreamBalances = async () => {
    if (!streamingContract || !account || streams.length === 0) return;
    
    try {
      const updatedStreams = await Promise.all(
        streams.map(async (stream) => {
          if (!stream.isRecipient || !stream.active) return stream;
          
          try {
            const accumulated = await streamingContract.getAccumulatedBalance(stream.id, account);
            return {
              ...stream,
              accumulated: ethers.formatEther(accumulated)
            };
          } catch (err) {
            return stream;
          }
        })
      );
      
      setStreams(updatedStreams);
    } catch (err) {
      console.error('Failed to update balances:', err);
    }
  };

  const handleCreateStream = async (e) => {
    e.preventDefault();
    if (!streamingContract) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Validate recipients
      const validRecipients = recipients.filter(r => r.address.trim() !== '' && r.amount.trim() !== '');
      if (validRecipients.length === 0) {
        throw new Error('Please add at least one recipient with amount');
      }
      
      // Validate addresses and amounts
      const recipientAddresses = [];
      const amounts = [];
      let totalAmountWei = 0n;
      
      for (const recipient of validRecipients) {
        if (!ethers.isAddress(recipient.address)) {
          throw new Error(`Invalid recipient address: ${recipient.address}`);
        }
        if (parseFloat(recipient.amount) <= 0) {
          throw new Error(`Amount must be greater than 0 for ${recipient.address}`);
        }
        
        const amountWei = ethers.parseEther(recipient.amount);
        recipientAddresses.push(recipient.address);
        amounts.push(amountWei);
        totalAmountWei += amountWei;
      }
      
      // Validate duration
      const hours = parseInt(durationHours) || 0;
      if (hours <= 0) {
        throw new Error('Duration must be at least 1 hour');
      }
      
      // Get provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Approve tokens
      const tokenConfig = TOKEN_CONFIG.testStablecoin;
      const tokenContract = new ethers.Contract(
        tokenConfig.contractAddress,
        ERC20_ABI,
        signer
      );
      
      // Check and handle approval
      const currentAllowance = await tokenContract.allowance(account, contractAddress);
      if (currentAllowance < totalAmountWei) {
        console.log('Approving tokens...');
        setNeedsApproval(true);
        
        try {
          // Estimate gas for approval
          let approveGasLimit = 100000n;
          try {
            const estimateGas = await tokenContract.approve.estimateGas(contractAddress, ethers.MaxUint256);
            approveGasLimit = estimateGas + (estimateGas / 5n); // Add 20% buffer
            console.log('Approval gas estimate:', approveGasLimit.toString());
          } catch (gasError) {
            console.warn('Gas estimation failed, using default:', gasError);
          }
          
          const approveTx = await tokenContract.approve(contractAddress, ethers.MaxUint256, {
            gasLimit: approveGasLimit
          });
          console.log('Approval transaction sent:', approveTx.hash);
          
          try {
            await Promise.race([
              approveTx.wait(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Approval timeout')), 90000)
              )
            ]);
            console.log('Approval confirmed');
            setNeedsApproval(false);
          } catch (waitError) {
            console.warn('Approval wait failed:', waitError);
            await new Promise(resolve => setTimeout(resolve, 5000));
            const newAllowance = await tokenContract.allowance(account, contractAddress);
            if (newAllowance >= totalAmountWei) {
              console.log('Approval succeeded despite wait error');
              setNeedsApproval(false);
            } else {
              await new Promise(resolve => setTimeout(resolve, 10000));
              const finalAllowance = await tokenContract.allowance(account, contractAddress);
              if (finalAllowance >= totalAmountWei) {
                console.log('Approval succeeded after additional wait');
                setNeedsApproval(false);
              } else {
                throw new Error('Token approval is taking longer than expected. Please check MetaMask and try again.');
              }
            }
          }
        } catch (approveError) {
          console.error('Approval error:', approveError);
          setNeedsApproval(false);
          
          // Check if transaction hash exists (transaction was sent)
          if (approveError.transaction || approveError.receipt) {
            console.log('Transaction was sent, checking if it succeeded...');
            // Wait longer for transaction to be mined
            for (let i = 0; i < 6; i++) {
              await new Promise(resolve => setTimeout(resolve, 5000));
              try {
                const checkAllowance = await tokenContract.allowance(account, contractAddress);
                if (checkAllowance >= totalAmountWei) {
                  console.log('Approval succeeded after checking');
                  break; // Approval succeeded, continue
                }
                if (i === 5) {
                  // Last attempt failed
                  throw new Error('Token approval may have failed. Please check MetaMask and try again, or wait a moment and retry.');
                }
              } catch (checkError) {
                console.warn('Error checking allowance:', checkError);
              }
            }
          } else if (approveError.code === 'UNKNOWN_ERROR' || approveError.code === -32603) {
            console.log('RPC error during approval, checking if it succeeded...');
            // Try multiple times with increasing delays
            let approvalConfirmed = false;
            for (let attempt = 0; attempt < 6; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 5000 + (attempt * 2000)));
              try {
                const checkAllowance = await tokenContract.allowance(account, contractAddress);
                console.log(`Allowance check attempt ${attempt + 1}:`, checkAllowance.toString());
                if (checkAllowance >= totalAmountWei) {
                  console.log('Approval succeeded despite RPC error');
                  approvalConfirmed = true;
                  break;
                }
              } catch (checkError) {
                console.warn('Error checking allowance:', checkError);
              }
            }
            
            if (!approvalConfirmed) {
              // Final check before giving up
              try {
                const finalAllowance = await tokenContract.allowance(account, contractAddress);
                if (finalAllowance >= totalAmountWei) {
                  console.log('Approval confirmed on final check');
                  approvalConfirmed = true;
                }
              } catch (finalError) {
                console.error('Final allowance check failed:', finalError);
              }
              
              if (!approvalConfirmed) {
                throw new Error('Token approval failed due to RPC error. The transaction may have succeeded on-chain - please check MetaMask transaction history. If approved, you can try creating the stream again.');
              }
            }
          } else if (approveError.message && (approveError.message.includes('user rejected') || approveError.message.includes('rejected'))) {
            throw new Error('Approval was rejected. Please approve the transaction to continue.');
          } else {
            throw approveError;
          }
        }
      } else {
        console.log('Sufficient allowance already exists');
        setNeedsApproval(false);
      }
      
      // Create stream - estimate gas first
      let gasEstimate;
      try {
        gasEstimate = await streamingContract.createStream.estimateGas(recipientAddresses, amounts, hours);
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        throw new Error(estimateError.reason || 'Transaction would fail. Check recipient addresses, amounts, and duration.');
      }
      
      // Use estimated gas with 30% buffer
      const gasLimit = gasEstimate + (gasEstimate / 3n);
      
      console.log('Creating stream:', { 
        recipientAddresses, 
        amounts: amounts.map(a => a.toString()), 
        hours,
        gasLimit: gasLimit.toString()
      });
      
      const tx = await streamingContract.createStream(recipientAddresses, amounts, hours, {
        gasLimit: gasLimit
      });
      
      console.log('Stream creation transaction:', tx.hash);
      
      // Wait for transaction with error handling
      try {
        await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 120000)
          )
        ]);
      } catch (waitError) {
        console.warn('Transaction wait failed:', waitError);
        // Check if transaction succeeded by checking receipt status
        if (waitError.receipt) {
          if (waitError.receipt.status === 1) {
            console.log('Transaction succeeded despite wait error');
          } else {
            // Transaction reverted - check why
            console.error('Transaction reverted:', waitError.receipt);
            throw new Error('Transaction reverted. This may be due to insufficient gas, invalid parameters, or contract error. Please check the console for details.');
          }
        } else {
          // Wait a bit and check if stream was created
          await new Promise(resolve => setTimeout(resolve, 5000));
          const newCount = await streamingContract.streamCount();
          if (Number(newCount) > streams.length) {
            console.log('Stream created despite wait error');
          } else {
            throw waitError;
          }
        }
      }
      
      // Reload streams
      await loadStreams();
      
      // Reset form
      setRecipients([{ address: '', amount: '' }]);
      setDurationHours('24');
      
      alert('Stream created successfully!');
      setActiveTab('my-streams');
    } catch (err) {
      console.error('Error creating stream:', err);
      let errorMessage = 'Failed to create stream';
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimPayment = async (streamId) => {
    if (!streamingContract) return;
    
    try {
      setLoading(true);
      setError('');
      
      // Estimate gas first
      try {
        const gasEstimate = await streamingContract.claimPayment.estimateGas(streamId);
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        throw new Error(estimateError.reason || 'Cannot claim payment. Check if you have accumulated balance.');
      }
      
      // Try to send transaction with better error handling
      let tx;
      try {
        tx = await streamingContract.claimPayment(streamId, {
          gasLimit: 200000
        });
        console.log('Claim transaction sent:', tx.hash);
      } catch (sendError) {
        console.error('Send transaction error:', sendError);
        // Check if it's an RPC error but transaction might have succeeded
        if (sendError.code === 'UNKNOWN_ERROR' || sendError.code === -32603) {
          console.log('RPC error during claim, checking if it succeeded...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          await loadStreams();
          // Check if accumulated balance decreased
          const currentStreams = await Promise.all(
            [streamId].map(async (id) => {
              try {
                const accumulated = await streamingContract.getAccumulatedBalance(id, account);
                return { id: id.toString(), accumulated: ethers.formatEther(accumulated) };
              } catch (err) {
                return { id: id.toString(), accumulated: '0' };
              }
            })
          );
          const currentAccumulated = currentStreams[0]?.accumulated || '0';
          const previousAccumulated = streams.find(s => s.id === streamId)?.accumulated || '0';
          if (parseFloat(currentAccumulated) < parseFloat(previousAccumulated)) {
            alert('Payment claimed successfully! (Transaction succeeded despite RPC error)');
            await loadStreams();
            return;
          }
        }
        throw sendError;
      }
      
      // Wait with error handling
      try {
        await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 120000)
          )
        ]);
        console.log('Claim confirmed');
      } catch (waitError) {
        console.warn('Transaction wait failed:', waitError);
        // Check if it succeeded
        await new Promise(resolve => setTimeout(resolve, 5000));
        await loadStreams();
        // Check accumulated balance
        const currentStreams = await Promise.all(
          [streamId].map(async (id) => {
            try {
              const accumulated = await streamingContract.getAccumulatedBalance(id, account);
              return { id: id.toString(), accumulated: ethers.formatEther(accumulated) };
            } catch (err) {
              return { id: id.toString(), accumulated: '0' };
            }
          })
        );
        const currentAccumulated = currentStreams[0]?.accumulated || '0';
        const previousAccumulated = streams.find(s => s.id === streamId)?.accumulated || '0';
        if (parseFloat(currentAccumulated) < parseFloat(previousAccumulated)) {
          alert('Payment claimed successfully! (Transaction succeeded despite wait error)');
          return;
        }
        // If we get here, it might have failed or still processing
        alert('Payment claim is processing. Please wait a moment and check your balance.');
      }
      
      await loadStreams();
      alert('Payment claimed successfully!');
    } catch (err) {
      console.error('Error claiming payment:', err);
      let errorMessage = 'Failed to claim payment';
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.code === 'UNKNOWN_ERROR' || err.code === -32603) {
        errorMessage = 'RPC error. The transaction may have succeeded - please check your balance and refresh.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecipient = async (streamId, recipientAddress) => {
    if (!streamingContract) return;
    
    if (!confirm(`Are you sure you want to remove ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)} from this stream? Unclaimed amount will be refunded to you.`)) return;
    
    try {
      setLoading(true);
      setError('');
      
      // Try to send transaction
      let tx;
      try {
        tx = await streamingContract.removeRecipient(streamId, recipientAddress, {
          gasLimit: 200000
        });
        console.log('Remove recipient transaction sent:', tx.hash);
      } catch (sendError) {
        console.error('Send transaction error:', sendError);
        if (sendError.code === 'UNKNOWN_ERROR' || sendError.code === -32603) {
          console.log('RPC error, checking if transaction succeeded...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          await loadStreams();
          // Check if recipient was removed
          const updatedStream = streams.find(s => s.id === streamId);
          const recipientStillActive = updatedStream?.recipientsData.find(r => r.address === recipientAddress)?.active;
          if (!recipientStillActive) {
            alert('Recipient removed successfully! (Transaction succeeded despite RPC error)');
            return;
          }
        }
        throw sendError;
      }
      
      // Wait for transaction
      try {
        await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 120000)
          )
        ]);
      } catch (waitError) {
        console.warn('Transaction wait failed:', waitError);
        await new Promise(resolve => setTimeout(resolve, 5000));
        await loadStreams();
        alert('Recipient removal is processing. Please refresh to see updates.');
      }
      
      await loadStreams();
      alert('Recipient removed successfully!');
    } catch (err) {
      console.error('Error removing recipient:', err);
      let errorMessage = 'Failed to remove recipient';
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelStream = async (streamId) => {
    if (!streamingContract) return;
    
    if (!confirm('Are you sure you want to cancel this stream? Remaining tokens will be refunded to you.')) return;
    
    try {
      setLoading(true);
      setError('');
      const tx = await streamingContract.cancelStream(streamId, {
        gasLimit: 200000
      });
      await tx.wait();
      await loadStreams();
      alert('Stream cancelled successfully!');
    } catch (err) {
      console.error('Error cancelling stream:', err);
      let errorMessage = 'Failed to cancel stream';
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = () => {
    setRecipients([...recipients, { address: '', amount: '' }]);
  };

  const removeRecipient = (index) => {
    const newRecipients = recipients.filter((_, i) => i !== index);
    setRecipients(newRecipients.length > 0 ? newRecipients : [{ address: '', amount: '' }]);
  };

  const updateRecipient = (index, field, value) => {
    const newRecipients = [...recipients];
    newRecipients[index] = { ...newRecipients[index], [field]: value };
    setRecipients(newRecipients);
  };

  const formatTime = (timestamp) => {
    if (timestamp === 0) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const getTimeRemaining = (stopTime) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = stopTime - now;
    if (remaining <= 0) return 'Completed';
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (!isConnected) {
    return (
      <div className="streaming-payment-dapp">
        <div className="connect-prompt">
          <h2>💧 Streaming Payment System</h2>
          <p>Connect your wallet to create and claim streaming payments</p>
          <button onClick={connectWallet} className="connect-btn">
            Connect Wallet
          </button>
          {tokenError && <p className="error">{tokenError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="streaming-payment-dapp">
      <div className="header">
        <h2>💧 Streaming Payment System</h2>
        <div className="balance-info">
          <span className="balance-label">Balance:</span>
          <span className="balance-value">{balance || '0'} TST</span>
        </div>
      </div>

      {!contractAddress && (
        <div className="contract-setup">
          <h3>📝 Contract Setup Required</h3>
          <p>Please deploy the StreamingPayment contract and enter its address:</p>
          <input
            type="text"
            placeholder="0x..."
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="contract-input"
          />
        </div>
      )}

      {contractAddress && (
        <>
          <div className="tabs">
            <button
              className={activeTab === 'create' ? 'active' : ''}
              onClick={() => setActiveTab('create')}
            >
              ➕ Create Stream
            </button>
            <button
              className={activeTab === 'my-streams' ? 'active' : ''}
              onClick={() => setActiveTab('my-streams')}
            >
              📋 My Streams
            </button>
            <button
              className={activeTab === 'claim' ? 'active' : ''}
              onClick={() => setActiveTab('claim')}
            >
              💰 Claim Payments
            </button>
          </div>

          {activeTab === 'create' && (
            <div className="create-stream">
              <h3>Create New Payment Stream</h3>
              <form onSubmit={handleCreateStream}>
                <div className="form-group">
                  <label>Recipients & Amounts</label>
                  <small>Set how much each wallet will receive</small>
                  {recipients.map((recipient, index) => (
                    <div key={index} className="recipient-amount-group">
                      <input
                        type="text"
                        value={recipient.address}
                        onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                        placeholder="Wallet address (0x...)"
                        required={index === 0}
                        className="recipient-address-input"
                      />
                      <input
                        type="number"
                        value={recipient.amount}
                        onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                        placeholder="Amount (TST)"
                        step="0.01"
                        min="0"
                        required={index === 0}
                        className="recipient-amount-input"
                      />
                      {recipients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRecipient(index)}
                          className="remove-btn"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="add-recipient-btn"
                  >
                    + Add Recipient
                  </button>
                </div>

                <div className="form-group">
                  <label>Stream Duration (Hours)</label>
                  <input
                    type="number"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    placeholder="24"
                    min="1"
                    required
                  />
                  <small>How long the stream will last in hours</small>
                </div>

                <button type="submit" disabled={loading || needsApproval} className="submit-btn">
                  {needsApproval ? 'Approving Tokens...' : loading ? 'Creating...' : 'Create Stream'}
                </button>
                {needsApproval && (
                  <p className="approval-note">
                    ⏳ Waiting for token approval. Please confirm the transaction in MetaMask.
                  </p>
                )}
              </form>
            </div>
          )}

          {(activeTab === 'my-streams' || activeTab === 'claim') && (
            <div className="streams-list">
              <h3>{activeTab === 'claim' ? 'Claimable Payments' : 'My Streams'}</h3>
              {loading && <p>Loading streams...</p>}
              {streams.length === 0 && !loading && (
                <p className="no-streams">No streams found. Create one to get started!</p>
              )}
              {streams.map((stream) => {
                // Filter for claim tab
                if (activeTab === 'claim' && (!stream.isRecipient || parseFloat(stream.accumulated) <= 0)) {
                  return null;
                }
                
                return (
                  <div key={stream.id} className="stream-card">
                    <div className="stream-header">
                      <div>
                        <h4>Stream #{stream.id}</h4>
                        <span className={`status ${stream.active ? 'active' : 'inactive'}`}>
                          {stream.active ? '🟢 Active' : '🔴 Inactive'}
                        </span>
                      </div>
                      {stream.isCreator && stream.active && (
                        <button
                          onClick={() => handleCancelStream(stream.id)}
                          className="cancel-btn"
                        >
                          Cancel Stream
                        </button>
                      )}
                    </div>
                    <div className="stream-details">
                      <div className="detail">
                        <span className="label">Recipients:</span>
                        <div className="recipients-list">
                          {stream.recipientsData.map((r, i) => (
                            <div key={i} className="recipient-item">
                              <span className="recipient-address">{r.address.slice(0, 6)}...{r.address.slice(-4)}</span>
                              <span className="recipient-amount">{r.amount} TST</span>
                              {!r.active && <span className="removed-badge">Removed</span>}
                              {stream.isCreator && stream.active && r.active && (
                                <button
                                  onClick={() => handleRemoveRecipient(stream.id, r.address)}
                                  className="remove-recipient-btn"
                                  title="Remove this recipient"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="detail">
                        <span className="label">Total Amount:</span>
                        <span className="value">{stream.totalAmount} TST</span>
                      </div>
                      <div className="detail">
                        <span className="label">Start Time:</span>
                        <span className="value">{formatTime(stream.startTime)}</span>
                      </div>
                      <div className="detail">
                        <span className="label">End Time:</span>
                        <span className="value">{formatTime(stream.stopTime)}</span>
                      </div>
                      <div className="detail">
                        <span className="label">Time Remaining:</span>
                        <span className="value">{getTimeRemaining(stream.stopTime)}</span>
                      </div>
                      {stream.isRecipient && stream.recipientData && (
                        <>
                          <div className="detail highlight">
                            <span className="label">Your Amount:</span>
                            <span className="value">{ethers.formatEther(stream.recipientData.amount)} TST</span>
                          </div>
                          <div className="detail highlight">
                            <span className="label">Accumulated:</span>
                            <span className="value">{parseFloat(stream.accumulated).toFixed(6)} TST</span>
                          </div>
                          <div className="detail">
                            <span className="label">Rate:</span>
                            <span className="value">{ethers.formatEther(stream.recipientData.ratePerSecond || '0')} TST/sec</span>
                          </div>
                          <div className="detail">
                            <span className="label">Claimed:</span>
                            <span className="value">{ethers.formatEther(stream.recipientData.claimedAmount)} TST</span>
                          </div>
                        </>
                      )}
                    </div>
                    {stream.isRecipient && stream.active && parseFloat(stream.accumulated) > 0 && (
                      <button
                        onClick={() => handleClaimPayment(stream.id)}
                        className="claim-btn"
                        disabled={loading}
                      >
                        Claim {parseFloat(stream.accumulated).toFixed(6)} TST
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

export default StreamingPaymentDapp;
