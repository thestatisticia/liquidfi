# Buy/Sell Feature (OnRamp/OffRamp) - Complete Summary

## Overview
A comprehensive onramp/offramp system integrated into the LiquidFi DApp that allows users to buy and sell tokens using fiat currencies (USD, UGX, KES) through mobile money and other payment methods.

## Buy/Sell Feature (User-Facing)

### Functionality
- **Buy Tokens (OnRamp)**: Users can purchase TST tokens by sending fiat currency (mobile money, bank transfer, etc.)
- **Sell Tokens (OffRamp)**: Users can sell TST tokens and receive fiat currency in their mobile money account

### Key Features
1. **Quote System**: Users can get a detailed quote before creating an order, showing:
   - Token amount
   - Base USD amount
   - Fee percentage and amount
   - Total amount in selected currency (USD, UGX, or KES)
   - Exchange rates: 1 USD = 3500 UGX, 1 USD = 128 KES

2. **Form Fields**:
   - Token amount (TST) with min/max validation
   - Currency selection (USD, UGX, KES)
   - Payment method (Mobile Money, Bank Transfer, etc.)
   - Phone number (for sending/receiving mobile money)
   - Wallet address (optional, defaults to connected wallet for onramp)

3. **Payment Details**:
   - **OnRamp**: Users enter their phone number (sending from) and send money to: +256786430457
   - **OffRamp**: Users enter their phone number (receiving cash)

4. **Order Creation**:
   - Creates a smart contract request
   - Triggers MetaMask for transaction confirmation
   - Stores request on-chain with all details

5. **User Request Management**:
   - View all their orders
   - See order status (Pending, Approved, Rejected, Completed, Cancelled)
   - Cancel pending requests
   - View fiat amounts in selected currency

### UI/UX Design
- **Dark Theme**: Matches app's dark theme with:
  - Background: `#0f1429` (dark blue-gray)
  - Text: White/light gray
  - Borders: Subtle white with opacity
  - Focus states: Blue glow effect

- **Layout**:
  - Full-width container (1600px max-width, matching navbar)
  - Large, prominent Buy/Sell buttons with gradient active states
  - Spacious form with 50px padding
  - Large input fields (56px height, 18px font size)
  - Clear visual hierarchy with larger headings (32px)

- **Input Fields**:
  - Dark background (`#0f1429`) matching app theme
  - White text for readability
  - Subtle borders that glow blue on focus
  - Smooth transitions
  - Font smoothing for crisp text rendering

- **Buttons**:
  - Large, prominent buttons (20px font, 20px padding)
  - Gradient backgrounds for active states
  - Hover effects with shadows and transforms
  - Clear disabled states

- **Quote Display**:
  - Prominent card with green accent for totals
  - Clear breakdown of amounts
  - Color-coded values (green for success, red for fees)

## Admin Panel

### Functionality
- **Access Control**: Only accessible to admin wallet (`0x12214E5538915d17394f2d2F0c3733e9a32e61c1`)
- **Request Management**: View and manage all onramp/offramp requests

### Key Features
1. **Pending Requests Section**:
   - Highlighted with yellow border and warning icon
   - Shows count badge for pending requests
   - Displays all pending requests requiring action

2. **Request Details Display**:
   - Request ID and status badge
   - Type (OnRamp/OffRamp)
   - User wallet address
   - Token amount (highlighted in blue)
   - Fiat amount (highlighted in green, converted to selected currency)
   - Payment method and currency
   - Payment details (phone number)
   - Wallet address (for onramp)
   - User notes (if provided)
   - Timestamps

3. **Admin Actions**:
   - **Mark as Complete (Approve)**:
     - For OnRamp: Transfers tokens from treasury wallet to user's wallet
     - For OffRamp: Marks request as completed (cash already sent)
     - Pre-flight checks: Validates treasury wallet has enough tokens and approval
     - Clear error messages if validation fails
   - **Reject**: Marks request as rejected with admin notes
   - **Admin Notes**: Text area to add notes when approving/rejecting

4. **All Requests View**:
   - Compact list of all requests
   - Status badges with color coding
   - Quick overview of amounts
   - Hover effects for better UX

5. **Auto-Refresh**:
   - Polls contract every 3 seconds for new requests
   - Manual refresh button available
   - Real-time updates

### UI/UX Design
- **Header**: Gradient purple background with large title (48px)
- **Cards**: White cards with shadows on light gray background
- **Pending Requests**: Yellow border (4px) with shadow for emphasis
- **Request Cards**: 
  - Large padding (35px)
  - 3-column grid for details
  - Color-coded sections (blue for tokens, green for fiat)
  - Clear typography (18-24px fonts)
- **Buttons**:
  - Large approve/reject buttons (22px font, 20px padding)
  - Green for approve, red for reject
  - Enhanced hover effects with shadows
  - Disabled states when wallet not connected
- **Error/Success Messages**:
  - Prominent display with icons
  - Color-coded (red for errors, green for success)
  - Clear, actionable error messages

## Smart Contract Integration

### Contract Address
- Deployed at: `0x36Ae60Ba7Bb2Fe8106DF765F0729842aa06152e9`
- Network: Ethereum Sepolia (or configured network)

### Key Functions
1. **User Functions**:
   - `createOnRampRequest()`: Create buy order
   - `createOffRampRequest()`: Create sell order
   - `cancelRequest()`: Cancel pending request

2. **Admin Functions**:
   - `approveOnRampRequest()`: Approve and send tokens to user
   - `approveOffRampRequest()`: Mark offramp as completed
   - `rejectRequest()`: Reject a request

3. **View Functions**:
   - `getRequest()`: Get request details
   - `requestCount()`: Get total request count
   - `getUserRequests()`: Get user's request IDs

### Security Features
- Owner-only functions for admin actions
- Request validation (status, type checks)
- Token transfer validation (balance, allowance checks)
- Fee calculation and deduction

## Technical Implementation

### Frontend
- **Framework**: React with hooks
- **Blockchain**: Ethers.js v6
- **Wallet**: MetaMask integration via `useToken` hook
- **Styling**: CSS with CSS variables for theming
- **State Management**: React useState/useEffect

### Error Handling
- Pre-flight validation for treasury wallet balance/approval
- Clear error messages for common issues
- Transaction rejection handling
- Network error handling

### Currency Conversion
- Fixed exchange rates stored in constants
- USD as base currency
- Real-time conversion display
- Proper decimal handling for fiat amounts

## User Flow

### Buy Flow (OnRamp)
1. User selects "Buy Tokens"
2. Fills form: amount, currency, payment method, phone number
3. Clicks "Get Quote" to see breakdown
4. Reviews quote and clicks "Create Buy Order"
5. MetaMask popup for transaction
6. Request created and stored on-chain
7. Admin receives notification
8. Admin approves → tokens sent to user's wallet
9. User sees completed status

### Sell Flow (OffRamp)
1. User selects "Sell Tokens"
2. Fills form: amount, currency, payment method, phone number
3. Clicks "Get Quote" to see breakdown
4. Reviews quote and clicks "Create Sell Order"
5. MetaMask popup for transaction
6. Request created and stored on-chain
7. Admin receives notification
8. Admin sends cash to user's phone number
9. Admin approves → request marked as completed
10. User sees completed status

## Design Principles
- **Consistency**: Matches app's dark theme throughout
- **Clarity**: Large fonts, clear labels, prominent buttons
- **Feedback**: Loading states, success/error messages, hover effects
- **Accessibility**: High contrast, readable fonts, clear hierarchy
- **Responsiveness**: Full-width layout, proper spacing

