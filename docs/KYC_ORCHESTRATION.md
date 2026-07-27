# KYC / AML Orchestration

A verification pipeline that ties user **tiers** to payment/withdrawal limits,
screens identities against **sanctions / PEP** lists via a pluggable adapter,
and drives a resumable, retry-safe **state machine**. Lives alongside the
existing `kyc-service.ts` (kept for backward compatibility) as the
authoritative orchestration layer.

## State machine

```
Initiated -> DocumentsSubmitted -> Screening -> Review -> Approved
                                 |             |
                                 v             v
                              Rejected      Rejected
```

- Transitions are **idempotent**: repeated identical transitions are no-ops.
- Illegal transitions throw (e.g. `Initiated -> Approved` is rejected).
- A full audit history of every transition is kept on the record.
- After rejection, a user may re-initiate (`Rejected -> Initiated`).

## Tier matrix

Enforced on payment and refund routes via `kycTierEnforcement` middleware.

| Tier | Max payment | Max refund | Withdraw | Provider ops | How to reach |
|------|-------------|------------|----------|--------------|--------------|
| 0 | 0 (blocked) | 0 | no | no | default |
| 1 | 500 | 200 | no | no | screening clear / manual approval |
| 2 | 10,000 | 5,000 | yes | no | operator upgrade after extra verification |
| 3 | unlimited | unlimited | yes | yes | operator upgrade (providers) |

## Sanctions screening

- Interface: `SanctionsScreeningAdapter` (`screen(input) -> result`).
- `MockSanctionsScreeningAdapter` for tests/local; a real provider implements
  the same interface and is injected at composition root.
- `CachedScreeningAdapter` wraps an adapter with a TTL'd result cache
  (default 24h) and supports manual re-screen (`rescreen()`).
- **PII policy**: raw screening artifacts are not persisted here; only derived
  risk flags are returned. Raw artifacts belong in the encrypted off-chain
  PII vault (see issue #310).

## Retry-safe verification

`runScreening()` retries the provider with exponential backoff
(`maxAttempts`, `baseDelayMs`, `maxDelayMs`). If the provider stays
unavailable, the user is moved to **Review** (safe degradation): high-value
payments stay blocked until a human resolves it. Successful clear screenings
auto-approve; `review`/`rejected` risk routes to manual Review.

## Enforcement

```ts
import { kycOrchestration, requirePaymentTier, requireRefundTier } from '...';
app.post('/payments', requirePaymentTier(kycOrchestration), paymentHandler);
app.post('/refunds',  requireRefundTier(kycOrchestration),  refundHandler);
```

Violations return:
- `403 KYC_REQUIRED` — user not KYC verified
- `422 TIER_LIMIT_EXCEEDED` — amount above the tier's limit

## Notifications

Subscribe with `service.on(listener)` to hook webhooks / email / push on
`state-transition`, `screening-complete`, `tier-upgraded`, `screening-failed`.
Listeners are isolated: a failing listener never breaks orchestration.

## Tests

`backend/src/__tests__/kycOrchestration.test.ts` covers: state-machine walks,
illegal/idempotent transitions, screening retry + safe degradation, tier
enforcement (payment/refund), and the screening result cache (TTL/invalidation).
