#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const changesDir = path.join(root, 'harness', 'changes');
const activeDir = path.join(changesDir, 'active');
const indexPath = path.join(changesDir, 'INDEX.json');
const statusPath = path.join(root, 'docs', 'STATUS.md');
const evolutionState = path.join(root, 'harness', 'evolution', 'state.json');
const harnessChangeMjs = path.join(root, 'scripts', 'harness-change.mjs');
const harnessEvolveMjs = path.join(root, 'scripts', 'harness-evolve.mjs');

function fail(msg) {
  console.error(`\x1b[31m[ECL Lint Error] ${msg}\x1b[0m`);
  process.exit(1);
}

if (!fs.existsSync(changesDir)) {
  fail('Missing harness/changes. Run ecl-harness-engineer or create ECL harness structure.');
}

for (const d of ['active', 'parking', 'archive']) {
  if (!fs.existsSync(path.join(changesDir, d))) {
    fail(`Missing harness/changes/${d}.`);
  }
}

if (!fs.existsSync(harnessChangeMjs)) {
  fail('Missing scripts/harness-change.mjs.');
}

if (!fs.existsSync(harnessEvolveMjs)) {
  fail('Missing scripts/harness-evolve.mjs.');
}

if (!fs.existsSync(evolutionState)) {
  fail('Missing harness/evolution/state.json.');
}

if (!fs.existsSync(statusPath)) {
  fail('Missing docs/STATUS.md. Create a lightweight handoff summary.');
}

const activeSummary = path.join(activeDir, 'summary.md');
if (fs.existsSync(activeSummary)) {
  for (const f of ['summary.md', 'spec.md', 'plan.md', 'tasks.md']) {
    if (!fs.existsSync(path.join(activeDir, f))) {
      fail(`Active change missing ${f}.`);
    }
  }
  if (!fs.existsSync(path.join(activeDir, 'reviews'))) {
    fail('Active change missing reviews/.');
  }

  const summaryText = fs.readFileSync(activeSummary, 'utf8');
  const specText = fs.readFileSync(path.join(activeDir, 'spec.md'), 'utf8');
  const tasksText = fs.readFileSync(path.join(activeDir, 'tasks.md'), 'utf8');
  let reviewText = '';
  const reviewPath = path.join(activeDir, 'reviews', 'review.md');
  if (fs.existsSync(reviewPath)) reviewText = fs.readFileSync(reviewPath, 'utf8');

  const phaseMatch = summaryText.match(/^phase:\s*"?([^"\r\n]+)"?/m);
  const phase = phaseMatch ? phaseMatch[1].trim() : '';
  const planMatch = summaryText.match(/^plan_review:\s*"?([^"\r\n]+)"?/m);
  const planReview = planMatch ? planMatch[1].trim() : '';

  if (/^(implement|validate|done)$/.test(phase) && specText.includes('[NEEDS CLARIFICATION:')) {
    fail('Active spec.md still has [NEEDS CLARIFICATION] markers. Resolve them before implementation.');
  }

  if (/^(implement|validate|done)$/.test(phase) && planReview !== 'approved' && !/Plan Review[\s\S]*Status:\s*approved/i.test(reviewText)) {
    fail('Active change cannot enter implementation until plan_review is approved.');
  }

  if (/^- \[[ xX]\] (?!T\d{3})/m.test(tasksText)) {
    fail("tasks.md contains executable task lines without T### ids. Use '- [ ] T001 [P?] [US?] Action'.");
  }
}

if (!fs.existsSync(indexPath)) {
  fail('Missing harness/changes/INDEX.json. Run: scripts/harness-change.sh reindex');
}

const actual = fs.readFileSync(indexPath, 'utf8').trim();
const proc = spawnSync(process.execPath, [harnessChangeMjs, 'index-json'], { encoding: 'utf8' });
if (proc.status !== 0) {
  fail(`Failed to generate index-json: ${proc.stderr}`);
}
const expected = proc.stdout.trim();

if (actual !== expected) {
  fail('harness/changes/INDEX.json is stale. Run: scripts/harness-change.sh reindex');
}

console.log('✓ ECL lint passed.');
