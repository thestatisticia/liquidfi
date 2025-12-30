// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title PaymentSchedule
 * @dev Contract for managing automatic recurring payments in TST tokens
 */
contract PaymentSchedule {
    IERC20 public token;
    address public owner;
    
    struct Schedule {
        address creator;
        address recipient;
        uint256 amount;
        uint256 interval; // seconds between payments
        uint256 nextPayment; // timestamp of next payment
        bool active;
        uint256 totalPaid;
        uint256 paymentCount;
    }
    
    mapping(uint256 => Schedule) public schedules;
    mapping(address => uint256[]) public userSchedules; // user address => schedule IDs
    uint256 public scheduleCount;
    
    event ScheduleCreated(uint256 indexed scheduleId, address indexed creator, address recipient, uint256 amount, uint256 interval);
    event PaymentExecuted(uint256 indexed scheduleId, address recipient, uint256 amount);
    event ScheduleDeactivated(uint256 indexed scheduleId);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _token) {
        token = IERC20(_token);
        owner = msg.sender;
    }
    
    /**
     * @dev Create a new payment schedule
     * @param recipient Address to receive payments
     * @param amount Amount to pay each interval (in token units)
     * @param intervalSeconds Time between payments in seconds
     */
    function createSchedule(
        address recipient,
        uint256 amount,
        uint256 intervalSeconds
    ) external returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(intervalSeconds >= 60, "Interval must be at least 60 seconds");
        
        uint256 scheduleId = scheduleCount++;
        schedules[scheduleId] = Schedule({
            creator: msg.sender,
            recipient: recipient,
            amount: amount,
            interval: intervalSeconds,
            nextPayment: block.timestamp + intervalSeconds,
            active: true,
            totalPaid: 0,
            paymentCount: 0
        });
        
        userSchedules[msg.sender].push(scheduleId);
        
        emit ScheduleCreated(scheduleId, msg.sender, recipient, amount, intervalSeconds);
        return scheduleId;
    }
    
    /**
     * @dev Execute a payment for a schedule (anyone can call)
     * @param scheduleId ID of the schedule to execute
     */
    function executePayment(uint256 scheduleId) external {
        Schedule storage schedule = schedules[scheduleId];
        require(schedule.active, "Schedule not active");
        require(block.timestamp >= schedule.nextPayment, "Payment not due yet");
        
        // Check if creator has enough balance and allowance
        require(
            token.balanceOf(schedule.creator) >= schedule.amount,
            "Insufficient balance"
        );
        require(
            token.allowance(schedule.creator, address(this)) >= schedule.amount,
            "Insufficient allowance"
        );
        
        // Transfer tokens
        require(
            token.transferFrom(schedule.creator, schedule.recipient, schedule.amount),
            "Transfer failed"
        );
        
        // Update schedule
        schedule.totalPaid += schedule.amount;
        schedule.paymentCount++;
        schedule.nextPayment = block.timestamp + schedule.interval;
        
        emit PaymentExecuted(scheduleId, schedule.recipient, schedule.amount);
    }
    
    /**
     * @dev Deactivate a schedule (only creator can deactivate)
     * @param scheduleId ID of the schedule to deactivate
     */
    function deactivateSchedule(uint256 scheduleId) external {
        Schedule storage schedule = schedules[scheduleId];
        require(schedule.creator == msg.sender, "Not schedule creator");
        require(schedule.active, "Already inactive");
        
        schedule.active = false;
        emit ScheduleDeactivated(scheduleId);
    }
    
    /**
     * @dev Get all schedule IDs for a user
     * @param user Address of the user
     * @return Array of schedule IDs
     */
    function getUserSchedules(address user) external view returns (uint256[] memory) {
        return userSchedules[user];
    }
    
    /**
     * @dev Get schedule details
     * @param scheduleId ID of the schedule
     * @return Schedule struct
     */
    function getSchedule(uint256 scheduleId) external view returns (Schedule memory) {
        return schedules[scheduleId];
    }
    
    /**
     * @dev Check if a payment is due
     * @param scheduleId ID of the schedule
     * @return bool True if payment is due
     */
    function isPaymentDue(uint256 scheduleId) external view returns (bool) {
        Schedule memory schedule = schedules[scheduleId];
        return schedule.active && block.timestamp >= schedule.nextPayment;
    }
}











