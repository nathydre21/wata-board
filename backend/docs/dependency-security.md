# Dependency Security

This document records the dependency-audit posture for the repository and the
rationale behind every accepted exception. It addresses issue #363.

The goal is simple: **no HIGH or CRITICAL vulnerability may ship in a
production dependency tree.** Development-only tooling advisories and advisories
that are structurally un-fixable (transitively pinned by an upstream SDK) are
tracked here as explicit, reviewable exceptions instead of being silenced
blindly.

## Ecosystems and tooling

| Ecosystem | Location | Tool | Manifest |
| --- | --- | --- | --- |
| Backend (Node/TypeScript) | `backend/` | `npm audit` | `package-lock.json` |
| Frontend (Node/React/Vite) | `frontend/` | `npm audit` | `package-lock.json` |
| Smart contract (Rust/Soroban) | `contract/` | `cargo audit` | `Cargo.lock` |

## The CI gate

The blocking gate is the **`dependency-audit`** job in
`.github/workflows/comprehensive-tests.yml`. It runs on every push and pull
request, and `quality-gates` depends on it, so a failure blocks the pipeline.

The gate has two tiers:

1. **Blocking** — production dependencies only:
   - `npm audit --omit=dev --audit-level=high` for backend and frontend.
   - `cargo audit` for the contract (ignore list in
     `contract/.cargo/audit.toml`).
   A HIGH/CRITICAL advisory in any shipped dependency fails the build.
2. **Report-only** — the full tree including `devDependencies`
   (`npm audit` with no `--omit`). This keeps dev-tooling advisories visible in
   the CI log without blocking delivery.

Historically the audit steps were scattered across jobs with
`continue-on-error: true` / `|| true`, i.e. they never actually failed a build.
Those non-blocking steps were removed in favour of the single gate above.

## Local pre-commit hook

`backend/.husky/pre-commit` runs the same production gate
(`npm audit --omit=dev --audit-level=high`) before a commit — but only for the
ecosystem whose `package.json` / `package-lock.json` is actually staged, so
unrelated commits are not slowed down. It is network-tolerant: if the registry
is unreachable it warns and skips (CI remains the authoritative enforcement).

Husky is wired up on `npm install` in `backend/` via the `prepare` script. To
bypass the hook for a single commit (e.g. a documented exception):

```bash
git commit --no-verify
```

## Running audits locally

```bash
# Backend / frontend — production gate (what CI blocks on)
cd backend  && npm audit --omit=dev --audit-level=high
cd frontend && npm audit --omit=dev --audit-level=high

# Full tree, including dev tooling (informational)
npm audit

# Contract — reads contract/.cargo/audit.toml automatically
cd contract && cargo audit
```

The backend also exposes `npm run audit:prod` (the gate) and `npm run audit:all`
(full tree).

## Findings and remediation

### Backend — clean (0 vulnerabilities)

All advisories were remediated. Most were resolved within existing semver
ranges via `npm audit fix`. The following required explicit version bumps:

| Package | Change | Notes |
| --- | --- | --- |
| `nodemailer` | `^6.9.7` → `^9.0.6` | Major bump; resolves the advisory chain. Type-checked clean against existing usage. |
| `@types/nodemailer` | `^6.4.14` → `^8.0.1` | Kept in step with the runtime major. |
| `js-yaml` | `^4.1.1` → `^4.3.2` | Picks up the patched release. |

`npm audit --omit=dev --audit-level=high` and the full `npm audit` both report
**0 vulnerabilities**.

> **Note on the lock-file diff.** Most of the `backend/package-lock.json` change
> is not the three bumps above. `npm audit fix` also floated the `artillery`
> dev-dependency (pinned to `latest`) from 2.0.30 to 2.0.34, which clears a large
> set of advisories in its bundled AWS-SDK subtree and pulls that whole subtree
> forward. Nothing in the shipped (production) tree changed beyond the packages
> listed above.

### Frontend — production clean (0 high/critical)

Two things were done:

1. **Lock-file repair.** The committed `package-lock.json` was out of sync with
   `package.json` (`npm ci` failed — missing `qrcode`/`terser` subtrees). It was
   regenerated, which both repairs the install and pulls in the patched
   versions below.
2. **Security patches** (all within existing semver ranges, plus one override):

   | Package | Patched version | Reached via |
   | --- | --- | --- |
   | `react-router` / `react-router-dom` | `7.18.3` | direct dependency |
   | `nanoid` | `3.3.18` | `overrides` (constrained by `postcss`) |
   | `brace-expansion` | `1.1.18`, `5.0.9` | transitive (both major lines) |
   | `js-yaml` | `4.3.2` | transitive |
   | `dompurify` | `3.4.14` | transitive |
   | `qrcode` | `1.5.4` | direct dependency |

   The `nanoid` pin is expressed as an `overrides` entry because `postcss`
   otherwise holds it below the patched version.

`npm audit --omit=dev --audit-level=high` reports **0 vulnerabilities**.

#### Accepted exception: Vitest dev-server (dev-only)

The full `npm audit` reports **3 critical** advisories, all in the
`vitest` / `@vitest/coverage-v8` / `@vitest/ui` chain:

- **GHSA-5xrq-8626-4rwp** — "When the Vitest UI server is listening, an
  arbitrary file can be read and executed."

This is exploitable only while a developer is running the Vitest UI dev server
locally; it is never present in a production build or at runtime. The fix is a
major upgrade of the test runner (`vitest` v1 → v4) with breaking changes to the
test config and coverage tooling, which is out of scope for a dependency-security
change and is tracked separately. Because it is dev-only, it is **report-only**
and does not gate delivery.

### Contract — 2 accepted exceptions (host/test-only)

`cargo audit` reports two advisories, both **ignored** via
`contract/.cargo/audit.toml`:

| Advisory | Crate | Why it cannot be fixed | Why it is low risk |
| --- | --- | --- | --- |
| `RUSTSEC-2024-0344` | `curve25519-dalek` ≤ 4.1.2 | `soroban-env-host` 20.3.0 hard-pins `curve25519-dalek = ">=4.1.1, <=4.1.2"`; the patched `4.1.3` needs a `soroban-sdk` major upgrade (20 → 28). | `soroban-env-host` is build/test host tooling and is **not** compiled into the deployed wasm. |
| `RUSTSEC-2026-0009` | `time` | Reached through the same `soroban-env-host` chain; blocked by the same SDK pin. | Same as above — host/test only, not in the on-chain artifact. |

Both are consciously accepted with per-advisory rationale recorded in
`contract/.cargo/audit.toml`.

## Maintenance / review triggers

- **On any `soroban-sdk` upgrade:** re-run `cd contract && cargo audit` with an
  empty ignore list. A move off the 20.x line is expected to clear both contract
  exceptions — remove them from `contract/.cargo/audit.toml` so they gate again.
- **When the test stack is next upgraded:** move `vitest` to a release line that
  no longer carries GHSA-5xrq-8626-4rwp and drop this exception.
- **Whenever a gate exception is added:** document the advisory, why it cannot be
  fixed now, and why it is safe — here and (for the contract) in the audit
  config. An exception without a rationale is a bug.
