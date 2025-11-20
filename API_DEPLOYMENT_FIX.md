# API Deployment Fix

## Issue

api.kamiyo.ai deployment failed with:
```
ModuleNotFoundError: No module named 'intelligence'
```

## Root Cause

API code had incorrect import paths expecting modules at project root, but files were organized in subdirectories:

1. **Intelligence module**: `from intelligence.source_scorer import SourceScorer`
   - File location: `services/intelligence/source_scorer.py`
   - Missing: `services/__init__.py` to make it a Python package

2. **Monitoring modules**: `from monitoring.prometheus_metrics import api_requests_total`
   - File location: `infrastructure/monitoring/*.py`
   - Import expected: `monitoring/*.py` at root

## Fixes Applied

### 1. Intelligence Module Import (Commit 6a4c7e26)

**Changed:**
```python
# api/main.py (line 29)
from intelligence.source_scorer import SourceScorer
```

**To:**
```python
from services.intelligence.source_scorer import SourceScorer
```

**Added:**
```python
# services/__init__.py
# Services package
```

### 2. Monitoring Modules (Commit 0042cab6)

**Copied files from `infrastructure/monitoring/` to `monitoring/`:**
- `__init__.py`
- `prometheus_metrics.py`
- `alerts.py`
- `cache_metrics.py`
- `response_metrics.py`
- `aggregator_metrics.py`
- `frontend_metrics.py`
- `query_performance.py`
- `sentry_config.py`
- `structured_logging.py`

## Deployment Structure

Render deployment runs from project root:
```bash
uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Python path is set to project root, so imports must be relative to root directory.

## Testing

Local testing may fail with Python 3.8/3.9 due to type hint syntax (`|` operator) in dependencies. Deployment uses Python 3.11 as specified in render.yaml, which supports modern type hints.

## Verification

After deployment:
1. Check health endpoint: `https://api.kamiyo.ai/health`
2. Verify metrics: `https://api.kamiyo.ai/metrics`
3. Check logs for import errors

## Related Files

- `/Users/dennisgoslar/Projekter/kamiyo/api/main.py` - Fixed intelligence import
- `/Users/dennisgoslar/Projekter/kamiyo/services/__init__.py` - New package marker
- `/Users/dennisgoslar/Projekter/kamiyo/monitoring/*.py` - Added monitoring modules
- `/Users/dennisgoslar/Projekter/kamiyo/website/infrastructure/deployment/render.yaml` - Deployment config

## Commits

1. `6a4c7e26` - Fix API import path for intelligence module
2. `0042cab6` - Add monitoring modules to root directory
