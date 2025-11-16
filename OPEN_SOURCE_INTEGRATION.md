# Open Source Integration Strategy

## Overview

KAMIYO uses git subtrees to incorporate open source repositories into the main monorepo while maintaining separate public repos for community contribution.

## Architecture

```
kamiyo/ (main repo - kamiyo-ai/kamiyo)
├── packages/
│   ├── kagami/          # ERC-8004 agent identity (open source)
│   ├── payai/           # Payment infrastructure (open source)
│   └── x402resolve/     # x402 resolution library (future open source)
├── website/             # Main website (private)
├── api/                 # Main API (private)
└── services/            # Core services (private)
```

## Git Subtree Setup

### 1. Add Kagami as Subtree

```bash
# Add kagami remote
git remote add kagami-remote https://github.com/kamiyo-ai/kagami.git

# Add kagami as subtree in packages/kagami/
git subtree add --prefix=packages/kagami kagami-remote main --squash

# Future updates from kagami
git subtree pull --prefix=packages/kagami kagami-remote main --squash

# Push changes to kagami
git subtree push --prefix=packages/kagami kagami-remote main
```

### 2. Add PayAI as Subtree

```bash
# Add payai remote
git remote add payai-remote https://github.com/mizuki-tamaki/kamiyo-payai.git

# Add payai as subtree
git subtree add --prefix=packages/payai payai-remote main --squash

# Future updates
git subtree pull --prefix=packages/payai payai-remote main --squash
git subtree push --prefix=packages/payai payai-remote main
```

## Workflow

### Development in Main Repo

```bash
# Work on kagami in main repo
cd packages/kagami
# Make changes
git add packages/kagami
git commit -m "Update kagami: add feature X"
git push origin main

# Push changes to open source repo
git subtree push --prefix=packages/kagami kagami-remote main
```

### Pull Updates from Open Source

```bash
# Someone contributed to kagami on GitHub
git subtree pull --prefix=packages/kagami kagami-remote main --squash

# Review and merge
git push origin main
```

### Keep Open Source Repos Independent

Open source repos (kagami, payai) can still be cloned and developed independently:

```bash
# External contributor
git clone https://github.com/kamiyo-ai/kagami.git
cd kagami
# Make changes, PR back to kamiyo-ai/kagami
```

## Benefits

1. **Single Development Environment**: Work in kamiyo/ monorepo
2. **Independent Open Source**: kagami, payai remain standalone repos
3. **Bidirectional Sync**: Changes flow both ways
4. **No Submodule Complexity**: No .gitmodules, no detached HEAD issues
5. **Clean History**: Squash commits keep main repo history clean

## License Separation

- **Main Repo (kamiyo)**: Commercial/proprietary license
- **Open Source (kagami, payai)**: Dual license (non-commercial free, commercial requires license)

## Directory Structure

```
packages/kagami/
├── api/erc8004/        # FastAPI endpoints
├── database/           # PostgreSQL migrations
├── contracts/          # Solidity contracts
├── sdk/                # Python SDK
├── tests/              # Test suite
└── README.md           # Open source README

packages/payai/
├── api/                # Payment API
├── database/           # Payment schema
├── monitoring/         # Observability
├── tests/              # Test suite
└── README.md           # Open source README
```

## Migration Steps

1. Add remotes for kagami and payai
2. Add subtrees with --squash
3. Verify imports work in main repo
4. Update CI/CD to test packages/
5. Update documentation

## Commands Reference

```bash
# Add subtree
git subtree add --prefix=packages/NAME REMOTE main --squash

# Pull updates from open source
git subtree pull --prefix=packages/NAME REMOTE main --squash

# Push changes to open source
git subtree push --prefix=packages/NAME REMOTE main

# Split subtree for independent repo
git subtree split --prefix=packages/NAME -b NAME-branch
```

## Integration with Services

Main kamiyo services import from packages:

```python
# In kamiyo/api/main.py
from packages.kagami.api.erc8004.routes import router as kagami_router
from packages.payai.api.routes import router as payai_router

app.include_router(kagami_router, prefix="/api/v1/kagami")
app.include_router(payai_router, prefix="/api/v1/payai")
```

## CI/CD

```yaml
# .github/workflows/test.yml
jobs:
  test-kagami:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd packages/kagami && pytest tests/

  test-payai:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd packages/payai && pytest tests/
```

---

Built by KAMIYO
