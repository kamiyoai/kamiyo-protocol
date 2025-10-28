# KAMIYO Refactoring: Exploit Aggregator → x402 Payment Facilitator
**Date:** 2025-10-27
**Status:** IN PROGRESS

## Overview
Removing exploit aggregation functionality to focus solely on x402 payment facilitation.

## Files Being Removed

### Aggregator Code
- `aggregators/` - All exploit aggregator scripts
- `intelligence/source_scorer.py` - Source quality ranking
- `api/websocket_server.py` - WebSocket for exploit updates
- `api/scheduled_tasks.py` - Aggregation scheduling
- `api/community.py` - Community exploit submissions

### Database Code
- `database/manager.py` - Exploit-specific queries
- Exploit-related database schema
- Source health tracking

### API Endpoints (from main.py)
- `/exploits` - List exploits
- `/exploits/{tx_hash}` - Single exploit
- `/stats` - Exploit statistics
- `/chains` - Blockchain list
- `/sources/rankings` - Source rankings
- `/sources/{source_name}/score` - Source score
- `/admin/clean-test-data` - Test data cleanup

### Models
- `api/models.py` - ExploitResponse, StatsResponse models

### Frontend Pages
- `pages/exploit-details.js`
- `pages/sources.js`
- Exploit-related components

## What Stays

### Core Infrastructure
- ✅ Authentication (JWT, API keys)
- ✅ CSRF protection
- ✅ Rate limiting
- ✅ Monitoring & logging
- ✅ Health checks
- ✅ Security headers

### Payment Systems
- ✅ x402 payment system (CORE PRODUCT)
- ✅ Stripe subscriptions
- ✅ Webhook handling
- ✅ Payment verification

### Configuration
- ✅ Environment management
- ✅ Database connection
- ✅ Redis caching
- ✅ API configuration

## New Structure

### API Endpoints
```
GET  /                    # x402 product landing
GET  /health             # Health check
GET  /ready              # Readiness probe
GET  /api/csrf-token     # CSRF token

# x402 Payment Routes
POST /x402/verify         # Verify payment
GET  /x402/token/status   # Token status
GET  /x402/pricing        # Pricing info
GET  /x402/chains         # Supported chains
GET  /x402/admin/*        # Admin endpoints

# Stripe Routes
POST /api/v1/payments/*
POST /api/v1/subscriptions/*
POST /api/v1/webhooks/stripe

# Documentation
GET  /docs               # API docs
GET  /redoc              # API docs (alt)
```

## Migration Notes
- All git history preserved
- Can restore from commit history if needed
- Database schema changes needed for production
- Frontend needs complete rebuild for x402 focus

## Status
- [IN PROGRESS] Documenting removal
- [PENDING] Removing code
- [PENDING] Testing
- [PENDING] Deployment

---
*This refactoring converts KAMIYO from an exploit aggregator to a pure x402 payment facilitator platform.*
