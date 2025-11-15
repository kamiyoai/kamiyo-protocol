# Publishing x402 Python SDK to PyPI

This guide covers publishing the x402 Python SDK to PyPI (Python Package Index).

## Prerequisites

1. **PyPI Account**: Create account at https://pypi.org/account/register/
2. **API Token**: Generate at https://pypi.org/manage/account/token/
3. **Build Tools**: Install publishing tools

```bash
pip install build twine
```

## Publishing Steps

### 1. Update Version

Edit `setup.py` and bump version:

```python
version="1.0.0",  # Update this
```

Follow semantic versioning:
- **Major** (1.0.0 -> 2.0.0): Breaking changes
- **Minor** (1.0.0 -> 1.1.0): New features, backward compatible
- **Patch** (1.0.0 -> 1.0.1): Bug fixes

### 2. Build Distribution

```bash
cd sdks/python

# Clean previous builds
rm -rf dist/ build/ *.egg-info

# Build package
python -m build
```

This creates:
- `dist/x402_python-1.0.0.tar.gz` (source distribution)
- `dist/x402_python-1.0.0-py3-none-any.whl` (wheel)

### 3. Test with TestPyPI (Recommended)

Test upload to TestPyPI first:

```bash
# Upload to TestPyPI
python -m twine upload --repository testpypi dist/*

# Install from TestPyPI to test
pip install --index-url https://test.pypi.org/simple/ x402-python
```

### 4. Publish to PyPI

```bash
# Upload to PyPI
python -m twine upload dist/*
```

You'll be prompted for credentials:
- **Username**: `__token__`
- **Password**: Your API token (starts with `pypi-`)

### 5. Verify Installation

```bash
pip install x402-python

python -c "from x402 import X402Client; print('Success!')"
```

## Environment Variables (Recommended)

Store PyPI credentials securely:

```bash
# Add to .bashrc or .zshrc
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-AgEIcHlwaS5vcmc...

# Or use .pypirc file
cat > ~/.pypirc << EOF
[pypi]
username = __token__
password = pypi-AgEIcHlwaS5vcmc...
EOF
chmod 600 ~/.pypirc
```

Then upload without prompts:

```bash
python -m twine upload dist/*
```

## Automated Publishing (GitHub Actions)

Create `.github/workflows/pypi-publish.yml`:

```yaml
name: Publish Python SDK

on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install build twine

    - name: Build package
      working-directory: sdks/python
      run: python -m build

    - name: Publish to PyPI
      working-directory: sdks/python
      env:
        TWINE_USERNAME: __token__
        TWINE_PASSWORD: ${{ secrets.PYPI_API_TOKEN }}
      run: twine upload dist/*
```

Add `PYPI_API_TOKEN` to GitHub repository secrets.

## Version Management

Update version in multiple places:

1. **setup.py**: Line 12
2. **x402/__init__.py**: `__version__` variable
3. **README.md**: Installation examples

## Common Issues

### Issue: "File already exists"

**Solution**: You uploaded this version before. Bump version number.

### Issue: "Invalid distribution"

**Solution**: Check `setup.py` syntax. Run `python setup.py check`.

### Issue: "Long description failed"

**Solution**: Verify README.md is valid Markdown. Test with:

```bash
pip install readme_renderer
python setup.py check --restructuredtext --strict
```

### Issue: Module not found after install

**Solution**: Check package structure. Ensure `__init__.py` exists in all directories.

## Pre-Release Versions

For alpha/beta releases:

```python
version="1.0.0a1",  # Alpha
version="1.0.0b2",  # Beta
version="1.0.0rc1", # Release candidate
```

Users install pre-releases with:

```bash
pip install --pre x402-python
```

## Post-Release Checklist

After publishing:

- [ ] Verify package page: https://pypi.org/project/x402-python/
- [ ] Test installation: `pip install x402-python`
- [ ] Update documentation links
- [ ] Announce release (Twitter, blog, etc.)
- [ ] Create GitHub release tag
- [ ] Update changelog

## Package Metadata

Ensure these are correct in `setup.py`:

- **name**: Must be unique on PyPI
- **version**: Semantic versioning
- **description**: Short one-liner
- **long_description**: From README.md
- **author**: KAMIYO
- **author_email**: dev@kamiyo.ai
- **url**: GitHub repository
- **classifiers**: Python versions, license, status
- **keywords**: For PyPI search

## Statistics

View package stats:
- **PyPI Dashboard**: https://pypi.org/manage/projects/
- **Downloads**: https://pypistats.org/packages/x402-python

## Support

For publishing issues:
- **PyPI Support**: https://pypi.org/help/
- **Twine Docs**: https://twine.readthedocs.io/

Questions? dev@kamiyo.ai
