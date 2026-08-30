#!/usr/bin/env node
// measure-bundle.mjs — measure a Vite build output and check it against performance budgets.
//
// Emits raw / gzip / brotli sizes per asset and per chunk, evaluates totals against
// .github/performance-budgets.json, and writes a JSON metrics file + a Markdown summary.
//
// Usage:
//   node scripts/perf/measure-bundle.mjs \
//     --dist frontend/dist \
//     --budgets .github/performance-budgets.json \
//     --build-seconds 42 \
//     --out perf-metrics.json \
//     --summary bundle-summary.md \
//     [--enforce]
//
// Exit code: 0 unless --enforce is passed AND a hard ("budget") threshold is exceeded (then 1).
// A missing/invalid dist directory exits 2.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zconst } from 'node:zlib';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const KB = 1024;
const toKb = (b) => Math.round((b / KB) * 100) / 100;

// Vite emits `assets/<name>.<hash>.<ext>`; the chunk name is the part before the first dot.
const chunkNameFromFile = (file) => basename(file).split('.')[0] || basename(file);

function classify(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'js';
  if (ext === '.css') return 'css';
  if (ext === '.map') return 'map';
  if (ext === '.html') return 'html';
  return 'asset';
}

function evalBudget(valueKb, spec) {
  if (!spec) return { status: 'n/a', budget: null, warn: null };
  const over = spec.budget != null && valueKb > spec.budget;
  const warn = spec.warn != null && valueKb > spec.warn;
  return { status: over ? 'over' : warn ? 'warn' : 'ok', budget: spec.budget ?? null, warn: spec.warn ?? null };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const budgets = args.budgets && existsSync(args.budgets) ? JSON.parse(readFileSync(args.budgets, 'utf8')) : {};
  const fe = budgets.frontend || {};
  const buildSeconds = args['build-seconds'] != null && args['build-seconds'] !== true ? Number(args['build-seconds']) : null;

  const distDir = args.dist;
  if (!distDir || !existsSync(distDir)) {
    console.error(`[measure-bundle] dist directory not found: ${distDir}`);
    process.exit(2);
  }

  const files = walk(distDir).filter((f) => classify(f) !== 'map');
  const perFile = files.map((f) => {
    const buf = readFileSync(f);
    return {
      file: relative(distDir, f).split('\\').join('/'),
      kind: classify(f),
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      brotli: brotliCompressSync(buf, { params: { [zconst.BROTLI_PARAM_QUALITY]: 11 } }).length,
    };
  });

  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  const js = perFile.filter((f) => f.kind === 'js');
  const css = perFile.filter((f) => f.kind === 'css');

  const chunkMap = new Map();
  for (const f of js) {
    const name = chunkNameFromFile(f.file);
    const cur = chunkMap.get(name) || { chunk: name, raw: 0, gzip: 0, brotli: 0, files: 0 };
    cur.raw += f.raw; cur.gzip += f.gzip; cur.brotli += f.brotli; cur.files += 1;
    chunkMap.set(name, cur);
  }
  const chunks = [...chunkMap.values()].sort((a, b) => b.gzip - a.gzip);

  const totals = {
    raw: sum(perFile, 'raw'), gzip: sum(perFile, 'gzip'), brotli: sum(perFile, 'brotli'),
    jsGzip: sum(js, 'gzip'), cssGzip: sum(css, 'gzip'), fileCount: perFile.length,
  };

  const largest = chunks[0];
  const checks = {
    buildTime: buildSeconds != null && !Number.isNaN(buildSeconds)
      ? { value: buildSeconds, unit: 's', ...evalBudget(buildSeconds, fe.buildTimeSeconds) } : null,
    totalJsGzip: { value: toKb(totals.jsGzip), unit: 'KB', ...evalBudget(toKb(totals.jsGzip), fe.totalJsGzipKb) },
    totalCssGzip: { value: toKb(totals.cssGzip), unit: 'KB', ...evalBudget(toKb(totals.cssGzip), fe.totalCssGzipKb) },
    totalAssetsGzip: { value: toKb(totals.gzip), unit: 'KB', ...evalBudget(toKb(totals.gzip), fe.totalAssetsGzipKb) },
    largestChunkGzip: {
      value: largest ? toKb(largest.gzip) : 0, unit: 'KB', chunk: largest ? largest.chunk : null,
      ...evalBudget(largest ? toKb(largest.gzip) : 0, fe.perChunkGzipKb),
    },
  };

  const metrics = {
    generatedFrom: distDir,
    buildSeconds,
    totals: {
      rawKb: toKb(totals.raw), gzipKb: toKb(totals.gzip), brotliKb: toKb(totals.brotli),
      jsGzipKb: toKb(totals.jsGzip), cssGzipKb: toKb(totals.cssGzip), fileCount: totals.fileCount,
    },
    chunks: chunks.map((c) => ({ chunk: c.chunk, rawKb: toKb(c.raw), gzipKb: toKb(c.gzip), brotliKb: toKb(c.brotli), files: c.files })),
    largestAssets: [...perFile].sort((a, b) => b.gzip - a.gzip).slice(0, 10)
      .map((f) => ({ file: f.file, kind: f.kind, rawKb: toKb(f.raw), gzipKb: toKb(f.gzip) })),
    checks,
  };

  if (args.out && args.out !== true) writeFileSync(args.out, JSON.stringify(metrics, null, 2));

  const emoji = (s) => ({ ok: '✅', warn: '⚠️', over: '❌', 'n/a': '➖' }[s] || '➖');
  const cell = (c) => (c.budget != null ? `${c.value} / ${c.budget} ${c.unit}` : `${c.value} ${c.unit}`);
  let md = '### 📦 Frontend bundle & build\n\n| Metric | Value / Budget | Status |\n|---|---|:--:|\n';
  if (checks.buildTime) md += `| Build time | ${cell(checks.buildTime)} | ${emoji(checks.buildTime.status)} |\n`;
  md += `| JS (gzip) | ${cell(checks.totalJsGzip)} | ${emoji(checks.totalJsGzip.status)} |\n`;
  md += `| CSS (gzip) | ${cell(checks.totalCssGzip)} | ${emoji(checks.totalCssGzip.status)} |\n`;
  md += `| Total assets (gzip) | ${cell(checks.totalAssetsGzip)} | ${emoji(checks.totalAssetsGzip.status)} |\n`;
  md += `| Largest chunk${checks.largestChunkGzip.chunk ? ` (\`${checks.largestChunkGzip.chunk}\`)` : ''} (gzip) | ${cell(checks.largestChunkGzip)} | ${emoji(checks.largestChunkGzip.status)} |\n`;
  md += '\n<details><summary>Per-chunk breakdown (gzip)</summary>\n\n| Chunk | Raw | Gzip | Brotli |\n|---|--:|--:|--:|\n';
  for (const c of metrics.chunks) md += `| \`${c.chunk}\` | ${c.rawKb} KB | ${c.gzipKb} KB | ${c.brotliKb} KB |\n`;
  md += '\n</details>\n';

  if (args.summary && args.summary !== true) writeFileSync(args.summary, md);
  else process.stdout.write(md);

  const hardOver = Object.values(checks).some((c) => c && c.status === 'over');
  console.error(`[measure-bundle] total gzip ${toKb(totals.gzip)} KB across ${totals.fileCount} files; hardOver=${hardOver}`);
  if (args.enforce && hardOver) {
    console.error('[measure-bundle] hard budget exceeded and --enforce set → failing.');
    process.exit(1);
  }
}

main();
