// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title StreamingPayment
 * @dev Contract for streaming payments that accumulate per second
 */
contract StreamingPayment {
    IERC20 public token;
    
    struct Stream {
        address creator;
        uint256 totalAmount; // Total amount locked in contract
        uint256 durationHours; // Duration in hours
        uint256 startTime; // When streaming starts
        uint256 stopTime; // When streaming stops
        bool active;
    }
    
    struct Recipient {
        address recipient;
        uint256 amount; // Total amount for this recipient
        uint256 claimedAmount; // Amount already claimed
        bool active; // Whether recipient is still active
    }
    
    mapping(uint256 => Stream) public streams;
    mapping(uint256 => mapping(address => Recipient)) public streamRecipients; // streamId => recipient => Recipient
    mapping(uint256 => address[]) public streamRecipientList; // streamId => list of recipient addresses
    mapping(address => uint256[]) public recipientStreams; // recipient => stream IDs
    mapping(address => uint256[]) public creatorStreams; // creator => stream IDs
    
    uint256 public streamCount;
    
    event StreamCreated(
        uint256 indexed streamId,
        address indexed creator,
        uint256 totalAmount,
        uint256 durationHours,
        uint256 startTime,
        uint256 stopTime
    );
    
    event RecipientAdded(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );
    
    event RecipientRemoved(
        uint256 indexed streamId,
        address indexed recipient
    );
    
    event PaymentClaimed(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );
    
    event StreamCancelled(uint256 indexed streamId);
    
    constructor(address _token) {
        token = IERC20(_token);
    }
    
    /**
     * @dev Create a streaming payment with recipients and their amounts
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts for each recipient (in same order)
     * @param durationHours Duration of the stream in hours
     */
    function createStream(
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 durationHours
    ) external returns (uint256) {
        require(recipients.length > 0, "No recipients");
        require(recipients.length == amounts.length, "Mismatched arrays");
        require(durationHours > 0, "Duration must be > 0");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Amount must be > 0");
            totalAmount += amounts[i];
        }
        
        // Transfer tokens from creator to contract
        require(
            token.transferFrom(msg.sender, address(this), totalAmount),
            "Transfer failed"
        );
        
        uint256 streamId = streamCount++;
        uint256 startTime = block.timestamp;
        uint256 stopTime = startTime + (durationHours * 3600); // Convert hours to seconds
        
        streams[streamId] = Stream({
            creator: msg.sender,
            totalAmount: totalAmount,
            durationHours: durationHours,
            startTime: startTime,
            stopTime: stopTime,
            active: true
        });
        
        // Add recipients
        for (uint256 i = 0; i < recipients.length; i++) {
            streamRecipients[streamId][recipients[i]] = Recipient({
                recipient: recipients[i],
                amount: amounts[i],
                claimedAmount: 0,
                active: true
            });
            streamRecipientList[streamId].push(recipients[i]);
            recipientStreams[recipients[i]].push(streamId);
            emit RecipientAdded(streamId, recipients[i], amounts[i]);
        }
        
        creatorStreams[msg.sender].push(streamId);
        
        emit StreamCreated(streamId, msg.sender, totalAmount, durationHours, startTime, stopTime);
        
        return streamId;
    }
    
    /**
     * @dev Remove a recipient from a stream (only creator)
     * @param streamId ID of the stream
     * @param recipient Address to remove
     */
    function removeRecipient(uint256 streamId, address recipient) external {
        Stream storage stream = streams[streamId];
        require(stream.creator == msg.sender, "Not creator");
        require(stream.active, "Stream not active");
        
        Recipient storage recipientData = streamRecipients[streamId][recipient];
        require(recipientData.recipient == recipient, "Recipient not found");
        require(recipientData.active, "Recipient already removed");
        
        // Calculate accumulated and unclaimed amount for this recipient
        uint256 currentTime = block.timestamp;
        uint256 endTime = currentTime < stream.stopTime ? currentTime : stream.stopTime;
        uint256 startTime = stream.startTime;
        
        uint256 accumulated = 0;
        if (endTime > startTime) {
            uint256 elapsed = endTime - startTime;
            uint256 totalDuration = stream.stopTime - stream.startTime;
            accumulated = (recipientData.amount * elapsed) / totalDuration;
            if (accumulated > recipientData.amount) {
                accumulated = recipientData.amount;
            }
        }
        
        uint256 unclaimed = recipientData.amount - recipientData.claimedAmount - accumulated;
        
        // Mark recipient as inactive
        recipientData.active = false;
        
        // Refund unclaimed amount to creator
        if (unclaimed > 0) {
            require(
                token.transfer(stream.creator, unclaimed),
                "Refund failed"
            );
        }
        
        emit RecipientRemoved(streamId, recipient);
    }
    
    /**
     * @dev Get the accumulated balance for a recipient in a stream
     * @param streamId ID of the stream
     * @param recipient Address of the recipient
     */
    function getAccumulatedBalance(uint256 streamId, address recipient) public view returns (uint256) {
        Stream memory stream = streams[streamId];
        Recipient memory recipientData = streamRecipients[streamId][recipient];
        
        // Return 0 if recipient doesn't exist or is inactive (don't revert)
        if (recipientData.recipient != recipient || !recipientData.active) {
            return 0;
        }
        
        if (!stream.active) {
            return 0;
        }
        
        uint256 currentTime = block.timestamp;
        uint256 endTime = currentTime < stream.stopTime ? currentTime : stream.stopTime;
        uint256 startTime = stream.startTime;
        
        if (endTime <= startTime) {
            return 0;
        }
        
        uint256 elapsed = endTime - startTime;
        uint256 totalDuration = stream.stopTime - stream.startTime;
        
        // Calculate accumulated amount based on elapsed time
        uint256 accumulated = (recipientData.amount * elapsed) / totalDuration;
        
        // Cap at total amount minus already claimed
        uint256 maxClaimable = recipientData.amount - recipientData.claimedAmount;
        if (accumulated > maxClaimable) {
            accumulated = maxClaimable;
        }
        
        return accumulated;
    }
    
    /**
     * @dev Claim accumulated payment from a stream
     * @param streamId ID of the stream
     */
    function claimPayment(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        require(stream.active, "Stream not active");
        
        Recipient storage recipientData = streamRecipients[streamId][msg.sender];
        require(recipientData.recipient == msg.sender, "Not a recipient");
        require(recipientData.active, "Recipient removed");
        
        uint256 claimable = getAccumulatedBalance(streamId, msg.sender);
        require(claimable > 0, "Nothing to claim");
        
        // Update claimed amount
        recipientData.claimedAmount += claimable;
        stream.totalAmount -= claimable;
        
        // Transfer tokens
        require(
            token.transfer(msg.sender, claimable),
            "Transfer failed"
        );
        
        emit PaymentClaimed(streamId, msg.sender, claimable);
    }
    
    /**
     * @dev Cancel a stream and return remaining tokens to creator (only creator)
     * @param streamId ID of the stream
     */
    function cancelStream(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        require(stream.creator == msg.sender, "Not creator");
        require(stream.active, "Already cancelled");
        
        stream.active = false;
        
        // Calculate total remaining amount
        uint256 totalRemaining = stream.totalAmount;
        address[] memory recipients = streamRecipientList[streamId];
        
        for (uint256 i = 0; i < recipients.length; i++) {
            Recipient memory recipientData = streamRecipients[streamId][recipients[i]];
            if (recipientData.active) {
                uint256 accumulated = getAccumulatedBalance(streamId, recipients[i]);
                totalRemaining -= (recipientData.claimedAmount + accumulated);
            } else {
                // Already removed, subtract their claimed amount
                totalRemaining -= recipientData.claimedAmount;
            }
        }
        
        if (totalRemaining > 0) {
            require(
                token.transfer(stream.creator, totalRemaining),
                "Refund failed"
            );
        }
        
        emit StreamCancelled(streamId);
    }
    
    /**
     * @dev Get all stream IDs for a recipient
     */
    function getRecipientStreams(address recipient) external view returns (uint256[] memory) {
        return recipientStreams[recipient];
    }
    
    /**
     * @dev Get all stream IDs for a creator
     */
    function getCreatorStreams(address creator) external view returns (uint256[] memory) {
        return creatorStreams[creator];
    }
    
    /**
     * @dev Get recipients for a stream
     */
    function getStreamRecipients(uint256 streamId) external view returns (address[] memory) {
        return streamRecipientList[streamId];
    }
    
    /**
     * @dev Get recipient details
     */
    function getRecipientDetails(uint256 streamId, address recipient) external view returns (Recipient memory) {
        return streamRecipients[streamId][recipient];
    }
}
