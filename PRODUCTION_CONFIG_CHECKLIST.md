# Production Configuration Checklist
## KAMIYO x402 Infrastructure

**Generated**: November 9, 2025
**Status**: Ready for configuration

---

## Quick Start

Three main configuration tasks:
1. **Configure Python Verifier** (30 minutes)
2. **Set up Sentry** (10 minutes)
3. **Configure UptimeRobot** (15 minutes)

All necessary values have been generated in:
- `.env.verifier.render` - Python verifier environment variables
- `.env.frontend.render` - Frontend environment variables

---

## Task 1: Configure Python Verifier in Render ⏳

### Step 1: Get Alchemy API Key (5 minutes)

1. Go to https://www.alchemy.com/
2. Sign up or log in
3. Create new app:
   - Name: "KAMIYO x402 Production"
   - Chain: Base (Mainnet)
4. Copy API key
5. Repeat for Ethereum chain (or use same key)

### Step 2: Set Your Wallet Addresses (2 minutes)

You need 3 wallet addresses where customers will send USDC payments:

1. **Base wallet**: Any Base-compatible wallet (MetaMask works)
2. **Ethereum wallet**: Can be same as Base wallet
3. **Solana wallet**: Phantom or Solflare wallet

**IMPORTANT**: You must control these wallets!

### Step 3: Configure Verifier in Render (10 minutes)

1. Go to https://dashboard.render.com
2. Find service: `kamiyo-x402-verifier`
3. Click **Environment** tab
4. Add variables from `.env.verifier.render`:

```bash
PYTHON_VERIFIER_KEY=r3jwihhzG0ls6c5H4ZKLiiewa67LTh2roSocl2GaGv0=

# Replace YOUR_ALCHEMY_KEY with your actual key from Step 1
X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
X402_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Replace with your actual wallet addresses from Step 2
X402_BASE_PAYMENT_ADDRESS=0xYourBaseWalletAddress
X402_ETHEREUM_PAYMENT_ADDRESS=0xYourEthereumWalletAddress
X402_SOLANA_PAYMENT_ADDRESS=YourSolanaWalletAddress

# Leave this for now, will update after Sentry setup
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

5. Click **Save Changes**
6. Wait for service to redeploy (~2 minutes)

### Step 4: Verify Verifier is Running (2 minutes)

1. Once deployed, visit: https://kamiyo-x402-verifier.onrender.com/health
2. Should see JSON response:
```json
{
  "status": "ok",
  "service": "x402-verifier",
  "supported_chains": ["base", "ethereum", "solana"]
}
```

3. ✅ If you see this, verifier is working!

---

## Task 2: Set Up Sentry Error Tracking ⏳

### Step 1: Create Sentry Account (3 minutes)

1. Go to https://sentry.io/signup/
2. Sign up (free tier: 5,000 errors/month)
3. Create organization: **KAMIYO**

### Step 2: Create Project (2 minutes)

1. Click **Create Project**
2. Platform: **Next.js**
3. Project name: **x402-infrastructure**
4. Click **Create Project**

### Step 3: Get DSN (1 minute)

1. You'll see setup instructions
2. Copy the DSN (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)
3. Save it somewhere

### Step 4: Add to Render Services (5 minutes)

**For Python Verifier**:
1. Go to https://dashboard.render.com
2. Service: `kamiyo-x402-verifier`
3. Environment tab
4. Find `SENTRY_DSN` and update with your actual DSN
5. Save

**For Frontend**:
1. Service: `kamiyo-frontend`
2. Environment tab
3. Add these variables from `.env.frontend.render`:
```bash
PYTHON_VERIFIER_KEY=r3jwihhzG0ls6c5H4ZKLiiewa67LTh2roSocl2GaGv0=
SENTRY_DSN=<your-actual-sentry-dsn>
NEXT_PUBLIC_SENTRY_DSN=<your-actual-sentry-dsn>
```
4. Save

### Step 5: Test Sentry (2 minutes)

1. Run monitoring test:
```bash
node scripts/test_monitoring.js
```

2. Check Sentry dashboard at https://sentry.io
3. Should see test error appear
4. ✅ If you see it, Sentry is working!

---

## Task 3: Configure UptimeRobot Monitoring ⏳

### Step 1: Create Account (2 minutes)

1. Go to https://uptimerobot.com/signUp
2. Sign up (free: 50 monitors, 5-min checks)
3. Verify email

### Step 2: Add Main App Monitor (5 minutes)

1. Click **Add New Monitor**
2. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: KAMIYO x402 - Main App
   - **URL**: `https://kamiyo.ai/api/v1/x402/health`
   - **Monitoring Interval**: 5 minutes
   - **Monitor Timeout**: 30 seconds
   - **Alert When Down For**: 2 minutes (2 checks)

