# Integration Tests - Autonomous Growth Pipeline

Comprehensive integration test suite for the Kamiyo autonomous growth pipeline.

## Overview

This test suite provides end-to-end testing of the complete autonomous pipeline from exploit detection through analysis, social media posting, and monitoring.

**Total Lines of Code:** 3,073 lines
**Total Test Cases:** 86 tests
**Test Files:** 5 modules + fixtures

## Test Modules

### 1. `test_full_pipeline.py` (519 lines, 18 tests)
**Complete end-to-end pipeline testing**

Tests the entire workflow from exploit detection to multi-platform posting:
- ✅ Exploit → Analysis → Post → Monitoring flow
- ✅ Analysis enhances social media content
- ✅ Partial platform failures handled gracefully
- ✅ Complete failure scenarios with alerting
- ✅ Manual review workflow
- ✅ Review rejection handling
- ✅ Statistics tracking across operations
- ✅ Error handling and recovery
- ✅ Multi-chain support (Ethereum, BSC, Polygon, Arbitrum)
- ✅ Performance benchmarks

**Key Test Classes:**
- `TestFullPipeline` - Core workflow testing
- `TestPipelinePerformance` - Performance and timing

### 2. `test_autonomous_engine.py` (498 lines, 15 tests)
**Autonomous engine and watcher integration**

Tests the autonomous operation without human intervention:
- ✅ Engine initialization and configuration
- ✅ Platform status reporting
- ✅ Kamiyo API polling integration
- ✅ WebSocket real-time updates
- ✅ Exploit filtering (amount, chain)
- ✅ Deduplication prevention
- ✅ Auto-posting without review
- ✅ Retry logic on failures
- ✅ Statistics accumulation
- ✅ Alert on critical failures
- ✅ Scaling with platform count

**Key Test Classes:**
- `TestAutonomousEngine` - Engine initialization and config
- `TestWatcherIntegration` - Kamiyo API integration
- `TestAutonomousOperation` - Fully autonomous behavior

### 3. `test_platform_integration.py` (461 lines, 18 tests)
**Multi-platform coordination and integration**

Tests that all platform posters work together correctly:
- ✅ All platforms post successfully together
- ✅ Platform-specific content formatting
- ✅ Failure isolation between platforms
- ✅ Platform status reporting
- ✅ Selective platform posting
- ✅ Retry coordination
- ✅ Concurrent posting
- ✅ Individual platform failure patterns
- ✅ Configuration scenarios
- ✅ Authentication status
- ✅ Content length validation per platform
- ✅ Cross-platform consistency

**Key Test Classes:**
- `TestPlatformIntegration` - Multi-platform coordination
- `TestPlatformConfiguration` - Configuration scenarios
- `TestCrossplatformContent` - Content formatting and consistency

### 4. `test_monitoring_integration.py` (592 lines, 20 tests)
**Monitoring, metrics, and alerting**

Tests observability and monitoring integration:
- ✅ Prometheus metrics on success/failure
- ✅ Generation duration tracking
- ✅ API call duration tracking
- ✅ Error metrics collection
- ✅ Multi-platform metric aggregation
- ✅ Structured logging with context
- ✅ Error logs with details
- ✅ Appropriate log levels
- ✅ Alerting on complete failure
- ✅ Alerting on processing errors
- ✅ No false positive alerts
- ✅ Alert context inclusion
- ✅ Health check reporting
- ✅ Monitoring disabled mode

**Key Test Classes:**
- `TestMetricsIntegration` - Prometheus metrics
- `TestStructuredLogging` - Logging validation
- `TestAlertingIntegration` - Alert system
- `TestMonitoringWithDisabled` - Disabled mode
- `TestHealthChecks` - Health monitoring
- `TestPerformanceMetrics` - Performance tracking

### 5. `test_analysis_post_integration.py` (606 lines, 15 tests)
**Analysis report integration with posting**

Tests that exploit analysis enhances social media posts:
- ✅ Analysis enhances Twitter threads
- ✅ Engagement hooks in posts
- ✅ Timeline integration
- ✅ Severity indicators visible
- ✅ Historical context usage
- ✅ Different report formats (SHORT/MEDIUM/LONG)
- ✅ Platform-specific enhancements
- ✅ Complete report generation
- ✅ Impact summary accuracy
- ✅ Timeline chronology
- ✅ Source attribution
- ✅ Severity classification
- ✅ End-to-end flow
- ✅ Multiple exploit processing

**Key Test Classes:**
- `TestAnalysisEnhancesPost` - Enhancement validation
- `TestReportFormats` - Format variations
- `TestHistoricalContext` - Context integration
- `TestPlatformSpecificEnhancements` - Platform adaptations
- `TestAnalysisQuality` - Report quality
- `TestIntegrationEndToEnd` - Complete flow

### `conftest.py` (392 lines)
**Shared test fixtures and utilities**

