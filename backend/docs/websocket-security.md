# WebSocket Security

This document describes the security hardening applied to the realtime
WebSocket service (`src/services/websocketService.ts`). The security-sensitive
logic lives in a dedicated, unit-tested module: `src/services/websocketSecurity.ts`.

Addresses issue #368.

## Threat model

The WebSocket endpoint accepts long-lived, bidirectional connections from
browsers and native clients. Without hardening it is exposed to:

| Threat | Mitigation |
| --- | --- |
| **Unauthenticated access** to realtime transaction data | Per-connection authentication (JWT / API key / user-id) |
| **Cross-Site WebSocket Hijacking (CSWSH)** — a malicious page opening a socket as the victim | Origin allow-listing at the handshake |
| **Connection flooding / resource exhaustion** | Per-IP concurrency cap + new-connection rate limit, enforced before the upgrade completes |
| **Idle/zombie connections** holding server resources | Idle timeout + optional hard lifetime cap |
| **JWT downgrade / forgery** (`alg: none`, tampered payload) | Constant-time HMAC verification; `none` and non-allow-listed algorithms rejected |
| **Blind operation** under attack | Security metrics counters for monitoring/alerting |

## Handshake gates (before the upgrade completes)

The `verifyClient` callback rejects abusive clients *before* a socket is held:

1. **Origin validation** — the `Origin` header is normalised (lower-cased,
   trailing slash stripped) and matched against the allow-list. Rejected
   handshakes return **HTTP 403**. Browsers always send `Origin`; a missing
   origin denotes a non-browser client and is allowed unless
   `WS_STRICT_ORIGIN=true`. An allow-list entry of `*` disables the check.
2. **Connection limiting** — per-IP concurrency and new-connection rate are
   checked. Rejected handshakes return **HTTP 429**.

## Post-handshake authentication

Once the socket opens, the connection is authenticated in this order
(`authenticateWebSocket`). The first applicable method wins:

1. **JWT** (when `WS_JWT_SECRET` is set) — bearer token from
   `Authorization: Bearer <jwt>` or `?token=<jwt>`. Verified with a
   zero-dependency HMAC verifier (HS256/384/512). A token that *looks* like a
   JWT (three segments) but fails verification is **rejected outright** — there
   is no silent fallthrough to a weaker method. The `tier` claim, if present and
   recognised, sets the client tier.
2. **Static API key** — matched in constant time against `API_KEY`.
3. **Bare user id** (`x-user-id` / `?user_id=`) — anonymous-tier access.
4. **Development/test only** — unauthenticated clients become `dev-anonymous`.
   In production, an unauthenticated connection is closed with code **4001**.

## Connection lifecycle

- **Idle timeout** (`WS_IDLE_TIMEOUT_MS`, default 5 min): a connection with no
  inbound messages is closed with code **4408**.
- **Max lifetime** (`WS_MAX_CONNECTION_MS`, default disabled): a connection
  older than this is closed with code **4409**.
- On close, the per-IP connection slot is released.

### Application close codes

| Code | Meaning |
| --- | --- |
| 4001 | Authentication required / failed |
| 4408 | Idle timeout |
| 4409 | Max connection lifetime reached |

## Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `WS_JWT_SECRET` | _(unset)_ | Enables JWT auth when set |
| `WS_JWT_ALGORITHMS` | `HS256` | Allowed signing algorithms (comma-separated) |
| `WS_JWT_ISSUER` / `WS_JWT_AUDIENCE` | _(unset)_ | Optional claim validation |
| `WS_ALLOWED_ORIGINS` | CORS allow-list | Comma-separated origin allow-list; `*` disables the check |
| `WS_STRICT_ORIGIN` | `false` | Reject connections with no `Origin` header |
| `WS_MAX_CONNECTIONS_PER_IP` | `20` | Max concurrent connections per IP |
| `WS_NEW_CONNECTION_MAX` | `30` | Max new connections per IP per window |
| `WS_NEW_CONNECTION_WINDOW_MS` | `60000` | Rate-limit window |
| `WS_IDLE_TIMEOUT_MS` | `300000` | Idle timeout (0 disables) |
| `WS_MAX_CONNECTION_MS` | `0` | Hard lifetime cap (0 disables) |
| `TRUST_PROXY` | `false` | Read client IP from `X-Forwarded-For` |

> **Reverse proxies:** per-IP limits key on the client IP. Behind an ingress or
> load balancer, set `TRUST_PROXY=true` so the left-most `X-Forwarded-For`
> entry is used; otherwise every client appears to share the proxy's IP. Only
> enable this when a trusted proxy actually sets the header, since it is
> client-spoofable when directly exposed.

## Monitoring

`getWebSocketSecurityMetrics()` (also surfaced via `getWebSocketStats()`)
exposes counters for `authFailures`, `jwtVerified`, `jwtRejected`,
`originRejected`, `connectionRateLimited`, `ipConcurrencyRejected`,
`messageRateLimited`, `idleTimeouts`, `maxLifetimeClosures`, and a rolled-up
`totalRejectedHandshakes`. Wire these into your alerting to detect abuse.

## Tests

- `src/__tests__/websocketSecurity.test.ts` — unit tests for JWT verification,
  origin validation, IP extraction, the connection guard, and metrics.
- `src/__tests__/websocketService.security.test.ts` — integration tests that
  start a real server and drive it with a real client to prove the handshake
  gates (403 origin, 429 flood, 4001 auth, valid-JWT acceptance).

Run them with:

```bash
npm test -- websocket
```
