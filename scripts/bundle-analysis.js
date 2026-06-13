#!/usr/bin/env node
/**
 * ADDITION 1 — BUNDLE ANALYSIS
 *
 * Analyzes production bundles for size regressions, duplication, and optimization opportunities.
 * Reads build-verification-report.json and previous baselines to detect regressions.
 *
 * Usage: node scripts/bundle-analysis.js [--save-baseline]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.bundle-baseline.json');
const REPORT_PATH = path.join(ROOT, 'build-verification-report.json');

const saveBaseline = process.argv.includes('--save-baseline');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const report = loadJSON(REPORT_PATH);
if (!report || !report.metrics) {
  console.error('❌ No build-verification-report.json found. Run verify-build.js first.');
  process.exit(1);
}

const baseline = loadJSON(BASELINE_PATH);
const current = {
  timestamp: report.timestamp,
  totalJsKB: report.metrics.totalJsKB || 0,
  totalCssKB: report.metrics.totalCssKB || 0,
  jsChunks: report.metrics.jsChunks || 0,
  lazyChunks: report.metrics.lazyChunks || 0,
  hashedAssets: report.metrics.hashedAssets || 0,
  buildFingerprint: report.metrics.buildFingerprint || '',
  chunks: report.metrics.chunks || [],
};

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  BUNDLE ANALYSIS REPORT                              ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

console.log(`Total JS:  ${current.totalJsKB} KB across ${current.jsChunks} chunk(s)`);
console.log(`Total CSS: ${current.totalCssKB} KB`);
console.log(`Lazy:      ${current.lazyChunks} route-split chunks`);
console.log(`Hashed:    ${current.hashedAssets} cache-busted assets`);
console.log(`Build ID:  ${current.buildFingerprint}\n`);

if (current.chunks.length) {
  console.log('── Chunk Breakdown ──');
  const sorted = [...current.chunks].sort((a, b) => b.sizeKB - a.sizeKB);
  for (const c of sorted) {
    const bar = '█'.repeat(Math.min(Math.round(c.sizeKB / 10), 50));
    console.log(`  ${c.name.padEnd(40)} ${String(c.sizeKB).padStart(8)} KB  ${bar}`);
  }
}

// Regression detection
if (baseline) {
  console.log('\n── Regression Analysis ──');
  const jsDelta = current.totalJsKB - baseline.totalJsKB;
  const cssDelta = current.totalCssKB - baseline.totalCssKB;
  const jsPercent = baseline.totalJsKB ? ((jsDelta / baseline.totalJsKB) * 100).toFixed(1) : 'N/A';
  const cssPercent = baseline.totalCssKB ? ((cssDelta / baseline.totalCssKB) * 100).toFixed(1) : 'N/A';

  const jsIcon = jsDelta > 50 ? '🔴' : jsDelta > 10 ? '🟡' : '🟢';
  const cssIcon = cssDelta > 20 ? '🔴' : cssDelta > 5 ? '🟡' : '🟢';

  console.log(`  ${jsIcon} JS:  ${jsDelta >= 0 ? '+' : ''}${Math.round(jsDelta)} KB (${jsPercent}%)`);
  console.log(`  ${cssIcon} CSS: ${cssDelta >= 0 ? '+' : ''}${Math.round(cssDelta)} KB (${cssPercent}%)`);

  if (current.jsChunks !== baseline.jsChunks) {
    console.log(`  ℹ️  Chunk count changed: ${baseline.jsChunks} → ${current.jsChunks}`);
  }
  if (current.buildFingerprint !== baseline.buildFingerprint) {
    console.log(`  ℹ️  Build fingerprint changed (expected after code changes)`);
  }
} else {
  console.log('\n  ℹ️  No baseline found. Run with --save-baseline to create one.');
}

// Optimization suggestions
console.log('\n── Optimization Suggestions ──');
const suggestions = [];
if (current.totalJsKB > 1500) suggestions.push('Consider aggressive code splitting and dynamic imports');
if (current.lazyChunks < 3) suggestions.push('Add more route-level lazy loading');
if (current.chunks.some(c => c.sizeKB > 300)) suggestions.push('Split large chunks with manualChunks in Vite config');
if (current.hashedAssets < current.jsChunks) suggestions.push('Ensure all assets use content hashing');
suggestions.length ? suggestions.forEach(s => console.log(`  💡 ${s}`)) : console.log('  ✅ No optimization issues detected');

// Save baseline
if (saveBaseline) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  console.log(`\n📄 Baseline saved to ${BASELINE_PATH}`);
}

// Save analysis report
const analysis = { timestamp: new Date().toISOString(), current, baseline, suggestions };
fs.writeFileSync(path.join(ROOT, 'bundle-analysis-report.json'), JSON.stringify(analysis, null, 2) + '\n');
console.log(`📄 Analysis saved to bundle-analysis-report.json`);
