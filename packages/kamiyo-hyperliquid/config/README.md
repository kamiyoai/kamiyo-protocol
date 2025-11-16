# Hyperliquid Configuration

This module centralizes all Hyperliquid protocol addresses and configuration.

## HLP Vault Address

**Current configured address:** `0xdfc24b077bc1425ad1dea75bcb6f8158e10df303`

### Verification

To verify this is the correct official HLP vault address:

1. **Official Hyperliquid App:** Visit [app.hyperliquid.xyz/vaults](https://app.hyperliquid.xyz/vaults)
   - The main HLP vault should be listed
   - Click on "HLP" to see the vault details
   - The URL will show the vault address

2. **Hyperliquid Documentation:** Check the [official docs](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults)
   - Protocol vaults section describes HLP
   - Community resources may list official addresses

3. **On-chain Verification:**
   - HLP is a permissionless vault on Hyperliquid's L1
   - Verify using block explorers or official API

### HLP Sub-vaults

The HLP vault operates through multiple sub-vaults:

- **HLP Strategy A:** `0x010461c14e146ac35fe42271bdc1134ee31c703a`
- **HLP Strategy B:** `0x31ca8395cf837de08b24da3f660e77761dfb974b`
- **HLP Liquidator:** `0x2e3d94f0562703b25c83308a05046ddaf9a8dd14`

**Note:** These sub-vault addresses are community-reported and should be verified with the Hyperliquid team.

## Environment Variables

You can override the default HLP vault address using environment variables:

```bash
# Set custom HLP vault address
export HLP_VAULT_ADDRESS=0x...

# Add additional addresses to monitor (comma-separated)
export MONITORED_ADDRESSES=0xabc...,0xdef...,0x123...
```

## Usage

```python
from config.hyperliquid import HyperliquidConfig

# Get HLP vault address
vault_address = HyperliquidConfig.HLP_MAIN_VAULT

# Get all monitored addresses (includes HLP + env addresses)
addresses = HyperliquidConfig.get_monitored_addresses()

# Get vault URL
url = HyperliquidConfig.get_vault_url()
# Returns: https://app.hyperliquid.xyz/vaults/0xdfc24b077bc1425ad1dea75bcb6f8158e10df303

# Validate address format
is_valid = HyperliquidConfig.validate_address("0xdfc24b077bc1425ad1dea75bcb6f8158e10df303")
```

## Updates

If Hyperliquid launches new protocol vaults or changes addresses:

1. Update `config/hyperliquid.py` with the new official address
2. Update this README with verification sources
3. Document the change in git commit message
4. Test all monitors to ensure they work with new address

## Security Note

⚠️ **Always verify addresses before monitoring:**

- Incorrect addresses will result in empty/invalid data
- Could miss critical security events
- May waste API rate limits

When in doubt, contact the Hyperliquid team to confirm official addresses.

## References

- **Hyperliquid App:** https://app.hyperliquid.xyz
- **Documentation:** https://hyperliquid.gitbook.io/hyperliquid-docs
- **HLP Information:** https://medium.com/@hyperliquid/hyperliquidity-provider-hlp-democratizing-market-making-bb114b1dff0f