Comprehensive fixture library for all integration tests:
- Sample exploit data (various severity levels)
- Mock platform posters (Reddit, Discord, Telegram, Twitter)
- Mock configurations (all platforms)
- Mock APIs (Kamiyo, WebSocket, HTTP)
- Monitoring mocks (metrics, alerts)
- Utility fixtures (logging, environment, factories)

## Running Tests

### Install Dependencies
```bash
pip install pytest pytest-asyncio pytest-cov
pip install psutil prometheus-client websockets
```

### Run All Integration Tests
```bash
# Verbose with output
pytest tests/integration/ -v

# With coverage
pytest tests/integration/ -v --cov=social --cov-report=html --cov-report=term-missing

# Quiet summary
pytest tests/integration/ -q

# Stop on first failure
pytest tests/integration/ -x

# Run specific test file
pytest tests/integration/test_full_pipeline.py -v

# Run specific test
pytest tests/integration/test_full_pipeline.py::TestFullPipeline::test_exploit_to_post_success -v
```

### Performance Testing
```bash
# Show slowest tests
pytest tests/integration/ -v --durations=10

# With timing details
pytest tests/integration/ -v --durations=0
```

## Test Architecture

### Mock Strategy
All external services are mocked to ensure:
- ✅ No real API calls during testing
- ✅ Fast test execution
- ✅ Deterministic results
- ✅ No API rate limits
- ✅ No external dependencies
- ✅ Safe for CI/CD pipelines

### Mocked Services
- **Kamiyo API** (HTTP REST + WebSocket)
- **Reddit API** (OAuth + posting)
- **Discord Webhooks** (embed messages)
- **Telegram Bot API** (HTML messages)
- **Twitter/X API** (tweets + threads)
- **Prometheus Metrics** (counters, histograms, gauges)
- **Alert Manager** (Slack, Discord, PagerDuty webhooks)

### Test Isolation
- Each test is independent
- No shared state between tests
- Fixtures reset before each test
- Environment variables isolated
- Logs captured per test

## Coverage Goals

### Target Metrics
- **Line Coverage:** >85%
- **Branch Coverage:** >75%
- **Integration Coverage:** 100% of main workflows

### Core Components Covered
| Component | Coverage | Tests |
|-----------|----------|-------|
| `autonomous_growth_engine.py` | ✅ Full | 18 |
| `kamiyo_watcher.py` | ✅ Full | 6 |
| `poster.py` | ✅ Full | 18 |
| `analysis/report_generator.py` | ✅ Full | 15 |
| `monitoring/metrics.py` | ✅ Full | 20 |
| `monitoring/alerting.py` | ✅ Full | 9 |

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.8'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov

      - name: Run integration tests
        run: pytest tests/integration/ -v --cov=social --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v2
        with:
          files: ./coverage.xml
```

## Test Maintenance

### Adding New Tests
1. Use existing fixtures from `conftest.py`
2. Follow naming: `test_<component>_<scenario>`
3. Include clear docstrings
4. Mock external dependencies
5. Test success and failure paths
6. Add parametrized tests for variations

### Example Test Structure
```python
def test_new_feature(
    sample_exploit,
    mock_social_config,
    mock_all_posters,
    capture_logs
):
    """Test that new feature works correctly"""
    # Setup
    engine = AutonomousGrowthEngine(...)

    # Execute
    result = engine.process_exploit(...)

    # Verify
    assert result['success'] is True
    assert "expected log" in capture_logs.text
    assert mock_poster.called
```

## Troubleshooting

### Common Issues

**Import Errors**
```bash
# Missing dependencies
pip install psutil prometheus-client websockets pytest-asyncio

# Wrong Python version
python3 --version  # Should be 3.8+
```

**Fixture Not Found**
```bash
# Check fixture is in conftest.py
pytest --fixtures tests/integration/

# Use correct fixture name from conftest.py
```

**Async Warnings**
```ini
# Add to pytest.ini
[pytest]
asyncio_mode = auto
```

## Best Practices

### Do's ✅
- Use fixtures for test data
- Mock all external services
- Test both success and failure
- Use descriptive test names
- Capture logs for verification
- Test edge cases
- Use parametrized tests for variations

### Don'ts ❌
- Don't make real API calls
- Don't share state between tests
- Don't skip error scenarios
- Don't hardcode test data
- Don't ignore warnings
- Don't test implementation details

## Additional Resources

- [Full Test Report](./INTEGRATION_TEST_REPORT.md)
- [Pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [Coverage.py](https://coverage.readthedocs.io/)

## Summary

✅ **86 comprehensive integration tests**
✅ **3,073 lines of test code**
✅ **Complete mock infrastructure**
✅ **100% main workflow coverage**
✅ **Production-ready test suite**

The integration test suite provides comprehensive validation of the autonomous growth pipeline and is ready for CI/CD integration.
