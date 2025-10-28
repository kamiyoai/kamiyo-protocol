# Python 3.11 Upgrade Required

**STATUS:** CRITICAL - BLOCKING API STARTUP
**DATE:** 2025-10-27
**PRIORITY:** P0 - Must fix before production deployment

## Problem Summary

The KAMIYO API currently cannot start due to a Python version incompatibility:

- **Current Version:** Python 3.8.2
- **Required Version:** Python 3.10+ (3.11 or 3.12 recommended)
- **Root Cause:** `fastapi-csrf-protect` library uses Python 3.10+ union type syntax (`Type | None`)

### Error Message
```
TypeError: unsupported operand type(s) for |: '_GenericAlias' and 'ModelMetaclass'
```

This occurs in `/Users/dennisgoslar/Library/Python/3.8/lib/python/site-packages/fastapi_csrf_protect/csrf_config.py:44`

## Why Python 3.8 Doesn't Work

Python 3.8 doesn't support the `|` union type operator:
```python
# Python 3.10+ (WORKS)
def function(param: str | None) -> int | float:
    pass

# Python 3.8 (FAILS)
# Must use:
from typing import Union, Optional
def function(param: Optional[str]) -> Union[int, float]:
    pass
```

The `fastapi-csrf-protect` library uses the modern syntax internally, making it incompatible with Python 3.8.

## Attempted Solutions

### 1. Homebrew Installation (FAILED)
```bash
brew install python@3.11
```
**Result:** Failed due to insufficient disk space (94% full, only 808MB free)
**Error:** "No space left on device" during OpenSSL compilation

### 2. Downgrade fastapi-csrf-protect (FAILED)
```bash
pip install fastapi-csrf-protect==0.3.0
```
**Result:** Created Pydantic v1 vs v2 dependency conflicts
- `fastapi-csrf-protect 0.3.0` requires Pydantic v1
- `web3`, `eth-account`, `anthropic` require Pydantic v2
- Incompatible dependency tree

### 3. Temporary Workaround (IMPLEMENTED)
- Commented out `fastapi-csrf-protect==0.3.4` in `requirements.txt`
- Documented the issue
- Generated all other configuration secrets
- Ready to uncomment after Python upgrade

## Upgrade Solutions

### Option 1: Install Python 3.11 via Official Installer (RECOMMENDED)

**Requirements:** sudo password

```bash
# Download Python 3.11.7 installer
curl -O https://www.python.org/ftp/python/3.11.7/python-3.11.7-macos11.pkg

# Install (requires sudo password)
sudo installer -pkg python-3.11.7-macos11.pkg -target /

# Verify installation
python3.11 --version  # Should show: Python 3.11.7

# Create virtualenv
cd /Users/dennisgoslar/Projekter/kamiyo
python3.11 -m venv venv

# Activate and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Verify CSRF library works
python -c "from fastapi_csrf_protect import CsrfProtect; print('✅ CSRF library working')"
```

### Option 2: Install via Homebrew (after freeing disk space)

```bash
# Free up disk space first
# Check current usage
df -h /

# Clean Homebrew caches
brew cleanup --prune=all

# Clean up Docker if installed
docker system prune -a

# Clean Python pip caches
pip cache purge

# After freeing ~2GB:
brew install python@3.11

# Follow virtualenv steps from Option 1
```

### Option 3: Install via pyenv

```bash
# Install pyenv
curl https://pyenv.run | bash

# Add to shell profile (~/.bash_profile or ~/.zshrc)
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init --path)"
eval "$(pyenv init -)"

# Restart shell
exec $SHELL

# Install Python 3.11
pyenv install 3.11.7
pyenv local 3.11.7

# Follow virtualenv steps from Option 1
```

## After Python Upgrade

1. **Uncomment CSRF Protection in requirements.txt**
   ```bash
   # Edit requirements.txt, change:
   # fastapi-csrf-protect==0.3.4  # REQUIRES PYTHON 3.10+
   # To:
   fastapi-csrf-protect==0.3.4  # CSRF protection for FastAPI
   ```

2. **Reinstall Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Test Server Startup**
   ```bash
   python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
   ```

4. **Verify CSRF Protection**
   ```bash
   curl http://127.0.0.1:8000/health
   ```

## Configuration Status

✅ **COMPLETED:**
- CSRF_SECRET_KEY: 64 characters (generated securely)
- X402_ADMIN_KEY: 64 characters (generated securely)
- JWT_SECRET: 86 characters (generated securely)
- .env file updated with secure values
- Backup created: `.env.backup_YYYYMMDD_HHMMSS`

❌ **REQUIRES MANUAL SETUP:**
- Stripe API keys → Get from https://dashboard.stripe.com/test/apikeys
- x402 payment addresses → Generate wallet addresses for Base/ETH/Solana
- RPC API keys → Sign up for Alchemy/QuickNode/Helius

## Impact Assessment

### Without Python 3.11 Upgrade:
- ❌ API server CANNOT start
- ❌ CSRF protection DISABLED (security risk)
- ❌ Cannot test any endpoints
- ❌ Cannot deploy to production

### After Python 3.11 Upgrade:
- ✅ API server can start
- ✅ CSRF protection enabled
- ✅ All security features functional
- ⚠️ Still needs manual configuration for:
  - Stripe payments
  - x402 blockchain payments
  - RPC endpoint access

## Disk Space Requirements

- **Current Free:** ~1.3GB
- **Required for Homebrew install:** ~2GB
- **Required for official installer:** ~150MB
- **Recommendation:** Use official installer (Option 1)

## System Information

- **OS:** macOS 10.15 (Catalina)
- **Current Python:** 3.8.2 (system)
- **Current Disk Usage:** 90% (11GB used, 1.3GB free)
- **Architecture:** x86_64

## Next Steps (Priority Order)

1. **P0:** Install Python 3.11 using one of the options above
2. **P0:** Uncomment fastapi-csrf-protect in requirements.txt
3. **P0:** Test server startup
4. **P1:** Configure Stripe API keys (for subscription testing)
5. **P1:** Configure RPC endpoints (for x402 testing)
6. **P2:** Generate wallet addresses for x402 payments

## References

- Python 3.11 Download: https://www.python.org/downloads/release/python-3117/
- fastapi-csrf-protect Docs: https://github.com/aekasitt/fastapi-csrf-protect
- Pydantic v2 Migration: https://docs.pydantic.dev/latest/migration/
- Python Union Types (PEP 604): https://peps.python.org/pep-0604/

---

**Last Updated:** 2025-10-27
**Author:** Claude (Anthropic)
**Status:** ACTIVE BLOCKER
