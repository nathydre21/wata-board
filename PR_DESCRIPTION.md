## Summary

Implements **distributed rate limiting** for the tiered API limiter using **Redis** when `REDIS_URL` is configured. This removes the bypass where limits lived only in process memory (restart or horizontal scaling cleared or split enforcement).

## Purpose / Motivation

Issue [#116](https://github.com/nathydre21/wata-board/issues/116): in-memory rate limiting could be bypassed by restarting the server or routing traffic across multiple instances. Production deployments need a shared store so limits are consistent and durable across replicas.

## Changes Made

- **`TieredRateLimiter`** (`backend/src/middleware/rateLimiter.ts`):
  - When Redis is enabled (`REDIS_URL`), uses Redis sorted sets for a sliding window of request timestamps and a separate counter key for queue depth.
  - Uses **Lua scripts** so check/consume and status reads are atomic and safe under concurrency.
  - Keeps the previous **in-memory** behavior when Redis is not configured (e.g. local dev/tests without Redis).
  - Exposes `resetTime` as ISO strings aligned with `TierRateLimitStatus`.
  - Middleware is **async**, forwards limiter errors via `next(error)` instead of failing silently.
- **Monitoring** (`backend/src/routes/monitoring.ts`): `GET /api/monitoring/rate-limit-status` awaits async `getStatus()`.

## Operational notes

- Set **`REDIS_URL`** in environments where multiple app instances run or restarts must not reset limits (same variable as existing Redis pub/sub for WebSockets).
- Keys use the prefix `rl:tier:requests:` and `rl:tier:queue:` per user id derived from `x-user-id` or IP.

## How to Test

1. **With Redis**: Point `REDIS_URL` at a Redis instance, start the API, and hit `/api/payment` (or any route behind `tieredRateLimiter`) until `429` / queued responses; repeat from another client or after restart — counts should **continue** from shared state, not reset per process.
2. **Without Redis**: Unset `REDIS_URL` — behavior should match prior in-memory limiting for a single process.
3. **Monitoring**: `GET /api/monitoring/rate-limit-status` with `x-user-id` should return tier + limit fields without throwing.

## Breaking Changes

None intended. Response shapes and HTTP status codes for rate limit / queue paths are unchanged; Redis is additive behind configuration.

## Related Issues

Closes nathydre21/wata-board#116

## Checklist

- [x] Implementation scoped to tiered limiter + monitoring route
- [ ] CI / full backend build (repo may have pre-existing TS issues outside this change)
- [ ] Redis connectivity verified in staging
This PR resolves three related reliability issues in one delivery:

- `#120` Missing Error Recovery Mechanism
- `#121` No Offline Payment Queue Persistence
- `#128` Missing Network Congestion Handling

The implementation focuses on resilient payment execution, durable offline queueing, and dynamic congestion-aware fee/retry behavior while preserving existing API contracts.

## Purpose / Motivation

### #120 - Missing Error Recovery Mechanism
Payment and transaction submission failures were not consistently retried, forcing users to manually restart flows after transient failures (timeouts, temporary network issues, rate spikes).

### #121 - No Offline Payment Queue Persistence
Offline queued actions could be fragile across browser sessions and lacked robust retry metadata, creating risk that scheduled/offline payment intents are lost or repeatedly fail without traceability.

### #128 - Missing Network Congestion Handling
Fee selection and retry strategy were not tuned to real-time network congestion, causing avoidable stuck or failed transactions during high-fee periods.

## Changes Made

### #120 - Smart retry and recovery paths
- Added bounded exponential-backoff retry logic for backend payment execution in `backend/src/payment-service.ts`.
- Added retry classification for transient failures (network, timeout, 429/503 patterns) and congestion-related failures.
- Added frontend transaction submission retry loop in `frontend/src/App.tsx` to improve user-facing resilience.

### #121 - Durable offline persistence and sync robustness
- Hardened IndexedDB queue implementation in `frontend/src/services/offlineQueueService.ts`:
  - added retry metadata (`retryCount`, `lastError`)
  - added safer transaction wrapper utilities
  - preserved deterministic queue ordering.
- Improved queue synchronization in `frontend/src/hooks/useOfflineSync.ts`:
  - resilient behavior when history endpoint is unavailable
  - exponential backoff for retryable sync failures
  - metadata updates per retry attempt and failure cause
  - startup sync trigger when already online.
- Fixed network listener cleanup bug in `frontend/src/utils/networkStatus.ts` by using stable listener references.
- Added persistence/restore for scheduled payment tasks in `frontend/src/components/scheduledPaymentService.ts` using IndexedDB so tasks survive browser restarts.

### #128 - Congestion-aware fee handling
- Updated fee estimation in `frontend/src/services/feeEstimation.ts` to use Horizon fee stats and compute dynamic recommended fees based on congestion level.
- Integrated congestion signals into retry behavior (longer backoff profile where needed) in `backend/src/payment-service.ts`.

## Safety / Compatibility
- Existing endpoints and request/response shapes were kept unchanged.
- Changes are additive around retry logic, queue metadata, and fee estimation internals.
- No migration or breaking API contract changes required.

## How to Test
1. **Transient failure retry (`#120`)**
   - Trigger payment flow while simulating intermittent network failures/timeouts.
   - Verify the client/backend retry automatically and recover without manual restart.
   - Expected: payment eventually succeeds or fails after bounded retries with clear error response.

2. **Offline queue persistence (`#121`)**
   - Go offline and queue payment/scheduled payment actions.
   - Close and reopen browser/app, then reconnect network.
   - Expected: queued items are restored from IndexedDB and replayed automatically.

3. **Congestion handling (`#128`)**
   - Simulate elevated network fee environment (or mock fee stats with high p90 values).
   - Verify recommended fee increases dynamically and retry path adapts.
   - Expected: fewer stuck submissions and improved completion under congestion.

4. **Listener cleanup / no duplicate sync**
   - Toggle online/offline repeatedly and navigate routes.
   - Expected: sync triggers correctly without accumulating duplicate listeners.

## Verification Notes
- Full local automated verification was limited in this environment due to missing toolchain commands (`tsc`/`playwright` not available at runtime).
- Manual validation steps above should be run in CI/dev environment with full dependencies.

## Breaking Changes
- None.

## Related Issues
Closes nathydre21/wata-board#120
Closes nathydre21/wata-board#121
Closes nathydre21/wata-board#128

## Checklist
- [ ] Code builds successfully
- [ ] Tests added/updated
- [ ] No console errors
- [x] Documentation updated
