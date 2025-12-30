// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TestStablecoin
 * @dev Simple ERC-20 stablecoin for testing on Base testnet
 * This is a mintable token for testing purposes only
 */
contract TestStablecoin {
    string public name = "Test Stablecoin";
    string public symbol = "TST";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    address public owner;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        totalSupply = 0;
    }

    /**
     * @dev Mint tokens (only owner for testing)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    /**
     * @dev Standard ERC-20 transfer
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "Invalid address");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @dev Standard ERC-20 approve
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @dev Standard ERC-20 transferFrom
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(from != address(0) && to != address(0), "Invalid address");
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
}
