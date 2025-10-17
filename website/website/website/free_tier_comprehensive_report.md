# Kamiyo.ai Free Tier Comprehensive Test Report

**Test Date:** 2025-10-10 15:16:10

## Summary

- ✅ Passed: 12
- ❌ Failed: 5
- ⚠️  Warnings: 1
- ℹ️  Info: 2

## ❌ Failures

- **Stats Endpoint**: HTTP 404
- **Frontend: Home Page**: Error: HTTPConnectionPool(host='localhost', port=3001): Max retries exceeded with url: / (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x1074bccd0>: Failed to establish a new connection: [Errno 61] Connection refused'))
- **Frontend: Dashboard**: Error: HTTPConnectionPool(host='localhost', port=3001): Max retries exceeded with url: /dashboard (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x1074eb250>: Failed to establish a new connection: [Errno 61] Connection refused'))
- **Frontend: Pricing**: Error: HTTPConnectionPool(host='localhost', port=3001): Max retries exceeded with url: /pricing (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x1074ebbb0>: Failed to establish a new connection: [Errno 61] Connection refused'))
- **Frontend: About**: Error: HTTPConnectionPool(host='localhost', port=3001): Max retries exceeded with url: /about (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x10754f550>: Failed to establish a new connection: [Errno 61] Connection refused'))

## ⚠️  Warnings

- **Rate Limit Headers**: No rate limit headers found (may be unauthenticated)

## ✅ Passed Tests

- Backend Health: Database exploits: 424
- Exploits Endpoint: Retrieved 100 exploits
- 24-Hour Delay: Latest data is 63.0 hours old
- Data Quality: All exploits have tx_hash and chain
- Chains Endpoint: 55 chains tracked
- Chain Filtering: All 100 results are Ethereum
- Amount Filtering: All results >= $1M
- Pagination: Page size respected (got 10 items)
- Pagination Metadata: has_more: True
- Restriction: Fork Analysis: Correctly restricted (HTTP 404)
- Restriction: Webhooks: Correctly restricted (HTTP 404)
- Restriction: Watchlists: Correctly restricted (HTTP 401)

## ℹ️  Additional Information

- **Active Sources**: 15/15
- **Latest Exploit Date**: 2025-10-07T22:14:15Z

