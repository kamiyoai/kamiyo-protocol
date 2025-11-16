# Contributing to Hyperliquid Security Monitor

Thank you for your interest in contributing! This guide will help you get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

---

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Examples of behavior that contributes to a positive environment:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Examples of unacceptable behavior:**
- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team at conduct@kamiyo.ai. All complaints will be reviewed and investigated promptly and fairly.

---

## Getting Started

### Ways to Contribute

**Code Contributions:**
- Fix bugs
- Add new features
- Improve performance
- Enhance UI/UX
- Improve documentation

**Non-Code Contributions:**
- Write tutorials or blog posts
- Give talks about the project
- Suggest new features
- Test and report bugs
- Spread the word

---

## Development Setup

### Prerequisites

- Python 3.10+
- Docker & Docker Compose
- Git
- PostgreSQL 15+ (for local development without Docker)

### Local Installation

```bash
# 1. Fork the repository
# Click "Fork" button on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/kamiyo-hyperliquid.git
cd kamiyo-hyperliquid

# 3. Add upstream remote
git remote add upstream https://github.com/kamiyo-ai/kamiyo-hyperliquid.git

# 4. Create virtual environment
python3.10 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 5. Install dependencies
pip install -r requirements.txt

# 6. Copy environment template
cp .env.example .env

# 7. Start services
docker-compose up -d

# 8. Verify setup
curl http://localhost:8000/health
```

---

## How to Contribute

### Reporting Bugs

