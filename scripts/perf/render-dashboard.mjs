#!/usr/bin/env node
// render-dashboard.mjs — combine bundle metrics, backend build time and Lighthouse results
// into a single Markdown performance dashboard (for the job summary and a sticky PR comment).
//
// Usage:
//   node scripts/perf/render-dashboard.mjs \
//     --metrics perf-metrics.json \
//     --backend backend-build.json \
//     --budgets .github/performance-budgets.json \
//     --lhci-manifest .lighthouseci/manifest.json \
//     --lhci-links .lighthouseci/links.json \
//     --sha "$GITHUB_SHA" --context "PR #123" \
//     --out dashboard.md
//
// Every input is optional; sections whose inputs are missing are rendered as "not available".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (!x.startsWith('--')) continue;
    const k = x.slice(2); const n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; }
  }
  return a;
}
const readJson = (p) => (p && p !== true && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const emoji = (s) => ({ ok: '✅', warn: '⚠️', over: '❌', 'n/a': '➖' }[s] || '➖');

const args = parseArgs(process.argv.slice(2));
const metrics = readJson(args.metrics);
const backend = readJson(args.backend);
const budgets = readJson(args.budgets) || {};
const lhciManifest = readJson(args['lhci-manifest']);
const lhciLinks = readJson(args['lhci-links']);

const MARKER = '<!-- perf-dashboard -->';
let md = `${MARKER}\n## 🚦 Performance Dashboard\n\n`;
const sha = typeof args.sha === 'string' ? args.sha.slice(0, 7) : '';
md += `_${args.context || 'CI run'}${sha ? ` • commit \`${sha}\`` : ''}_\n\n`;

// ---- Build time ----
md += '### ⏱️ Build time\n\n| Target | Time | Budget | Status |\n|---|--:|--:|:--:|\n';
if (metrics?.checks?.buildTime) {
  const b = metrics.checks.buildTime;
  md += `| Frontend | ${b.value}s | ${b.budget ?? '—'}${b.budget != null ? 's' : ''} | ${emoji(b.status)} |\n`;
}
if (backend && backend.seconds != null) {
  const spec = budgets.backend?.buildTimeSeconds; const v = backend.seconds;
  const status = spec ? (spec.budget != null && v > spec.budget ? 'over' : spec.warn != null && v > spec.warn ? 'warn' : 'ok') : 'n/a';
  md += `| Backend | ${v}s | ${spec?.budget ?? '—'}${spec?.budget != null ? 's' : ''} | ${emoji(status)} |\n`;
}
if (!metrics?.checks?.buildTime && !(backend && backend.seconds != null)) md += '| — | — | — | ➖ |\n';
md += '\n';

// ---- Bundle ----
if (metrics?.checks) {
  const c = metrics.checks;
  md += '### 📦 Frontend bundle (gzip)\n\n| Metric | Value | Budget | Status |\n|---|--:|--:|:--:|\n';
  const row = (label, ch) => (ch ? `| ${label} | ${ch.value} ${ch.unit} | ${ch.budget ?? '—'} ${ch.budget != null ? ch.unit : ''} | ${emoji(ch.status)} |\n` : '');
  md += row('JS total', c.totalJsGzip);
  md += row('CSS total', c.totalCssGzip);
  md += row('All assets', c.totalAssetsGzip);
  md += row(`Largest chunk${c.largestChunkGzip?.chunk ? ` (\`${c.largestChunkGzip.chunk}\`)` : ''}`, c.largestChunkGzip);
  md += '\n';
  if (metrics.chunks?.length) {
    md += '<details><summary>Per-chunk breakdown</summary>\n\n| Chunk | Raw | Gzip | Brotli |\n|---|--:|--:|--:|\n';
    for (const ch of metrics.chunks) md += `| \`${ch.chunk}\` | ${ch.rawKb} KB | ${ch.gzipKb} KB | ${ch.brotliKb} KB |\n`;
    md += '\n</details>\n\n';
  }
} else {
  md += '### 📦 Frontend bundle\n\n_Bundle metrics not available for this run._\n\n';
}

// ---- Lighthouse ----
if (Array.isArray(lhciManifest) && lhciManifest.length) {
  const rep = lhciManifest.find((r) => r.isRepresentativeRun) || lhciManifest[0];
  const s = rep.summary || {};
  const pct = (x) => (x == null ? '—' : Math.round(x * 100));
  const scoreStatus = (x) => (x == null ? 'n/a' : x >= 0.9 ? 'ok' : x >= 0.5 ? 'warn' : 'over');
  md += '### 🔦 Lighthouse (median run)\n\n| Category | Score | Status |\n|---|--:|:--:|\n';
  md += `| Performance | ${pct(s.performance)} | ${emoji(scoreStatus(s.performance))} |\n`;
  md += `| Accessibility | ${pct(s.accessibility)} | ${emoji(scoreStatus(s.accessibility))} |\n`;
  md += `| Best practices | ${pct(s['best-practices'])} | ${emoji(scoreStatus(s['best-practices']))} |\n`;
  md += `| SEO | ${pct(s.seo)} | ${emoji(scoreStatus(s.seo))} |\n`;
  const link = lhciLinks && rep.url ? lhciLinks[rep.url] : null;
  if (link) md += `\n📊 [Full Lighthouse report](${link})\n`;
  md += '\n';
} else {
  md += '### 🔦 Lighthouse\n\n_Full report is uploaded as a workflow artifact (`lighthouse-report`)._\n\n';
}

md += '---\n<sub>✅ within budget • ⚠️ approaching budget • ❌ over budget • ➖ no budget set. '
   + 'Budgets live in `.github/performance-budgets.json`; details in `docs/PERFORMANCE_MONITORING.md`.</sub>\n';

writeFileSync(args.out && args.out !== true ? args.out : 'dashboard.md', md);
process.stdout.write(md);
