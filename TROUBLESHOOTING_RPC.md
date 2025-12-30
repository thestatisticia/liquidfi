# RPC Endpoint Troubleshooting Guide

## Error: "RPC endpoint not found or unavailable"

This error occurs when MetaMask cannot connect to the Base Sepolia RPC endpoint. Here's how to fix it:

## Quick Fixes

### Option 1: Re-add Base Sepolia Network in MetaMask

1. **Open MetaMask**
2. **Click the network dropdown** (top of MetaMask)
3. **Click "Add network"** or **"Add a network manually"**
4. **Enter these details**:
   - **Network Name**: `Base Sepolia`
   - **RPC URL**: `https://base-sepolia-rpc.publicnode.com`
   - **Chain ID**: `84532`
   - **Currency Symbol**: `ETH`
   - **Block Explorer**: `https://sepolia.basescan.org`
5. **Click "Save"**
6. **Switch to Base Sepolia network**
7. **Try your transaction again**

### Option 2: Use Alternative RPC Endpoints

If the default RPC is down, try these alternatives:

**Option A: PublicNode**
```
https://base-sepolia-rpc.publicnode.com
```

**Option B: Alchemy (Public Demo)**
```
https://base-sepolia.g.alchemy.com/v2/demo
```

**Option C: Base Official**
```
https://sepolia.base.org
```

**Option D: QuickNode (if you have an account)**
```
https://your-endpoint.base-sepolia.quiknode.pro/your-key/
```

### Option 3: Update Network in MetaMask

1. **Open MetaMask Settings**
2. **Go to "Networks"**
3. **Find "Base Sepolia"** (if it exists)
4. **Click "Edit"**
5. **Update the RPC URL** to one of the alternatives above
6. **Save and try again**

### Option 4: Clear MetaMask Cache

1. **Close all browser tabs with MetaMask**
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Restart browser**
4. **Re-open MetaMask**
5. **Re-add Base Sepolia network** (see Option 1)

## Manual Network Configuration

If automatic network switching fails, manually add Base Sepolia:

### MetaMask Network Details

```json
{
  "chainId": "0x14A34",
  "chainName": "Base Sepolia",
  "nativeCurrency": {
    "name": "Ethereum",
    "symbol": "ETH",
    "decimals": 18
  },
  "rpcUrls": [
    "https://base-sepolia-rpc.publicnode.com",
    "https://sepolia.base.org",
    "https://base-sepolia.g.alchemy.com/v2/demo"
  ],
  "blockExplorerUrls": [
    "https://sepolia.basescan.org"
  ]
}
```

## Verify Network Connection

After adding the network, verify it's working:

1. **Check your ETH balance** - Should show test ETH
2. **Check network status** - Should show "Base Sepolia" in MetaMask
3. **Try a simple transaction** - Send a small amount of ETH to yourself

## Common Issues

### Issue: "Network not found"
**Solution**: Make sure Chain ID is exactly `84532` (0x14A34 in hex)

### Issue: "RPC endpoint unavailable"
**Solution**: Try a different RPC URL from the list above

### Issue: "Transaction fails immediately"
**Solution**: 
- Check you have enough ETH for gas
- Verify you're on Base Sepolia network
- Try refreshing the page

### Issue: "Network keeps switching back"
**Solution**: 
- Disable other browser extensions
- Clear MetaMask cache
- Re-add the network

## Testing RPC Endpoints

You can test if an RPC endpoint is working:

```javascript
// In browser console
fetch('https://base-sepolia-rpc.publicnode.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1
  })
})
.then(r => r.json())
.then(console.log)
```

If you get a response with a block number, the RPC is working!

## Still Having Issues?

1. **Check Base Sepolia status**: https://status.base.org
2. **Try a different browser** (Chrome, Firefox, Brave)
3. **Update MetaMask** to the latest version
4. **Check MetaMask logs**: Settings → Advanced → Show logs

## Updated Configuration

The app has been updated to use `https://base-sepolia-rpc.publicnode.com` as the primary RPC endpoint. If you're still having issues:

1. **Refresh the app** (Ctrl+R or Cmd+R)
2. **Reconnect your wallet**
3. **Try the transaction again**

---

**Need more help?** Check the Base Sepolia documentation: https://docs.base.org/docs/tools/network-faucets/











