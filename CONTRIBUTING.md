# Contributing

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/kamiyo-payai.git
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.payai.example .env
```

## Code Style

- Follow PEP 8
- Use type hints
- Add docstrings to public functions
- Keep functions focused and testable

## Testing

```bash
# Run all tests
pytest api/x402/tests/ -v

# Run specific test
pytest api/x402/tests/test_payment_gateway.py::test_payai_success -v

# With coverage
pytest api/x402/tests/ --cov=api/x402 --cov-report=html
```

## Pull Requests

1. Fork and create feature branch
2. Write tests for new code
3. Ensure all tests pass
4. Update documentation if needed
5. Submit PR with clear description

## Commit Messages

Use imperative mood:
- "Add PayAI network support"
- "Fix payment verification race condition"
- "Update endpoint pricing configuration"

## License

Contributions are accepted under AGPL-3.0. Commercial use requires separate licensing.
