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