3. Click **Create Monitor**

### Step 3: Add Verifier Monitor (5 minutes)

1. Click **Add New Monitor** again
2. Configure:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: KAMIYO x402 - Python Verifier
   - **URL**: `https://kamiyo-x402-verifier.onrender.com/health`
   - **Monitoring Interval**: 5 minutes
   - **Monitor Timeout**: 30 seconds
   - **Alert When Down For**: 2 minutes

3. Click **Create Monitor**

### Step 4: Add Alert Contacts (3 minutes)

1. Go to **My Settings** > **Alert Contacts**
2. Click **Add Alert Contact**
3. Type: **E-mail**
4. Email: `dev@kamiyo.ai`
5. Verify email
6. Enable for both monitors
7. ✅ Done!

---

## Optional: Set Up Email Alerts

If you want custom email alerts (beyond UptimeRobot):

### Step 1: Get Resend API Key (5 minutes)

1. Go to https://resend.com/signup
2. Create account
3. Create API key
4. Copy key (starts with `re_`)

### Step 2: Verify Domain (Optional)

1. Add domain: `kamiyo.ai`
2. Add DNS records (provided by Resend)
3. Verify ownership

Or use Resend's test mode for now.

### Step 3: Add to Frontend (2 minutes)

1. Render dashboard > `kamiyo-frontend`
2. Environment tab
3. Add from `.env.frontend.render`:
```bash
RESEND_API_KEY=re_your_actual_key
ALERT_EMAIL=dev@kamiyo.ai
FROM_EMAIL=alerts@kamiyo.ai
```
4. Save

---

## Final Verification

### Check All Services

Run these commands to verify everything is working:

```bash
# Test verifier health
curl https://kamiyo-x402-verifier.onrender.com/health

# Test main app health
curl https://kamiyo.ai/api/v1/x402/health

# Test monitoring setup
node scripts/test_monitoring.js
```

### Expected Results

All should return HTTP 200 with JSON response.

---

## Completion Checklist

- [ ] Alchemy API key obtained
- [ ] Wallet addresses configured
- [ ] Python verifier environment variables set in Render
- [ ] Verifier health endpoint returns 200 OK
- [ ] Sentry account created
- [ ] Sentry DSN added to both services
- [ ] Test error appears in Sentry dashboard
- [ ] UptimeRobot account created
- [ ] Main app monitor added
- [ ] Verifier monitor added
- [ ] Email alerts configured
- [ ] All health checks passing

---

## What's Next?

Once all checkboxes are complete:

1. Monitor services for 24 hours
2. Check Sentry for any errors
3. Verify UptimeRobot sends alerts when services are down
4. Test payment verification with real transaction
5. Proceed to full production launch!

---

## Troubleshooting

### Verifier Health Check Fails

1. Check Render logs for verifier service
2. Verify all environment variables are set
3. Check RPC endpoints are accessible
4. Verify wallet addresses are valid

### Sentry Not Receiving Errors

1. Verify DSN is correct
2. Check environment variables in both services
3. Run test script again
4. Check Sentry project settings

### UptimeRobot Not Sending Alerts

1. Verify email is confirmed
2. Check monitor is enabled
3. Verify alert contact is assigned to monitors
4. Test by manually pausing a service

---

## Support Resources

- **Render Dashboard**: https://dashboard.render.com
- **Sentry Dashboard**: https://sentry.io
- **UptimeRobot Dashboard**: https://uptimerobot.com/dashboard
- **Documentation**: See guides in repository

---

## Security Notes

- ✅ `.env.verifier.render` is in .gitignore (not committed)
- ✅ `.env.frontend.render` is in .gitignore (not committed)
- ✅ PYTHON_VERIFIER_KEY is randomly generated
- ⚠️ Keep wallet private keys secure (NOT in environment variables)
- ⚠️ Never commit real API keys to git

---

**Last Updated**: November 9, 2025
**Status**: Ready for configuration
**Estimated Time**: 55 minutes total
