#!/usr/bin/env node
/**
 * ADDITION 2 — EXECUTION-STATE PERSISTENCE ENGINE
 *
 * Central orchestrator for execution-state tracking across sessions.
 * Provides integrity verification, rollback snapshots, duplicate prevention,
 * and automatic state synchronization after every operation.
 *
 * Usage:
 *   node scripts/execution-state-manager.js sync            # Sync all state files
 *   node scripts/execution-state-manager.js verify           # Verify integrity
 *   node scripts/execution-state-manager.js snapshot         # Create rollback snapshot
 *   node scripts/execution-state-manager.js complete <task>  # Mark task complete
 *   node scripts/execution-state-manager.js fail <task> <reason>
 *   node scripts/execution-state-manager.js status           # Print current status
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, '.state-snapshots');

const STATE_FILES = {
  executionState: 'execution-state.md',
  completed: 'completed-tasks.json',
  failed: 'failed-tasks.json',
  pending: 'pending-tasks.json',
  rollback: 'rollback-map.json',
  architecture: 'architecture-report.json',
  dependency: 'dependency-report.json',
  security: 'security-report.json',
  migration: 'migration-history.json',
  validation: 'validation-report.json',
  deployment: 'deployment-report.json',
  progress: 'progress.json',
};

function now() { return new Date().toISOString(); }

function loadJSON(name) {
  const p = path.join(ROOT, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function saveJSON(name, data) {
  data.updatedAt = now();
  fs.writeFileSync(path.join(ROOT, name), JSON.stringify(data, null, 2) + '\n');
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
}

// ── Integrity verification ─────────────────────────────────────────────────
function verifyIntegrity() {
  console.log('\n── Execution State Integrity Check ──\n');
  const issues = [];
  const checksums = {};

  for (const [key, file] of Object.entries(STATE_FILES)) {
    const fp = path.join(ROOT, file);
    if (!fs.existsSync(fp)) {
      if (['validation', 'deployment'].includes(key)) {
        // These are new — create them
        const init = key === 'validation'
          ? { updatedAt: now(), checks: [], lastValidation: null, status: 'pending' }
          : { updatedAt: now(), deployments: [], lastDeployment: null, status: 'pending' };
        saveJSON(file, init);
        console.log(`  🆕 Created: ${file}`);
      } else {
        issues.push(`Missing: ${file}`);
        console.log(`  ❌ Missing: ${file}`);
      }
      continue;
    }

    checksums[key] = fileHash(fp);

    if (file.endsWith('.json')) {
      try {
        JSON.parse(fs.readFileSync(fp, 'utf8'));
        console.log(`  ✅ Valid: ${file} [${checksums[key]}]`);
      } catch (e) {
        issues.push(`Corrupt JSON: ${file} — ${e.message}`);
        console.log(`  ❌ Corrupt: ${file}`);
      }
    } else {
      console.log(`  ✅ Present: ${file} [${checksums[key]}]`);
    }
  }

  // Cross-validate: no completed task appears in pending
  const completed = loadJSON(STATE_FILES.completed);
  const pending = loadJSON(STATE_FILES.pending);
  if (completed && pending) {
    const completedSet = new Set((completed.completed || []).map(t =>
      typeof t === 'string' ? t.toLowerCase().trim() : ''
    ));
    for (const p of (pending.pending || [])) {
      const taskLower = (p.task || '').toLowerCase().trim();
      if (completedSet.has(taskLower)) {
        issues.push(`Duplicate: "${p.task}" is in both completed and pending`);
      }
    }
  }

  // Save integrity report
  const report = {
    timestamp: now(),
    status: issues.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND',
    checksums,
    issues,
  };
  fs.writeFileSync(path.join(ROOT, '.state-integrity.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`\n  Status: ${report.status} (${issues.length} issue(s))`);
  return issues.length === 0;
}

// ── Snapshot creation ──────────────────────────────────────────────────────
function createSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapDir = path.join(SNAPSHOT_DIR, ts);
  fs.mkdirSync(snapDir, { recursive: true });

  let count = 0;
  for (const file of Object.values(STATE_FILES)) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(snapDir, file));
      count++;
    }
  }

  console.log(`\n  📸 Snapshot created: ${snapDir} (${count} files)`);

  // Prune old snapshots (keep last 10)
  const snaps = fs.readdirSync(SNAPSHOT_DIR).sort().reverse();
  for (let i = 10; i < snaps.length; i++) {
    const old = path.join(SNAPSHOT_DIR, snaps[i]);
    fs.rmSync(old, { recursive: true, force: true });
  }

  return snapDir;
}

// ── Task completion ────────────────────────────────────────────────────────
function completeTask(task) {
  const data = loadJSON(STATE_FILES.completed) || { completed: [] };
  if (data.completed.includes(task)) {
    console.log(`  ⚠️  Task already completed: "${task}"`);
    return false;
  }
  data.completed.push(task);
  saveJSON(STATE_FILES.completed, data);

  // Remove from pending if present
  const pending = loadJSON(STATE_FILES.pending);
  if (pending) {
    pending.pending = (pending.pending || []).filter(p => p.task !== task);
    saveJSON(STATE_FILES.pending, pending);
  }

  console.log(`  ✅ Completed: "${task}"`);
  return true;
}

// ── Task failure ───────────────────────────────────────────────────────────
function failTask(task, reason) {
  const data = loadJSON(STATE_FILES.failed) || { failedOrBlocked: [] };
  data.failedOrBlocked.push({ task, status: 'failed', reason, timestamp: now() });
  saveJSON(STATE_FILES.failed, data);
  console.log(`  ❌ Failed: "${task}" — ${reason}`);
}

// ── State sync ─────────────────────────────────────────────────────────────
function syncState() {
  console.log('\n── Synchronizing Execution State ──\n');
  verifyIntegrity();
  createSnapshot();

  // Update execution-state.md timestamp
  const mdPath = path.join(ROOT, STATE_FILES.executionState);
  if (fs.existsSync(mdPath)) {
    let md = fs.readFileSync(mdPath, 'utf8');
    md = md.replace(/Updated: .+/, `Updated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    fs.writeFileSync(mdPath, md);
  }

  console.log('\n  ✅ State synchronized');
}

// ── Status ─────────────────────────────────────────────────────────────────
function printStatus() {
  const completed = loadJSON(STATE_FILES.completed);
  const pending = loadJSON(STATE_FILES.pending);
  const failed = loadJSON(STATE_FILES.failed);

  console.log('\n── Execution State Status ──\n');
  console.log(`  Completed: ${(completed?.completed || []).length} tasks`);
  console.log(`  Pending:   ${(pending?.pending || []).length} tasks`);
  console.log(`  Failed:    ${(failed?.failedOrBlocked || []).length} tasks`);
}

// ── CLI ────────────────────────────────────────────────────────────────────
const [,, cmd, ...rest] = process.argv;
switch (cmd) {
  case 'sync':     syncState(); break;
  case 'verify':   process.exit(verifyIntegrity() ? 0 : 1); break;
  case 'snapshot': createSnapshot(); break;
  case 'complete': completeTask(rest.join(' ')); break;
  case 'fail':     failTask(rest[0], rest.slice(1).join(' ')); break;
  case 'status':   printStatus(); break;
  default:
    console.log('Usage: execution-state-manager.js <sync|verify|snapshot|complete|fail|status>');
}