**Before submitting a bug report:**
- Check the [GitHub Issues](https://github.com/kamiyo-ai/kamiyo-hyperliquid/issues) to avoid duplicates
- Collect information about the bug (version, OS, error messages)
- Try to reproduce the bug with the latest code

**Submitting a bug report:**
1. Use the "Bug Report" issue template
2. Provide a clear, descriptive title
3. Describe the expected vs actual behavior
4. Include steps to reproduce
5. Add relevant logs/screenshots
6. Specify your environment (OS, Python version, Docker version)

**Example:**
```
Title: HLP Monitor fails to fetch vault data when API is rate limited

Description:
When Hyperliquid API returns 429 (rate limit), the monitor crashes instead of backing off.

Steps to reproduce:
1. Start monitor with high polling frequency (< 1s)
2. Wait for rate limit error
3. Observe crash in logs

Expected: Monitor should implement exponential backoff
Actual: Monitor crashes with uncaught exception

Environment:
- OS: Ubuntu 22.04
- Python: 3.10.8
- Docker: 24.0.5

Logs:
[Include relevant error logs]
```

### Suggesting Features

**Before suggesting a feature:**
- Check if it's already in the [Roadmap](README.md#roadmap)
- Search existing [Feature Requests](https://github.com/kamiyo-ai/kamiyo-hyperliquid/labels/enhancement)

**Submitting a feature request:**
1. Use the "Feature Request" issue template
2. Explain the problem you're trying to solve
3. Describe your proposed solution
4. Consider alternative solutions
5. Explain why this benefits the community

### Contributing Code

**Step 1: Find an issue**
- Check [Good First Issues](https://github.com/kamiyo-ai/kamiyo-hyperliquid/labels/good%20first%20issue)
- Look for [Help Wanted](https://github.com/kamiyo-ai/kamiyo-hyperliquid/labels/help%20wanted) labels
- Or create a new issue for your proposal

**Step 2: Create a branch**
```bash
# Update your fork
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

**Step 3: Make your changes**
- Write clean, readable code
- Follow code standards (see below)
- Add tests for new functionality
- Update documentation as needed

**Step 4: Test your changes**
```bash
# Run all tests
pytest tests/ -v

# Check coverage
pytest --cov=. --cov-report=html

# Run linters
black . --check
flake8 .
```

**Step 5: Commit your changes**
```bash
# Stage your changes
git add .

# Commit with descriptive message
git commit -m "feat: add exponential backoff for API rate limits"
```

**Commit message format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting)
- `refactor` - Code refactoring
- `test` - Test additions/changes
- `chore` - Maintenance tasks

**Example:**
```
feat(monitor): add exponential backoff for API rate limits

Implements exponential backoff with jitter when Hyperliquid API
returns 429 rate limit errors. Prevents monitor crashes and
improves reliability.

- Add retry logic with configurable max attempts
- Implement exponential backoff (2^n seconds)
- Add jitter to prevent thundering herd
- Log rate limit events for monitoring

Closes #123
```

**Step 6: Push to your fork**
```bash
git push origin feature/your-feature-name
```

**Step 7: Create Pull Request**
- Go to the original repository
- Click "New Pull Request"
- Select your fork and branch
- Fill out the PR template
- Link related issues

---

## Code Standards

### Python Style Guide

We follow [PEP 8](https://peps.python.org/pep-0008/) with some modifications:

**Code Formatting:**
```bash
# Use Black for formatting (line length: 100)
black . --line-length 100

# Use flake8 for linting
flake8 . --max-line-length=100 --ignore=E203,W503
```

**Type Hints:**
All functions must have type hints:

```python
# Good
def fetch_hlp_vault(self, timeout: int = 30) -> Dict[str, Any]:
    """Fetch HLP vault data from Hyperliquid API.

    Args:
        timeout: Request timeout in seconds

    Returns:
        Dictionary containing vault metrics

    Raises:
        APIError: If API request fails
    """
    ...

# Bad
def fetch_hlp_vault(self, timeout=30):
    ...
```

**Docstrings:**
Use Google-style docstrings:

```python
def calculate_risk_score(
    pnl_24h: float,
    drawdown_pct: float,
    anomaly_score: float
) -> float:
    """Calculate overall risk score from multiple metrics.

    Combines 24h PnL, drawdown percentage, and ML anomaly score
    into a single risk value between 0-100.

    Args:
        pnl_24h: 24-hour profit/loss in USD
        drawdown_pct: Drawdown percentage from peak
        anomaly_score: ML anomaly score (0-1)

    Returns:
        Risk score between 0 (safe) and 100 (critical)

    Examples:
        >>> calculate_risk_score(-1000000, 5.2, 0.3)
        42.5
    """
    ...
```

### Project Structure

```
kamiyo-hyperliquid/
├── aggregators/        # Data collection from external APIs
│   ├── base.py        # Abstract base aggregator
│   └── hyperliquid_api.py
├── monitors/           # Security monitors
│   ├── hlp_vault_monitor.py
│   ├── oracle_monitor.py
│   └── liquidation_analyzer.py
├── api/               # FastAPI REST endpoints
│   └── main.py
├── database/          # Database models and migrations
│   ├── models.py
│   └── schema.sql
├── models/            # Pydantic models for validation
│   └── security.py
├── alerts/            # Alert dispatchers
│   ├── discord.py
│   ├── telegram.py
│   └── slack.py
├── ml_models/         # Machine learning models
│   ├── anomaly_detector.py
│   └── forecaster.py
├── websocket/         # WebSocket monitoring
│   └── runner.py
├── tests/             # Test suite
│   ├── unit/
│   ├── integration/
│   └── conftest.py
└── docs/              # Documentation
```

### Error Handling

```python
# Good: Specific exceptions with helpful messages
class HyperliquidAPIError(Exception):
    """Raised when Hyperliquid API request fails."""
    pass

def fetch_data(self) -> Dict[str, Any]:
    try:
        response = requests.get(self.api_url, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.Timeout:
        raise HyperliquidAPIError("API request timed out after 30s")
    except requests.HTTPError as e:
        if e.response.status_code == 429:
            raise HyperliquidAPIError("Rate limit exceeded") from e
        raise HyperliquidAPIError(f"API returned {e.response.status_code}") from e

# Bad: Generic exceptions
def fetch_data(self):
    try:
        return requests.get(self.api_url).json()
    except Exception as e:
        print(f"Error: {e}")
        return None
```

---

## Testing Requirements

### Test Coverage

All new code must include tests. Aim for:
- **Overall coverage:** >80%
- **Critical paths:** 100% (security monitors, alert dispatchers)
- **New features:** >90%

### Writing Tests

**Unit Tests:**
```python
# tests/unit/test_hlp_monitor.py
import pytest
from monitors.hlp_vault_monitor import HLPVaultMonitor

def test_anomaly_detection():
    """Test that large losses trigger anomalies."""
    monitor = HLPVaultMonitor()

    # Mock normal metrics
    normal_metrics = {
        "account_value": 577000000,
        "pnl_24h": 100000,
    }
    assert monitor.detect_anomaly(normal_metrics) == False

    # Mock anomalous metrics
    anomalous_metrics = {
        "account_value": 573000000,
        "pnl_24h": -4000000,  # $4M loss
    }
    assert monitor.detect_anomaly(anomalous_metrics) == True
```

**Integration Tests:**
```python
# tests/integration/test_api.py
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_health_endpoint():
    """Test health check returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
```

**Running Tests:**
```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run only unit tests
pytest tests/unit/ -v

# Run only integration tests
pytest tests/integration/ -v
```

---

## Pull Request Process

### Before Submitting

**Checklist:**
- [ ] Code follows project style guide
- [ ] All tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main
- [ ] No merge conflicts

```bash
# Update your branch
git checkout main
git pull upstream main
git checkout feature/your-feature
git rebase main

# Run full test suite
pytest tests/ -v

# Check code style
black . --check
flake8 .
```

### Review Process

1. **Automated Checks:**
   - GitHub Actions run tests
   - Code coverage is calculated
   - Linters check code style

2. **Peer Review:**
   - Maintainers review your code
   - Address feedback in new commits
   - Don't force-push after review starts

3. **Approval:**
   - At least 1 maintainer approval required
   - All CI checks must pass
   - No unresolved conversations

4. **Merge:**
   - Maintainers merge using "Squash and merge"
   - Your PR appears in release notes
   - Branch is automatically deleted

---

## Community

### Communication Channels

- **GitHub Issues:** Bug reports, feature requests
- **GitHub Discussions:** General questions, ideas
- **Discord:** Real-time chat (https://github.com/kamiyo-ai/kamiyo-hyperliquid/discussions)

### Getting Help

**Stuck? Need help?**
1. Check [Documentation](docs/)
2. Search [GitHub Discussions](https://github.com/kamiyo-ai/kamiyo-hyperliquid/discussions)
3. Ask in [Discord](https://github.com/mizuki-tamaki/kamiyo-hyperliquid/discussions)
4. Create a [GitHub Issue](https://github.com/kamiyo-ai/kamiyo-hyperliquid/issues)

### Recognition

Contributors are recognized in:
- Release notes
- Project README

Top contributors may be invited to become maintainers.

---

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).

---

## Questions?

Contact us:
- **General inquiries:** hello@kamiyo.ai
- **Code of Conduct issues:** conduct@kamiyo.ai
- **Security issues:** security@kamiyo.ai

---

**Thank you for contributing to Hyperliquid Security Monitor!**

[Back to README](README.md) • [Documentation](docs/) • [Issues](https://github.com/kamiyo-ai/kamiyo-hyperliquid/issues)
