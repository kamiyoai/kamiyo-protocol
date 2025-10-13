# Load Testing Guide

## Setup

Install Artillery globally or as a dev dependency:

```bash
npm install -g artillery
# or
npm install --save-dev artillery
```

## Running Tests

### Basic Load Test
Tests API endpoints under realistic load:
```bash
artillery run tests/load/artillery-config.yml
```

### Rate Limit Test
Tests rate limiting enforcement:
```bash
artillery run tests/load/rate-limit-test.yml
```

### Quick Test (Development)
Run a quick smoke test:
```bash
artillery quick --duration 30 --rate 10 http://localhost:3001/api/health
```

## Understanding Results

Artillery provides several key metrics:

- **RPS (Requests Per Second)**: Actual throughput achieved
- **Response Time**:
  - **min**: Fastest response
  - **max**: Slowest response
  - **median**: Middle value (50th percentile)
  - **p95**: 95% of responses were faster than this
  - **p99**: 99% of responses were faster than this
- **Status Codes**: Distribution of HTTP status codes
- **Errors**: Count of failed requests

### Performance Targets

For Kamiyo API:
- **p95 < 500ms**: 95% of requests should complete under 500ms
- **p99 < 1000ms**: 99% of requests should complete under 1 second
- **Error Rate < 1%**: Less than 1% of requests should fail
- **RPS**: Should handle at least 50 requests/sec sustained

## Test Scenarios

### 1. artillery-config.yml
- Warm-up: 5 users/sec for 30s
- Ramp-up: 5→50 users/sec over 60s
- Sustained: 50 users/sec for 120s
- Spike: 100 users/sec for 30s

### 2. rate-limit-test.yml
- Rapid fire: 20 users/sec for 10s
- Makes 10 requests per user
- Expects to see 429 status codes when limits exceeded

## Production Testing

Before load testing production:
1. Use a separate test environment
2. Notify the team
3. Schedule during off-peak hours
4. Start with lower load and gradually increase
5. Monitor database and server resources

## Example Output

```
Summary report @ 14:30:15(+0000)
  Scenarios launched: 3000
  Scenarios completed: 3000
  Requests completed: 12000
  RPS sent: 50
  Request latency:
    min: 45
    max: 890
    median: 120
    p95: 320
    p99: 650
  Scenario duration:
    min: 180
    max: 910
    median: 485
    p95: 820
    p99: 890
  Codes:
    200: 11980
    429: 20
```

This shows good performance with only 20 rate limit errors out of 12,000 requests.
