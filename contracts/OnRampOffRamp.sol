// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title OnRampOffRamp - Custom OnRamp/OffRamp Contract
 * @dev Allows users to request onramp (buy tokens) and offramp (sell tokens for cash)
 */
contract OnRampOffRamp {
    IERC20 public token;
    address public owner;
    address public treasuryWallet; // Wallet to receive tokens for offramp
    string public paymentDetails; // Payment details (bank account, phone number, etc.)
    
    enum RequestType { OnRamp, OffRamp }
    enum RequestStatus { Pending, Approved, Rejected, Completed, Cancelled }
    
    struct Request {
        uint256 id;
        address user;
        RequestType requestType;
        RequestStatus status;
        uint256 amount; // Token amount
        uint256 fiatAmount; // Fiat amount in cents (e.g., 10000 = $100.00)
        string currency; // USD, EUR, etc.
        string paymentMethod; // Bank transfer, Mobile money, etc.
        string paymentDetails; // User's payment details (account number, phone, etc.)
        address walletAddress; // For onramp: user's wallet to receive tokens
        string userNotes; // Additional notes from user
        string adminNotes; // Notes from admin
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    mapping(uint256 => Request) public requests;
    mapping(address => uint256[]) public userRequests; // user => request IDs
    uint256 public requestCount;
    
    // Limits and fees
    uint256 public minOnRampAmount; // Minimum token amount for onramp
    uint256 public maxOnRampAmount; // Maximum token amount for onramp
    uint256 public minOffRampAmount; // Minimum token amount for offramp
    uint256 public maxOffRampAmount; // Maximum token amount for offramp
    uint256 public onRampFeePercent; // Fee percentage (e.g., 200 = 2%)
    uint256 public offRampFeePercent; // Fee percentage
    
    // Exchange rate (tokens per dollar, with decimals)
    // e.g., 1000000 = 1 token per dollar (with 6 decimals)
    uint256 public exchangeRate;
    uint256 public constant RATE_DECIMALS = 1e6;
    
    event RequestCreated(
        uint256 indexed requestId,
        address indexed user,
        RequestType requestType,
        uint256 amount,
        uint256 fiatAmount
    );
    
    event RequestStatusChanged(
        uint256 indexed requestId,
        RequestStatus oldStatus,
        RequestStatus newStatus,
        string adminNotes
    );
    
    event OnRampCompleted(
        uint256 indexed requestId,
        address indexed user,
        uint256 tokenAmount
    );
    
    event OffRampCompleted(
        uint256 indexed requestId,
        address indexed user,
        uint256 tokenAmount,
        uint256 fiatAmount
    );
    
    event PaymentDetailsUpdated(string newPaymentDetails);
    event ExchangeRateUpdated(uint256 newRate);
    event TreasuryWalletUpdated(address newTreasury);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier validRequest(uint256 requestId) {
        require(requests[requestId].id != 0, "Request does not exist");
        _;
    }
    
    constructor(
        address _token,
        address _treasuryWallet,
        string memory _paymentDetails,
        uint256 _exchangeRate
    ) {
        token = IERC20(_token);
        owner = msg.sender;
        treasuryWallet = _treasuryWallet;
        paymentDetails = _paymentDetails;
        exchangeRate = _exchangeRate;
        
        // Default limits
        minOnRampAmount = 10 * 1e18; // 10 tokens
        maxOnRampAmount = 100000 * 1e18; // 100,000 tokens
        minOffRampAmount = 10 * 1e18; // 10 tokens
        maxOffRampAmount = 100000 * 1e18; // 100,000 tokens
        onRampFeePercent = 200; // 2%
        offRampFeePercent = 200; // 2%
    }
    
    /**
     * @dev Create an onramp request (user wants to buy tokens)
     * User will send fiat to payment details, then request tokens
     */
    function createOnRampRequest(
        uint256 tokenAmount,
        string memory currency,
        string memory paymentMethod,
        string memory paymentDetailsUser,
        address walletAddress,
        string memory notes
    ) external returns (uint256) {
        require(tokenAmount >= minOnRampAmount, "Amount too low");
        require(tokenAmount <= maxOnRampAmount, "Amount too high");
        require(walletAddress != address(0), "Invalid wallet address");
        require(bytes(paymentDetailsUser).length > 0, "Payment details required");
        
        // Calculate fiat amount based on exchange rate
        uint256 fiatAmount = (tokenAmount * 1e6) / exchangeRate; // Convert to cents
        
        uint256 requestId = ++requestCount;
        requests[requestId] = Request({
            id: requestId,
            user: msg.sender,
            requestType: RequestType.OnRamp,
            status: RequestStatus.Pending,
            amount: tokenAmount,
            fiatAmount: fiatAmount,
            currency: currency,
            paymentMethod: paymentMethod,
            paymentDetails: paymentDetailsUser,
            walletAddress: walletAddress,
            userNotes: notes,
            adminNotes: "",
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        
        userRequests[msg.sender].push(requestId);
        
        emit RequestCreated(requestId, msg.sender, RequestType.OnRamp, tokenAmount, fiatAmount);
        return requestId;
    }
    
    /**
     * @dev Create an offramp request (user wants to sell tokens for cash)
     * Note: User should send tokens to treasury wallet BEFORE creating this request
     * This function only records the request, it doesn't transfer tokens
     */
    function createOffRampRequest(
        uint256 tokenAmount,
        string memory currency,
        string memory paymentMethod,
        string memory paymentDetailsUser,
        string memory notes
    ) external returns (uint256) {
        require(tokenAmount >= minOffRampAmount, "Amount too low");
        require(tokenAmount <= maxOffRampAmount, "Amount too high");
        require(bytes(paymentDetailsUser).length > 0, "Payment details required");
        
        // Note: Tokens should already be sent to treasury wallet by user
        // We don't transfer tokens here, just record the request
        
        // Calculate fiat amount (with fee deduction)
        uint256 fee = (tokenAmount * offRampFeePercent) / 10000;
        uint256 amountAfterFee = tokenAmount - fee;
        uint256 fiatAmount = (amountAfterFee * 1e6) / exchangeRate; // Convert to cents
        
        uint256 requestId = ++requestCount;
        requests[requestId] = Request({
            id: requestId,
            user: msg.sender,
            requestType: RequestType.OffRamp,
            status: RequestStatus.Pending,
            amount: tokenAmount,
            fiatAmount: fiatAmount,
            currency: currency,
            paymentMethod: paymentMethod,
            paymentDetails: paymentDetailsUser,
            walletAddress: address(0),
            userNotes: notes,
            adminNotes: "",
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        
        userRequests[msg.sender].push(requestId);
        
        emit RequestCreated(requestId, msg.sender, RequestType.OffRamp, tokenAmount, fiatAmount);
        return requestId;
    }
    
    /**
     * @dev Admin: Approve an onramp request and send tokens to user
     */
    function approveOnRampRequest(uint256 requestId, string memory adminNotes) 
        external 
        onlyOwner 
        validRequest(requestId) 
    {
        Request storage request = requests[requestId];
        require(request.requestType == RequestType.OnRamp, "Not an onramp request");
        require(request.status == RequestStatus.Pending, "Request not pending");
        
        request.status = RequestStatus.Approved;
        request.adminNotes = adminNotes;
        request.updatedAt = block.timestamp;
        
        // Calculate amount with fee
        uint256 fee = (request.amount * onRampFeePercent) / 10000;
        uint256 amountToSend = request.amount - fee;
        
        // Send tokens from treasury wallet to user's wallet address
        // Note: Treasury wallet should have approved this contract to spend tokens
        require(
            token.transferFrom(treasuryWallet, request.walletAddress, amountToSend),
            "Token transfer failed"
        );
        
        // Fee stays in treasury wallet (already there)
        
        request.status = RequestStatus.Completed;
        
        emit RequestStatusChanged(requestId, RequestStatus.Pending, RequestStatus.Approved, adminNotes);
        emit OnRampCompleted(requestId, request.user, amountToSend);
    }
    
    /**
     * @dev Admin: Approve an offramp request
     * Note: Tokens should already be in treasury wallet (sent by user before creating request)
     * Admin should send cash to user's payment details, then approve this request
     */
    function approveOffRampRequest(uint256 requestId, string memory adminNotes) 
        external 
        onlyOwner 
        validRequest(requestId) 
    {
        Request storage request = requests[requestId];
        require(request.requestType == RequestType.OffRamp, "Not an offramp request");
        require(request.status == RequestStatus.Pending, "Request not pending");
        
        request.status = RequestStatus.Approved;
        request.adminNotes = adminNotes;
        request.updatedAt = block.timestamp;
        
        // Note: Tokens are already in treasury wallet (sent by user)
        // Admin should have already sent cash to user's payment details
        // This just marks the request as completed
        
        request.status = RequestStatus.Completed;
        
        emit RequestStatusChanged(requestId, RequestStatus.Pending, RequestStatus.Approved, adminNotes);
        emit OffRampCompleted(requestId, request.user, request.amount, request.fiatAmount);
    }
    
    /**
     * @dev Admin: Reject a request
     */
    function rejectRequest(uint256 requestId, string memory adminNotes) 
        external 
        onlyOwner 
        validRequest(requestId) 
    {
        Request storage request = requests[requestId];
        require(request.status == RequestStatus.Pending, "Request not pending");
        
        RequestStatus oldStatus = request.status;
        request.status = RequestStatus.Rejected;
        request.adminNotes = adminNotes;
        request.updatedAt = block.timestamp;
        
        // Note: For offramp, tokens were already sent to treasury wallet
        // Admin would need to manually refund if needed
        
        emit RequestStatusChanged(requestId, oldStatus, RequestStatus.Rejected, adminNotes);
    }
    
    /**
     * @dev User: Cancel their own pending request
     */
    function cancelRequest(uint256 requestId) external validRequest(requestId) {
        Request storage request = requests[requestId];
        require(request.user == msg.sender, "Not your request");
        require(request.status == RequestStatus.Pending, "Request not pending");
        
        RequestStatus oldStatus = request.status;
        request.status = RequestStatus.Cancelled;
        request.updatedAt = block.timestamp;
        
        // Note: For offramp, tokens were already sent to treasury wallet
        // User would need to contact admin for refund if needed
        
        emit RequestStatusChanged(requestId, oldStatus, RequestStatus.Cancelled, "");
    }
    
    /**
     * @dev Admin: Update payment details
     */
    function updatePaymentDetails(string memory newPaymentDetails) external onlyOwner {
        paymentDetails = newPaymentDetails;
        emit PaymentDetailsUpdated(newPaymentDetails);
    }
    
    /**
     * @dev Admin: Update exchange rate
     */
    function updateExchangeRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be > 0");
        exchangeRate = newRate;
        emit ExchangeRateUpdated(newRate);
    }
    
    /**
     * @dev Admin: Update treasury wallet
     */
    function updateTreasuryWallet(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        treasuryWallet = newTreasury;
        emit TreasuryWalletUpdated(newTreasury);
    }
    
    /**
     * @dev Admin: Update limits
     */
    function updateLimits(
        uint256 _minOnRamp,
        uint256 _maxOnRamp,
        uint256 _minOffRamp,
        uint256 _maxOffRamp
    ) external onlyOwner {
        minOnRampAmount = _minOnRamp;
        maxOnRampAmount = _maxOnRamp;
        minOffRampAmount = _minOffRamp;
        maxOffRampAmount = _maxOffRamp;
    }
    
    /**
     * @dev Admin: Update fees
     */
    function updateFees(uint256 _onRampFee, uint256 _offRampFee) external onlyOwner {
        require(_onRampFee <= 1000, "Fee too high"); // Max 10%
        require(_offRampFee <= 1000, "Fee too high");
        onRampFeePercent = _onRampFee;
        offRampFeePercent = _offRampFee;
    }
    
    /**
     * @dev Get user's requests
     */
    function getUserRequests(address user) external view returns (uint256[] memory) {
        return userRequests[user];
    }
    
    /**
     * @dev Get request details
     */
    function getRequest(uint256 requestId) external view returns (Request memory) {
        return requests[requestId];
    }
    
    /**
     * @dev Calculate fiat amount for token amount (for onramp)
     */
    function calculateFiatAmount(uint256 tokenAmount) external view returns (uint256) {
        return (tokenAmount * 1e6) / exchangeRate;
    }
    
    /**
     * @dev Calculate token amount for fiat amount (for display)
     */
    function calculateTokenAmount(uint256 fiatAmountCents) external view returns (uint256) {
        return (fiatAmountCents * exchangeRate) / 1e6;
    }
    
    
    /**
     * @dev Emergency: Withdraw tokens (only owner)
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(token.transfer(owner, amount), "Transfer failed");
    }
}

