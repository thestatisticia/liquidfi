import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useToken } from '../hooks/useToken';
import { TOKEN_CONFIG, ERC20_ABI } from '../config/tokens';
import './AutomaticPaymentDapp.css';

// PaymentSchedule Contract ABI
const PAYMENT_SCHEDULE_ABI = [
  'function createSchedule(address recipient, uint256 amount, uint256 intervalSeconds) external returns (uint256)',
  'function executePayment(uint256 scheduleId) external',
  'function deactivateSchedule(uint256 scheduleId) external',
  'function getUserSchedules(address user) external view returns (uint256[])',
  'function getSchedule(uint256 scheduleId) external view returns (tuple(address creator, address recipient, uint256 amount, uint256 interval, uint256 nextPayment, bool active, uint256 totalPaid, uint256 paymentCount))',
  'function isPaymentDue(uint256 scheduleId) external view returns (bool)',
  'function scheduleCount() external view returns (uint256)',
  'event ScheduleCreated(uint256 indexed scheduleId, address indexed creator, address recipient, uint256 amount, uint256 interval)',
  'event PaymentExecuted(uint256 indexed scheduleId, address recipient, uint256 amount)',
  'event ScheduleDeactivated(uint256 indexed scheduleId)'
];

function AutomaticPaymentDapp() {
  const { account, balance, isConnected, connectWallet, error: tokenError } = useToken();
  const [paymentScheduleContract, setPaymentScheduleContract] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'manage'
  
  // Form state for creating schedule
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [intervalDays, setIntervalDays] = useState('1');
  const [intervalHours, setIntervalHours] = useState('0');
  const [intervalMinutes, setIntervalMinutes] = useState('0');
  
  // Contract address - PaymentSchedule deployed contract
  const [contractAddress, setContractAddress] = useState('0x9FFa295c07Ec65D9013944b3b15C44608c77bf34');

  useEffect(() => {
    if (isConnected && account && contractAddress) {
      initializeContract();
    }
  }, [isConnected, account, contractAddress]);

  useEffect(() => {
    if (paymentScheduleContract && account) {
      loadSchedules();
    }
  }, [paymentScheduleContract, account]);

  const initializeContract = async () => {
    if (!window.ethereum || !contractAddress) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, PAYMENT_SCHEDULE_ABI, signer);
      
      // Verify contract is accessible by calling a view function
      try {
        const scheduleCount = await contract.scheduleCount();
        console.log('Contract verified, schedule count:', scheduleCount.toString());
        setPaymentScheduleContract(contract);
        setError('');
      } catch (verifyErr) {
        console.error('Contract verification failed:', verifyErr);
        setError('Contract not accessible. Please check the contract address.');
      }
    } catch (err) {
      console.error('Failed to initialize contract:', err);
      setError('Failed to connect to payment schedule contract');
    }
  };

  const loadSchedules = async () => {
    if (!paymentScheduleContract || !account) return;
    
    try {
      setLoading(true);
      const scheduleIds = await paymentScheduleContract.getUserSchedules(account);
      
      if (scheduleIds.length === 0) {
        setSchedules([]);
        return;
      }
      
      const schedulePromises = scheduleIds.map(id => 
        paymentScheduleContract.getSchedule(id)
      );
      const scheduleData = await Promise.all(schedulePromises);
      
      const formattedSchedules = scheduleData.map((schedule, index) => ({
        id: scheduleIds[index].toString(),
        creator: schedule.creator,
        recipient: schedule.recipient,
        amount: ethers.formatEther(schedule.amount),
        interval: Number(schedule.interval),
        nextPayment: Number(schedule.nextPayment),
        active: schedule.active,
        totalPaid: ethers.formatEther(schedule.totalPaid),
        paymentCount: Number(schedule.paymentCount)
      }));
      
      setSchedules(formattedSchedules);
    } catch (err) {
      console.error('Failed to load schedules:', err);
      setError('Failed to load payment schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    if (!paymentScheduleContract || !recipient || !amount) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Validate recipient address
      if (!ethers.isAddress(recipient)) {
        throw new Error('Invalid recipient address');
      }
      
      // Calculate interval in seconds
      const days = parseInt(intervalDays) || 0;
      const hours = parseInt(intervalHours) || 0;
      const minutes = parseInt(intervalMinutes) || 0;
      const intervalSeconds = (days * 24 * 60 * 60) + (hours * 60 * 60) + (minutes * 60);
      
      if (intervalSeconds < 60) {
        throw new Error('Interval must be at least 1 minute');
      }
      
      const amountWei = ethers.parseEther(amount);
      
      // Get provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // First, approve the contract to spend tokens
      const tokenConfig = TOKEN_CONFIG.testStablecoin;
      const tokenContract = new ethers.Contract(
        tokenConfig.contractAddress,
        ERC20_ABI,
        signer
      );
      
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(account, contractAddress);
      if (currentAllowance < amountWei) {
        console.log('Approving tokens...');
        // Approve a large amount for recurring payments
        const approveTx = await tokenContract.approve(contractAddress, ethers.MaxUint256);
        console.log('Approval transaction:', approveTx.hash);
        await approveTx.wait();
        console.log('Approval confirmed');
      } else {
        console.log('Sufficient allowance already exists');
      }
      
      // Create the schedule - use estimateGas first to catch errors early
      let gasEstimate;
      try {
        gasEstimate = await paymentScheduleContract.createSchedule.estimateGas(recipient, amountWei, intervalSeconds);
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        // Try to extract revert reason
        let errorMsg = 'Transaction would fail. ';
        if (estimateError.reason) {
          errorMsg += estimateError.reason;
        } else if (estimateError.data) {
          errorMsg += 'Check recipient address, amount, and interval.';
        } else {
          errorMsg += estimateError.message || 'Unknown error.';
        }
        throw new Error(errorMsg);
      }
      
      // Create the schedule with explicit gas limit (add 20% buffer)
      const gasLimit = gasEstimate + (gasEstimate / 5n);
      console.log('Creating schedule with:', { 
        recipient, 
        amountWei: amountWei.toString(), 
        intervalSeconds,
        amount: amount,
        intervalDays,
        intervalHours,
        intervalMinutes,
        gasLimit: gasLimit.toString()
      });
      
      // Try to send transaction - catch RPC errors but check if it actually went through
      let tx;
      try {
        tx = await paymentScheduleContract.createSchedule(recipient, amountWei, intervalSeconds, {
          gasLimit: gasLimit
        });
        console.log('Schedule creation transaction sent:', tx.hash);
      } catch (sendError) {
        console.error('Send transaction error:', sendError);
        
        // Check if transaction actually went through despite the error
        // Sometimes RPC returns error but transaction is still sent
        if (sendError.code === 'UNKNOWN_ERROR' || sendError.code === -32603) {
          console.log('RPC error detected, checking if transaction was sent...');
          
          // Wait a bit and check schedule count
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          try {
            const currentScheduleCount = await paymentScheduleContract.scheduleCount();
            const previousCount = schedules.length;
            
            console.log('Current schedule count:', currentScheduleCount.toString());
            console.log('Previous count:', previousCount);
            
            // If count increased, transaction likely succeeded
            if (Number(currentScheduleCount) > previousCount) {
              console.log('Transaction appears to have succeeded despite RPC error');
              // Reload schedules and continue
              await loadSchedules();
              setRecipient('');
              setAmount('');
              setIntervalDays('1');
              setIntervalHours('0');
              setIntervalMinutes('0');
              alert('Payment schedule created successfully! (Transaction may have succeeded despite error)');
              return;
            }
          } catch (checkError) {
            console.error('Failed to check schedule count:', checkError);
          }
        }
        
        // If we get here, transaction likely failed
        throw sendError;
      }
      
      // Wait for transaction with timeout
      let receipt;
      try {
        receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 120000)
          )
        ]);
        console.log('Schedule created, receipt:', receipt);
      } catch (waitError) {
        console.warn('Transaction wait failed:', waitError);
        // Check if transaction was actually successful
        try {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const currentScheduleCount = await paymentScheduleContract.scheduleCount();
          const previousCount = schedules.length;
          
          if (Number(currentScheduleCount) > previousCount) {
            console.log('Transaction appears to have succeeded despite wait error');
            receipt = { status: 1 };
          } else {
            throw waitError;
          }
        } catch (checkError) {
          throw waitError;
        }
      }
      
      // Verify transaction succeeded
      if (receipt && receipt.status === 1) {
        // Reload schedules
        await loadSchedules();
        
        // Reset form
        setRecipient('');
        setAmount('');
        setIntervalDays('1');
        setIntervalHours('0');
        setIntervalMinutes('0');
        
        alert('Payment schedule created successfully!');
      } else {
        throw new Error('Transaction failed');
      }
    } catch (err) {
      console.error('Error creating schedule:', err);
      
      // Better error messages
      let errorMessage = 'Failed to create schedule';
      if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.data?.message) {
        errorMessage = err.data.message;
      }
      
      // Check for specific revert reasons
      if (errorMessage.includes('Invalid recipient')) {
        errorMessage = 'Invalid recipient address. Please check the address format.';
      } else if (errorMessage.includes('Amount must be > 0')) {
        errorMessage = 'Payment amount must be greater than 0';
      } else if (errorMessage.includes('Interval must be at least')) {
        errorMessage = 'Payment interval must be at least 1 minute';
      } else if (errorMessage.includes('user rejected')) {
        errorMessage = 'Transaction was rejected. Please try again.';
      } else if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH for gas fees. Please add more ETH to your wallet.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleExecutePayment = async (scheduleId) => {
    if (!paymentScheduleContract) return;
    
    try {
      setLoading(true);
      setError('');
      const tx = await paymentScheduleContract.executePayment(scheduleId);
      await tx.wait();
      await loadSchedules();
      alert('Payment executed successfully!');
    } catch (err) {
      setError(err.message || 'Failed to execute payment');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateSchedule = async (scheduleId) => {
    if (!paymentScheduleContract) return;
    
    if (!confirm('Are you sure you want to deactivate this schedule?')) return;
    
    try {
      setLoading(true);
      setError('');
      const tx = await paymentScheduleContract.deactivateSchedule(scheduleId);
      await tx.wait();
      await loadSchedules();
      alert('Schedule deactivated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to deactivate schedule');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeUntilNext = (nextPaymentTimestamp) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = nextPaymentTimestamp - now;
    
    if (diff <= 0) return 'Due now';
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatInterval = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    return parts.join(', ') || '0 minutes';
  };

  if (!isConnected) {
    return (
      <div className="automatic-payment-dapp">
        <div className="connect-prompt">
          <h2>🔄 Automatic Payment System</h2>
          <p>Connect your wallet to create and manage automatic payment schedules</p>
          <button onClick={connectWallet} className="connect-btn">
            Connect Wallet
          </button>
          {tokenError && <p className="error">{tokenError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="automatic-payment-dapp">
      <div className="header">
        <h2>🔄 Automatic Payment System</h2>
        <div className="balance-info">
          <span className="balance-label">Balance:</span>
          <span className="balance-value">{balance || '0'} TST</span>
        </div>
      </div>

      {!contractAddress && (
        <div className="contract-setup">
          <h3>📝 Contract Setup Required</h3>
          <p>Please deploy the PaymentSchedule contract and enter its address:</p>
          <input
            type="text"
            placeholder="0x..."
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="contract-input"
          />
          <p className="help-text">
            Deploy using: <code>npx hardhat run scripts/deploy-payment-schedule.js --network baseSepolia</code>
          </p>
        </div>
      )}

      {contractAddress && (
        <>
          <div className="tabs">
            <button
              className={activeTab === 'create' ? 'active' : ''}
              onClick={() => setActiveTab('create')}
            >
              ➕ Create Schedule
            </button>
            <button
              className={activeTab === 'manage' ? 'active' : ''}
              onClick={() => setActiveTab('manage')}
            >
              📋 Manage Schedules
            </button>
          </div>

          {activeTab === 'create' && (
            <div className="create-schedule">
              <h3>Create New Payment Schedule</h3>
              <form onSubmit={handleCreateSchedule}>
                <div className="form-group">
                  <label>Recipient Address</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="0x..."
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                  />
                </div>

                <div className="form-group">
                  <label>Payment Amount (TST)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Payment Interval</label>
                  <div className="interval-inputs">
                    <div>
                      <input
                        type="number"
                        value={intervalDays}
                        onChange={(e) => setIntervalDays(e.target.value)}
                        min="0"
                        placeholder="0"
                      />
                      <label>Days</label>
                    </div>
                    <div>
                      <input
                        type="number"
                        value={intervalHours}
                        onChange={(e) => setIntervalHours(e.target.value)}
                        min="0"
                        max="23"
                        placeholder="0"
                      />
                      <label>Hours</label>
                    </div>
                    <div>
                      <input
                        type="number"
                        value={intervalMinutes}
                        onChange={(e) => setIntervalMinutes(e.target.value)}
                        min="0"
                        max="59"
                        placeholder="0"
                      />
                      <label>Minutes</label>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="submit-btn">
                  {loading ? 'Creating...' : 'Create Schedule'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'manage' && (
            <div className="manage-schedules">
              <h3>Your Payment Schedules</h3>
              {loading && <p>Loading schedules...</p>}
              {schedules.length === 0 && !loading && (
                <p className="no-schedules">No payment schedules found. Create one to get started!</p>
              )}
              {schedules.map((schedule) => (
                <div key={schedule.id} className="schedule-card">
                  <div className="schedule-header">
                    <div>
                      <h4>Schedule #{schedule.id}</h4>
                      <span className={`status ${schedule.active ? 'active' : 'inactive'}`}>
                        {schedule.active ? '🟢 Active' : '🔴 Inactive'}
                      </span>
                    </div>
                    {schedule.active && (
                      <button
                        onClick={() => handleDeactivateSchedule(schedule.id)}
                        className="deactivate-btn"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                  <div className="schedule-details">
                    <div className="detail">
                      <span className="label">Recipient:</span>
                      <span className="value">{schedule.recipient.slice(0, 6)}...{schedule.recipient.slice(-4)}</span>
                    </div>
                    <div className="detail">
                      <span className="label">Amount:</span>
                      <span className="value">{schedule.amount} TST</span>
                    </div>
                    <div className="detail">
                      <span className="label">Interval:</span>
                      <span className="value">{formatInterval(schedule.interval)}</span>
                    </div>
                    <div className="detail">
                      <span className="label">Next Payment:</span>
                      <span className="value">{formatTimeUntilNext(schedule.nextPayment)}</span>
                    </div>
                    <div className="detail">
                      <span className="label">Total Paid:</span>
                      <span className="value">{schedule.totalPaid} TST</span>
                    </div>
                    <div className="detail">
                      <span className="label">Payments Made:</span>
                      <span className="value">{schedule.paymentCount}</span>
                    </div>
                  </div>
                  {schedule.active && schedule.nextPayment <= Math.floor(Date.now() / 1000) && (
                    <button
                      onClick={() => handleExecutePayment(schedule.id)}
                      className="execute-btn"
                    >
                      Execute Payment Now
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

export default AutomaticPaymentDapp;

