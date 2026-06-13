#!/usr/bin/env node
/**
 * ADDITION 1 — PRODUCTION BUILD VERIFICATION
 *
 * Validates production build artifacts for integrity, completeness, and optimization.
 * Checks dist/ structure, bundle sizes, source maps, hashing, lazy chunks, and budgets.
 *
 * Usage: node scripts/verify-build.js [--frontend] [--backend] [--strict]
 * Exit 0 = passed, Exit 1 = failed
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const BACKEND_SRC = path.join(ROOT, 'backend-api', 'src');

const BUDGETS = {
  maxTotalBundleSizeKB: 2048,
  maxSingleChunkSizeKB: 512,
  maxCssBundleSizeKB: 256,
  maxAssetSizeKB: 1024,
};

const args = new Set(process.argv.slice(2));
const checkFrontend = args.has('--frontend') || !args.has('--backend');
const checkBackend = args.has('--backend') || !args.has('--frontend');
const strict = args.has('--strict');

const R = { passed: [], warnings: [], failures: [], metrics: {} };
function pass(m) { R.passed.push(m); }
function warn(m) { R.warnings.push(m); }
function fail(m) { R.failures.push(m); }

function walkDir(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walkDir(p, list) : list.push(p);
  }
  return list;
}

function sizeKB(f) { return fs.statSync(f).size / 1024; }

function verifyFrontend() {
  console.log('\n── FRONTEND BUILD VERIFICATION ──\n');
  if (!fs.existsSync(FRONTEND_DIST)) { fail('dist/ missing'); return; }
  pass('dist/ exists');

  const idx = path.join(FRONTEND_DIST, 'index.html');
  if (!fs.existsSync(idx)) { fail('index.html missing'); return; }
  const html = fs.readFileSync(idx, 'utf8');
  html.includes('<script') ? pass('index.html has scripts') : fail('index.html missing scripts');

  const all = walkDir(FRONTEND_DIST);
  const js = all.filter(f => f.endsWith('.js'));
  const css = all.filter(f => f.endsWith('.css'));
  const maps = all.filter(f => f.endsWith('.map'));

  R.metrics.jsChunks = js.length;
  R.metrics.cssFiles = css.length;
  R.metrics.sourceMaps = maps.length;

  js.length ? pass(`${js.length} JS chunks`) : fail('No JS bundles');
  css.length ? pass(`${css.length} CSS files`) : warn('No CSS files');

  let totalJS = 0, totalCSS = 0;
  const chunks = [];
  for (const f of js) {
    const kb = sizeKB(f);
    totalJS += kb;
    const name = path.relative(FRONTEND_DIST, f);
    chunks.push({ name, sizeKB: Math.round(kb * 100) / 100 });
    if (kb === 0) fail(`Empty chunk: ${name}`);
    if (kb > BUDGETS.maxSingleChunkSizeKB) {
      (strict ? fail : warn)(`Chunk ${name}: ${Math.round(kb)}KB > ${BUDGETS.maxSingleChunkSizeKB}KB`);
    }
  }
  for (const f of css) totalCSS += sizeKB(f);

  R.metrics.totalJsKB = Math.round(totalJS);
  R.metrics.totalCssKB = Math.round(totalCSS);
  R.metrics.chunks = chunks;

  totalJS <= BUDGETS.maxTotalBundleSizeKB
    ? pass(`JS budget OK: ${Math.round(totalJS)}KB`)
    : (strict ? fail : warn)(`JS over budget: ${Math.round(totalJS)}KB`);

  // Source map validation
  for (const m of maps) {
    try {
      const p = JSON.parse(fs.readFileSync(m, 'utf8'));
      (p.version && p.sources && p.mappings)
        ? pass(`Map valid: ${path.basename(m)}`)
        : fail(`Invalid map: ${path.basename(m)}`);
    } catch (e) { fail(`Map parse error: ${path.basename(m)}`); }
  }

  // Hashing check
  const hashed = all.filter(f => /\.[a-f0-9]{8,}\./i.test(path.basename(f)));
  R.metrics.hashedAssets = hashed.length;
  hashed.length ? pass(`${hashed.length} hashed assets`) : warn('No content-hashed assets');

  // Lazy chunks
  const lazy = js.filter(f => !path.basename(f).startsWith('index'));
  R.metrics.lazyChunks = lazy.length;
  lazy.length ? pass(`${lazy.length} lazy chunks`) : warn('No lazy chunks');

  // Build fingerprint
  const h = crypto.createHash('sha256');
  for (const f of all.sort()) h.update(fs.readFileSync(f));
  R.metrics.buildFingerprint = h.digest('hex').slice(0, 32);
}

function verifyBackend() {
  console.log('\n── BACKEND BUILD VERIFICATION ──\n');
  const entry = path.join(BACKEND_SRC, 'server.js');
  fs.existsSync(entry) ? pass('server.js exists') : fail('server.js missing');

  const required = [
    'modules/auth/routes.js', 'modules/attendance/routes.js',
    'modules/leave/routes.js', 'modules/notification/routes.js',
    'modules/security-monitoring/routes.js',
    'config/database.js', 'config/redis.js', 'config/logger.js',
    'config/circuitBreaker.js',
    'middleware/authMiddleware.js', 'middleware/errorHandler.js',
  ];
  for (const r of required) {
    fs.existsSync(path.join(BACKEND_SRC, r)) ? pass(`Present: ${r}`) : fail(`Missing: ${r}`);
  }
}

function report() {
  console.log('\n══ BUILD VERIFICATION REPORT ══\n');
  console.log(`✅ ${R.passed.length} passed`);
  R.passed.forEach(p => console.log(`   ✅ ${p}`));
  if (R.warnings.length) {
    console.log(`⚠️  ${R.warnings.length} warnings`);
    R.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
  }
  if (R.failures.length) {
    console.log(`❌ ${R.failures.length} failures`);
    R.failures.forEach(f => console.log(`   ❌ ${f}`));
  }

  const rpt = { timestamp: new Date().toISOString(), status: R.failures.length ? 'FAILED' : 'PASSED', ...R };
  fs.writeFileSync(path.join(ROOT, 'build-verification-report.json'), JSON.stringify(rpt, null, 2) + '\n');
  return R.failures.length === 0;
}

if (checkFrontend) verifyFrontend();
if (checkBackend) verifyBackend();
process.exit(report() ? 0 : 1);
