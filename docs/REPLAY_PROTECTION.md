# Replay Protection & Idempotent Payment Submission

Defence in depth against duplicate payment submission from network retries,
double-clicks, and offline-queue replays. Two layers work together: an
on-chain nonce uniqueness guard and a server-side `Idempotency-Key` cache.

## Layer 1 — on-chain nonce uniqueness (Soroban contract)

`NepaBillingContract::pay_bill` already keeps a `(payer, nonce)` replay guard:
- `NONCE` -> `bool`: panics (`Nonce already used - potential replay attack`) on
  reuse. Kept for backward compatibility.
- **New**: `NONCE_PID` -> `payment_id`: maps each `(payer, nonce)` to the
  resulting `payment_id`, so a retried submission can be resolved to the
  *existing* payment instead of re-submitting.
- **New**: `payment_by_nonce(payer, nonce) -> u64` query returns the
  `payment_id` for a given `(payer, nonce)` (panics if none).
- **New**: `nonce_exists(payer, nonce) -> bool` query.

A client that retries a payment should first call `nonce_exists`; if true,
fetch `payment_by_nonce` and return that result instead of re-submitting.

### Pruning / storage growth
The `(payer, nonce)` maps grow with usage. Recommended pruning: rotate on a
payer `nonce` rollover window — e.g. include a per-payer epoch in the nonce so
old epochs' entries can be archived, keeping only the current epoch live. (No
auto-pruning is enforced on-chain yet; tracked as a follow-up.)

## Layer 2 — server-side `Idempotency-Key` (backend)

`backend/src/middleware/idempotency.ts`:
- Clients send an `Idempotency-Key` header on payment requests.
- First request is processed and its response cached (TTL 24h, >= Stellar
  finality windows); identical retries within the TTL return the cached
  response **without re-submitting to the chain**.
- In-flight duplicate keys get `409 IDEMPOTENCY_IN_FLIGHT`.
- `5xx` responses are **not** cached and the lock is released so the client can
  retry with the same key.
- Storage is pluggable: `RedisIdempotencyStore` (atomic `SET NX EX`) for
  production, `MemoryIdempotencyStore` for dev/tests/fallback.
- Wired into `/api/v1/payment`, `/api/v2/payment`, and
  `/api/v2/payment/multi-provider`.
- Missing header passes through (the on-chain nonce still guards replay).

## Layer 3 — deterministic client nonce (offline queue)

Clients (and `frontend/src/services/offlineQueueService.ts`) mint a
**deterministic** nonce via `generatePaymentNonce(payer, meterId, amount,
sequence)` (see `shared/types.ts`) — derived from payer + meter + amount + a
client-local sequence, **not** the wall clock. So an offline-queued payment and
a later online submission of the same logical payment produce the same nonce
and converge on one on-chain payment; the contract rejects the duplicate.

## Tests
- `backend/src/__tests__/idempotency.test.ts` — replay, in-flight 409, 5xx
  retryability, route scoping, no-header pass-through.
- Contract change is additive; contract-level tests require the Soroban
  toolchain (`cargo test`) — note: `contract/src/test.rs` predates the current
  `pay_bill(env, from, token, meter, amount, memo, nonce)` signature and needs
  a separate sync (out of scope for this change).
