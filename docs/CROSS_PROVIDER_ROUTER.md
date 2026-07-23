# Cross-Provider Payment Router & Saga

`backend/src/services/providerRouter.ts` (additive to `MultiProviderPaymentService`)
provides deterministic provider routing, a partial-failure compensation saga, and
settlement-finality gating for bulk/multi-provider payments.

## Provider selection strategies (pluggable)
- `round-robin` — rotates the available provider set; deterministic.
- `weighted` — orders by success rate (best first), with a small floor so a
  0-rate provider can still be a failover target.
- `health-gated` — only providers with success rate >= 0.8, sorted by rate;
  falls back to the full set if none qualify.

`routeProviders(providers, strategy, health)` excludes providers whose
`ProviderHealth.isAvailable(id)` is false — i.e. an open circuit breaker. A
`circuitBreakerHealth()` adapter backs `ProviderHealth` with the existing
`CircuitBreaker` instances (OPEN => unavailable).

## Bulk-payment saga (`processBulkPayment`)
1. Submits each leg via `submit(leg)`. On the **first leg failure**, it
   aborts and **compensates** (refunds) all already-submitted legs in reverse
   order, emitting `BulkPaymentCompensated`. (A compensation failure leaves the
   leg `pending` for manual reconciliation.)
2. **Finality gating**: does not mark a leg `confirmed` until its ledger is
   sealed. Polls `horizon.isFinalized(hash)` until sealed or the per-leg budget
   expires; unsealed legs become `not_sealed` and the bulk result is `pending`.
3. Emits `BulkPaymentSettled` only when every leg is sealed.

## Events
`BulkPaymentSettled`, `BulkPaymentCompensated`, `LegSubmitted`, `LegFailed`.
Listeners are isolated (a throwing listener never breaks the saga).

## Tests (`backend/src/__tests__/providerRouter.test.ts`)
- round-robin rotation; weighted ordering; health-gated threshold + fallback.
- breaker-open provider excluded from routing.
- A succeeds / B reverts -> A compensated.
- ledger-not-yet-sealed -> `pending` (not confirmed).
- compensation failure -> leg stays `pending`.

## Follow-ups
- Persist the saga state machine (e.g. `bulk_payment_legs` table) so a backend
  restart can resume compensation.
- Real horizon finality client + ledger-sequence monotonicity as the seal signal.
