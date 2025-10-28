# KAMIYO Quick Start Guide

**Last Updated:** 2025-10-27
**Status:** ⚠️ Python 3.11+ Required

---

## Current Status

### ✅ CONFIGURED
- **CSRF Secret Key:** 64 characters (384-bit entropy)
- **x402 Admin Key:** 64 characters (384-bit entropy)
- **JWT Secret:** 86 characters (512-bit entropy)
- **.env file:** Updated with secure values
- **Backup:** .env.backup_YYYYMMDD_HHMMSS created

### ❌ CRITICAL BLOCKER
**Python 3.11+ Required** - API cannot start with Python 3.8
- See: `PYTHON_UPGRADE.md` for detailed upgrade instructions

### ⚠️ REQUIRES MANUAL CONFIGURATION
- Stripe API keys
- x402 payment addresses
- RPC endpoints

---

## Installation Steps

### Step 1: Upgrade Python (REQUIRED)

**Option A: Official Installer (Recommended - 10 minutes)**
```bash
# Download installer (already downloaded)
ls python-3.11.7-macos11.pkg

# Install (requires sudo password)
sudo installer -pkg python-3.11.7-macos11.pkg -target /

# Verify
python3.11 --version
```

**Option B: Homebrew (20-30 minutes)**
```bash
# Free disk space first
brew cleanup --prune=all

# Install Python 3.11
brew install python@3.11
```

**Option C: pyenv (15-20 minutes)**
```bash
curl https://pyenv.run | bash
pyenv install 3.11.7
pyenv local 3.11.7
```

### Step 2: Create Virtual Environment
```bash
cd /Users/dennisgoslar/Projekter/kamiyo

# Create venv with Python 3.11
python3.11 -m venv venv

# Activate
source venv/bin/activate

# Verify Python version
python --version  # Should show 3.11.x
```

### Step 3: Install Dependencies
```bash
# Upgrade pip
pip install --upgrade pip

# Uncomment fastapi-csrf-protect in requirements.txt
sed -i '' 's/# fastapi-csrf-protect/fastapi-csrf-protect/' requirements.txt

# Install all dependencies
pip install -r requirements.txt

# Verify CSRF library works
python -c "from fastapi_csrf_protect import CsrfProtect; print('✅ CSRF library working')"
```

### Step 4: Configure Environment (Optional)
```bash
# Generate new secrets (optional - already configured)
./scripts/configure_dev_environment.sh

# Or manually edit .env:
# - Add Stripe API keys
# - Add x402 payment addresses
# - Add RPC endpoints
```

### Step 5: Start Server
```bash
# Start development server
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload

# Server should start at: http://127.0.0.1:8000
```

### Step 6: Test Installation
```bash
# Test health endpoint
curl http://127.0.0.1:8000/health

# Test CSRF token generation
curl http://127.0.0.1:8000/api/csrf-token

# Open API docs
open http://127.0.0.1:8000/docs
```

---

## Configuration Checklist

### Required Before ANY Testing
- [x] Generate secure secrets (COMPLETED)
- [ ] Install Python 3.11+
- [ ] Create virtualenv with Python 3.11+
- [ ] Uncomment fastapi-csrf-protect in requirements.txt
- [ ] Install dependencies

### Required for Subscription Testing
- [ ] Get Stripe test API keys from https://dashboard.stripe.com/test/apikeys
- [ ] Add to .env:
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  ```

### Required for x402 Testing
- [ ] Generate wallet addresses (Base, Ethereum, Solana)
- [ ] Sign up for RPC providers:
  - Alchemy: https://www.alchemy.com/
  - Helius (Solana): https://www.helius.dev/
- [ ] Add to .env:
  ```
  X402_BASE_PAYMENT_ADDRESS=0x...
  X402_ETHEREUM_PAYMENT_ADDRESS=0x...
  X402_SOLANA_PAYMENT_ADDRESS=...
  X402_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
  X402_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
  X402_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
  ```

---

## Common Issues

### "TypeError: unsupported operand type(s) for |"
**Solution:** Upgrade to Python 3.11+ (see Step 1 above)

### "No space left on device"
**Solution:**
```bash
brew cleanup --prune=all
pip cache purge
docker system prune -a  # if Docker installed
```

### "ModuleNotFoundError: No module named 'fastapi_csrf_protect'"
**Solution:** Uncomment in requirements.txt and reinstall:
```bash
sed -i '' 's/# fastapi-csrf-protect/fastapi-csrf-protect/' requirements.txt
pip install -r requirements.txt
```

### Server starts but CSRF protection disabled
**Solution:** Check CSRF_SECRET_KEY in .env is 32+ characters

---

## Useful Commands

### Server Management
```bash
# Start server (development)
uvicorn api.main:app --reload

# Start server (production)
uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 4

# Check if server is running
curl http://127.0.0.1:8000/health
```

### Configuration
```bash
# Regenerate secrets
./scripts/configure_dev_environment.sh

# Check current configuration
python3 << 'EOF'
import os
# ... (configuration check script)
EOF
```

### Environment Management
```bash
# Activate virtualenv
source venv/bin/activate

# Deactivate
deactivate

# Check Python version
python --version

# List installed packages
pip list
```

---

## Documentation

### Essential Docs
- **PYTHON_UPGRADE.md** - Detailed Python 3.11 upgrade guide
- **CONFIGURATION_REPORT.md** - Complete configuration status report
- **QUICK_START.md** - This file
- **.env.example** - Environment variable template

### API Documentation
- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- OpenAPI Schema: http://127.0.0.1:8000/openapi.json

---

## Support

### Files Modified
```
.env                                   # ✅ Updated with secure secrets
.env.backup_YYYYMMDD_HHMMSS           # ✅ Backup created
requirements.txt                       # ✅ Commented out CSRF (temporarily)
```

### Files Created
```
PYTHON_UPGRADE.md                      # Python 3.11 upgrade guide
CONFIGURATION_REPORT.md                # Detailed configuration report
QUICK_START.md                         # This file
scripts/configure_dev_environment.sh   # Secret generation script
```

### Next Steps
1. **Install Python 3.11+** (CRITICAL - see PYTHON_UPGRADE.md)
2. Follow Steps 2-6 above
3. Configure manual values (Stripe, x402)
4. Start testing!

---

**Status:** ⚠️ Ready for Python 3.11 upgrade
**Secrets:** ✅ Generated and configured
**Documentation:** ✅ Complete
**Action Required:** Install Python 3.11+ to unblock API startup
