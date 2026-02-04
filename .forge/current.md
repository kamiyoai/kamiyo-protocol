# Forge Session: KEIRO Mobile App & API

## Target Files

### API (services/keiro-api)
- `src/index.ts`
- `src/types/index.ts`
- `src/routes/agents.ts`
- `src/routes/jobs.ts`
- `src/services/agents.ts`
- `src/services/jobs.ts`

### Mobile App (apps/keiro)
- `src/lib/api.ts`
- `src/lib/constants.ts`
- `src/lib/solana.ts`
- `src/stores/wallet.ts`
- `src/stores/agent.ts`
- `src/stores/app.ts`

## Current Phase: 6 (Complete)

## Progress
- [x] Phase 3: Harden - GPT-5 batch execution
- [x] Phase 4: Test - GPT-5 batch execution
- [x] Phase 5: Humanize - GPT-5 batch execution
- [x] Phase 6: External Review - GPT-5 batch execution

## GPT-5 Findings

### Critical
- Route order bug: GET /wallet/:address unreachable due to /:id catch-all - **Fixed**
- Anyone can start a job without verification - **Fixed**: Added StartJobRequestSchema
- AbortController reused across retries - **Fixed**: New controller per attempt
- JSON parsing breaks for non-JSON responses - **Fixed**: Content-type check

### High
- Rate limiter never prunes expired entries - **Fixed**: Added periodic cleanup
- Submit route doesn't verify wallet ownership - **Fixed**: Validates agent exists
- Agent ID collision under concurrency - **Fixed**: Uses time+random suffix
- URL double-slash concatenation - **Fixed**: Normalize baseUrl/endpoints
- Retrying non-idempotent requests - **Fixed**: Only retry GET/HEAD

### Medium
- IP only from x-forwarded-for - **Fixed**: Added cf-connecting-ip, x-real-ip
- Shared Connection instance in solana.ts - **Fixed**: getConnection() singleton
- Unused bs58 import - **Fixed**: Removed

## Security Improvements
- Rate limiting with periodic cleanup (60s sweep)
- Request ID tracking for debugging
- Proper CORS origin normalization
- Global exception handlers
- StartJobRequestSchema for wallet verification

## Test Results
- 53 tests passing
  - Service tests: agents (9), jobs (10)
  - Route tests: agents (11), jobs (14), earnings (9)
- TypeScript compilation successful

## Additional Hardening
- Fixed earnings service ID collision (uses time+random suffix)
- Added route tests verifying /wallet/:address reachable before /:id
- Added full job workflow tests (accept → start → submit → rate)
- Added earnings route tests
