# Performance Monitoring

This document describes the performance monitoring and alerting that runs in CI for
Wata Board (issue #375). It tracks build times, frontend bundle size, and Lighthouse
scores, enforces performance budgets, and surfaces regressions on every pull request.

## Overview

| Concern | Where | Trigger |
|---|---|---|
| Frontend build time | `frontend-perf` job | push to `main`/`develop`, PRs to `main` |
| Bundle size (absolute + budgets) | `frontend-perf` job → `scripts/perf/measure-bundle.mjs` | push, PR |
| Bundle size regression (vs base) | `bundle-size` job → [compressed-size-action] | PR only |
| Backend build time | `backend-build-time` job | push, PR |
| Lighthouse performance / a11y / best-practices / SEO | `lighthouse` job → [lighthouse-ci-action] | push, PR |
| Consolidated dashboard + PR comment | `perf-dashboard` job → `scripts/perf/render-dashboard.mjs` | push, PR |

All of the above live in [`.github/workflows/performance.yml`](../.github/workflows/performance.yml).

Unlike the test workflows in this repo (currently disabled via `if: false` because they
require Postgres/Redis services), the performance workflow is **self-contained** — it only
builds the apps and inspects the output — so it is enabled by default.

## Performance budgets

Budgets are defined centrally in
[`.github/performance-budgets.json`](../.github/performance-budgets.json):

```jsonc
{
  "frontend": {
    "buildTimeSeconds": { "budget": 300, "warn": 180 },
    "totalJsGzipKb":    { "budget": 1800, "warn": 1300 },
    "totalCssGzipKb":   { "budget": 120, "warn": 80 },
    "totalAssetsGzipKb":{ "budget": 2200, "warn": 1600 },
    "perChunkGzipKb":   { "budget": 1200, "warn": 800 }
  },
  "backend": { "buildTimeSeconds": { "budget": 180, "warn": 120 } }
}
```

Each metric reports one of:

- ✅ **within budget** — under the `warn` threshold
- ⚠️ **approaching budget** — between `warn` and `budget`
- ❌ **over budget** — above `budget`
- ➖ **no budget set**

### Advisory vs. enforced

By default budgets are **advisory**: the dashboard reports status but the build stays green.
To make hard-budget (❌) breaches fail the build, either:

- set the repository variable `PERF_ENFORCE=true` (Settings → Secrets and variables → Actions → Variables), or
- run the workflow manually (Actions → Performance Monitoring → Run workflow) with **enforce = true**.

Regressions relative to the PR's base branch are always surfaced by the `bundle-size`
job as a PR comment, independent of the advisory/enforced setting.

## Alerting

Two mechanisms alert on regressions:

1. **Bundle-size PR comment** — [compressed-size-action] builds both the base branch and the
   PR head, then comments a per-file gzipped size diff. Changes below
   `regression.minimumChangeThresholdBytes` (150 B) are treated as noise.
2. **Performance dashboard comment** — a single sticky comment (updated in place on each push)
   summarising build time, bundle size vs. budgets, and Lighthouse scores, with ⚠️/❌ flags.

Lighthouse assertions in [`lighthouserc.json`](../lighthouserc.json) are set to `warn` level so
they annotate the run without failing it; tighten to `error` once the app has a stable baseline.

## The dashboard

`perf-dashboard` aggregates the artifacts from the other jobs and renders `dashboard.md` into:

- the **workflow run summary** (Actions → run → Summary), and
- a **sticky PR comment** (created once, updated on subsequent pushes).

The full Lighthouse HTML report is uploaded to Lighthouse's temporary public storage; the link
appears in the dashboard, and the raw results are also kept as the `lighthouse-report` artifact.

## Running locally

```bash
# Frontend bundle report against the committed budgets
cd frontend && npm ci && npx vite build --base=/ && cd ..
node scripts/perf/measure-bundle.mjs \
  --dist frontend/dist \
  --budgets .github/performance-budgets.json \
  --build-seconds 0 \
  --out perf-metrics.json --summary bundle-summary.md
cat bundle-summary.md

# Lighthouse (requires @lhci/cli: npx --yes @lhci/cli autorun)
npx --yes @lhci/cli autorun --config=./lighthouserc.json
```

## Trending

Each run uploads `perf-metrics.json` / `backend-build.json` as 90-day artifacts, and the
`bundle-size` job provides the head-vs-base delta on PRs. For longer-term historical trends,
point the uploaded metrics at an external store (e.g. Bencher, or commit them to a dedicated
`perf-metrics` branch) — the JSON schema is stable and designed for that.

[compressed-size-action]: https://github.com/preactjs/compressed-size-action
[lighthouse-ci-action]: https://github.com/treosh/lighthouse-ci-action
