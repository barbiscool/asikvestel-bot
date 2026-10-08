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
const parkingDir = path.join(changesDir, 'parking');
const archiveDir = path.join(changesDir, 'archive');
const indexPath = path.join(changesDir, 'INDEX.json');
const templatesDir = path.join(root, 'harness', 'templates', 'change');
const evolutionDir = path.join(root, 'harness', 'evolution');
const evolutionPending = path.join(evolutionDir, 'pending.md');

function ensureDirs() {
  const dirs = [
    changesDir, activeDir, parkingDir, archiveDir,
    templatesDir, path.join(templatesDir, 'reviews'),
    evolutionDir, path.join(evolutionDir, 'proposals')
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function getDateText() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function convertToSlug(text) {
  let slug = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'change';
}

function parseFrontMatter(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.startsWith('---')) return {};
  const lines = text.split(/\r?\n/);
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const match = lines[i].match(/^\s*([^:#]+):\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim().replace(/^"|"$/g, '');
      const listMatch = val.match(/^\[(.*)\]$/);
      if (listMatch) {
        result[key] = listMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

function setFrontMatterValues(filePath, values) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (!text.startsWith('---')) throw new Error(`${filePath} has no front matter.`);
  for (const [key, val] of Object.entries(values)) {
    const formattedVal = Array.isArray(val)
      ? `[${val.map(v => `"${v}"`).join(', ')}]`
      : `"${val}"`;
    const line = `${key}: ${formattedVal}`;
    const keyRegex = new RegExp(`^${key}:\\s*.*$`, 'm');
    if (keyRegex.test(text)) {
      text = text.replace(keyRegex, line);
    } else {
      const endMarker = text.indexOf('\n---', 3);
      if (endMarker !== -1) {
        text = text.slice(0, endMarker) + `\n${line}` + text.slice(endMarker);
      }
    }
  }
  fs.writeFileSync(filePath, text, 'utf8');
}

function getSectionLines(filePath, heading) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  let found = false;
  const items = [];
  const headingRegex = new RegExp(`^##\\s+${heading}\\s*$`);
  for (const line of lines) {
    if (headingRegex.test(line)) {
      found = true;
      continue;
    }
    if (found && /^##\s+/.test(line)) break;
    if (found && line.trim()) items.push(line.trim());
  }
  return items;
}

function getValidationStatus(summaryPath, meta) {
  if (meta.validation_status) return meta.validation_status;
  const validation = getSectionLines(summaryPath, 'Validation').join(' ');
  if (/\bpass(ed)?\b|success|ok/i.test(validation)) return 'pass';
  if (/\bfail(ed)?\b|error|blocked/i.test(validation)) return 'fail';
  return 'unknown';
}

function getIndexEntries() {
  const entries = [];
  const pairs = [['parking', parkingDir], ['archive', archiveDir]];
  for (const [location, base] of pairs) {
    if (!fs.existsSync(base)) continue;
    const items = fs.readdirSync(base, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const summary = path.join(base, item.name, 'summary.md');
      if (!fs.existsSync(summary)) continue;
      const meta = parseFrontMatter(summary);
      const decisions = getSectionLines(summary, 'Decisions').filter(d => !/Pending/i.test(d));
      const relPath = path.relative(root, path.join(base, item.name)).replace(/\\/g, '/');
      entries.push({
        id: item.name,
        title: meta.title || item.name,
        status: meta.status || location,
        location,
        modules: meta.modules || [],
        files: meta.files || [],
        tags: meta.tags || [],
        decisions,
        validation_status: getValidationStatus(summary, meta),
        path: relPath,
        updated_at: meta.updated_at || getDateText()
      });
    }
  }
  return entries;
}

function getIndexJson() {
  const entries = getIndexEntries();
  return JSON.stringify(entries, null, 2) + '\n';
}

function reindex() {
  ensureDirs();
  const entries = getIndexEntries();
  fs.writeFileSync(indexPath, getIndexJson(), 'utf8');
  console.log(`Rebuilt harness/changes/INDEX.json (${entries.length} entries).`);
}

function invokeEvolutionCheck(reason) {
  const script = path.join(root, 'scripts', 'harness-evolve.mjs');
  if (fs.existsSync(script)) {
    try {
      spawnSync(process.execPath, [script, 'check', '--reason', reason], { stdio: 'inherit' });
    } catch (err) {
      console.warn(`Auto-evolve check warning: ${err.message}`);
    }
  }
}

function showEvolutionReminder() {
  if (fs.existsSync(evolutionPending)) {
    console.warn(`\x1b[33mWarning: Harness evolution is pending: harness/evolution/pending.md\x1b[0m`);
  }
}

function assertNoActive() {
  const summary = path.join(activeDir, 'summary.md');
  if (fs.existsSync(summary)) {
    throw new Error("Active change exists. Run 'status', then 'park', 'close', or finish it before starting a new change.");
  }
}

function newChange(title) {
  ensureDirs();
  if (!title || !title.trim()) throw new Error('Missing title.');
  assertNoActive();
  const date = getDateText();
  const slug = convertToSlug(title);

  const summaryTpl = `---
title: "${title}"
slug: "${slug}"
status: "in_progress"
location: "active"
phase: "intake"
intake_status: "pending"
spec_review: "pending"
plan_review: "pending"
modules: []
files: []
tags: []
validation_status: "unknown"
created_at: "${date}"
updated_at: "${date}"
---

# Summary

## Outcome

Pending.

## Decisions

- Pending.

## Validation

- Pending.

## Next Step

- Run Intake Review, then update \`spec.md\` and \`plan.md\`.
`;

  const specTpl = `# Spec

## Intake Review

- Intake type: Small Change | Structured Change
- Input shape: requirement-first | plan-first | mixed
- Questions asked this round: 0

## Goal And Evidence

- Real problem or user request:
- Current behavior:
- Source of evidence:

## User Scenarios And Success

- Primary user/system scenario:
- Success criteria:
- Acceptance criteria:

## Non-Goals

- Pending.

## Constraints

- Pending.

## Assumptions

- Pending.

## Open Questions

- [NEEDS CLARIFICATION: Replace with a specific high-impact question, or remove before implementation.]

## Resolved Clarifications

- Pending.
`;

  const planTpl = `# Plan

## Technical Approach

- Pending.

## Impacted Modules And Files

- Pending.

## Interfaces, Data, Permissions

- Pending.

## Spec Gaps Found From Planning

- Pending.

## Risks And Mitigations

- Pending.

## Verification Plan

- Pending.
`;

  const tasksTpl = `# Tasks

## Format

- \`- [ ] T001 [P?] [US?] Action with target path and validation note\`
- \`[P]\` means parallel-safe. \`[US1]\` maps to a user story when stories exist.

## Setup / Intake

- [ ] T001 Review \`spec.md\` and \`plan.md\` gates before implementation.

## Implementation

- [ ] T002 Pending implementation task with target path.

## Validation

- [ ] T003 Pending validation task with command or scenario.

## Deferred Tasks

- None.
`;

  const reviewTpl = `# Review

## Intake Review

- Status: pending
- Notes:

## Spec Review

- Status: pending
- Open high-impact clarifications:
- WHAT/HOW separation:

## Plan Review

- Status: pending
- Spec gaps found from planning:

## Code Review

- Status: pending

## Validation Review

- Status: pending
`;

  fs.writeFileSync(path.join(activeDir, 'summary.md'), summaryTpl, 'utf8');
  fs.writeFileSync(path.join(activeDir, 'spec.md'), specTpl, 'utf8');
  fs.writeFileSync(path.join(activeDir, 'plan.md'), planTpl, 'utf8');
  fs.writeFileSync(path.join(activeDir, 'tasks.md'), tasksTpl, 'utf8');
  const activeReviews = path.join(activeDir, 'reviews');
  if (!fs.existsSync(activeReviews)) fs.mkdirSync(activeReviews, { recursive: true });
  fs.writeFileSync(path.join(activeReviews, 'review.md'), reviewTpl, 'utf8');

  console.log(`Created active change: ${title}`);
  showEvolutionReminder();
}

function validateChange(dir) {
  const isActive = path.resolve(dir) === path.resolve(activeDir);
  const required = isActive
    ? ['summary.md', 'spec.md', 'plan.md', 'tasks.md']
    : ['summary.md', 'spec.md', 'tasks.md'];

  for (const f of required) {
    if (!fs.existsSync(path.join(dir, f))) throw new Error(`Missing ${f} in ${dir}`);
  }
  if (!fs.existsSync(path.join(dir, 'reviews'))) throw new Error(`Missing reviews/ in ${dir}`);

  const summary = path.join(dir, 'summary.md');
  const meta = parseFrontMatter(summary);
  if (!meta.status) throw new Error('summary.md missing status front matter.');

  const phase = meta.phase || '';
  const planReview = meta.plan_review || '';
  const spec = fs.readFileSync(path.join(dir, 'spec.md'), 'utf8');
  const tasks = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8');
  let reviewText = '';
  const reviewFile = path.join(dir, 'reviews', 'review.md');
  if (fs.existsSync(reviewFile)) reviewText = fs.readFileSync(reviewFile, 'utf8');

  if (isActive && /^(implement|validate|done)$/.test(phase) && spec.includes('[NEEDS CLARIFICATION:')) {
    throw new Error('spec.md has high-impact [NEEDS CLARIFICATION] markers. Resolve them before implementation.');
  }
  if (isActive && /^(implement|validate|done)$/.test(phase) && planReview !== 'approved' && !/Plan Review[\s\S]*Status:\s*approved/i.test(reviewText)) {
    throw new Error('summary.md plan_review must be approved before implementation.');
  }
  if (isActive && /^- \[[ xX]\] (?!T\d{3})/m.test(tasks) && !tasks.includes('## Deferred Tasks')) {
    throw new Error('tasks.md task lines must use T### IDs (e.g., T001).');
  }
  if (meta.status === 'completed') {
    const valStatus = getValidationStatus(summary, meta);
    if (valStatus !== 'pass') throw new Error('completed change must have validation_status: pass or a passing Validation section.');
  }
}

function showStatus() {
  ensureDirs();
  const summary = path.join(activeDir, 'summary.md');
  if (!fs.existsSync(summary)) {
    console.log('No active change.');
    return;
  }
  const meta = parseFrontMatter(summary);
  console.log(`Active: ${meta.title || 'Untitled'}`);
  console.log(`Status: ${meta.status || 'unknown'}`);
  console.log(`Phase: ${meta.phase || 'intake'}`);
}

function newClosedId(meta) {
  let date = getDateText();
  if (/^\d{4}-\d{2}-\d{2}$/.test(meta.updated_at)) date = meta.updated_at;
  const slug = meta.slug || convertToSlug(meta.title);
  return `${date}-${slug}`;
}

function moveActive(targetBase, status, reason) {
  ensureDirs();
  const summary = path.join(activeDir, 'summary.md');
  if (!fs.existsSync(summary)) throw new Error('No active change.');
  if (targetBase === archiveDir && !['completed', 'blocked', 'abandoned'].includes(status)) {
    throw new Error('close status must be completed, blocked, or abandoned.');
  }
  if (status === 'completed') validateChange(activeDir);

  const targetLocation = targetBase === parkingDir ? 'parking' : 'archive';
  const newStatus = targetBase === parkingDir ? 'parked' : status;
  setFrontMatterValues(summary, {
    status: newStatus,
    location: targetLocation,
    updated_at: getDateText()
  });

  if (reason) {
    fs.appendFileSync(summary, `\n## Transition Note\n\n- ${reason}\n`, 'utf8');
  }

  const meta = parseFrontMatter(summary);
  const baseId = newClosedId(meta);
  let target = path.join(targetBase, baseId);
  let n = 2;
  while (fs.existsSync(target)) {
    target = path.join(targetBase, `${baseId}-${n}`);
    n++;
  }

  fs.renameSync(activeDir, target);
  fs.mkdirSync(activeDir, { recursive: true });
  reindex();

  if (targetBase === archiveDir) invokeEvolutionCheck('close');
  console.log(`Moved active change to ${target}`);
}

function resumeChange(id) {
  ensureDirs();
  assertNoActive();
  const source = path.join(parkingDir, id);
  if (!fs.existsSync(source)) throw new Error(`Parking change not found: ${id}`);
  const summary = path.join(source, 'summary.md');
  if (fs.existsSync(summary)) {
    setFrontMatterValues(summary, {
      status: 'in_progress',
      location: 'active',
      updated_at: getDateText()
    });
  }
  fs.renameSync(source, activeDir);
  reindex();
  console.log(`Resumed ${id} into active. Run validate before continuing.`);
}

function searchIndex(query) {
  if (!fs.existsSync(indexPath)) reindex();
  const items = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const filtered = items.filter(it => JSON.stringify(it).toLowerCase().includes((query || '').toLowerCase()));
  console.table(filtered.map(f => ({ id: f.id, title: f.title, status: f.status, location: f.location, path: f.path })));
}

function showContext() {
  console.log('Required:');
  const candidates = [
    'AGENTS.md',
    'docs/ECL.md',
    'harness/changes/active/summary.md',
    'harness/changes/active/spec.md',
    'harness/changes/active/plan.md',
    'harness/changes/active/tasks.md'
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(root, c))) console.log(`- ${c}`);
  }
  const hasActive = fs.existsSync(path.join(activeDir, 'summary.md'));
  if (!hasActive && fs.existsSync(evolutionPending)) {
    console.log('- harness/evolution/pending.md');
  }
  if (!hasActive && fs.existsSync(path.join(root, 'docs', 'STATUS.md'))) {
    console.log('- docs/STATUS.md');
  }
  console.log('\nHistory index:');
  if (fs.existsSync(indexPath)) {
    console.log('- harness/changes/INDEX.json');
  } else {
    console.log('- Run scripts/harness-change.sh reindex');
  }
}

const [,, cmd, ...args] = process.argv;

try {
  ensureDirs();
  switch (cmd) {
    case 'new':
      newChange(args.join(' '));
      break;
    case 'status':
      showStatus();
      break;
    case 'validate':
      validateChange(activeDir);
      console.log('ECL active change is valid.');
      break;
    case 'park':
      moveActive(parkingDir, 'parked', args.join(' '));
      break;
    case 'resume':
      if (!args[0]) throw new Error('Missing ID to resume.');
      resumeChange(args[0]);
      break;
    case 'close':
      if (!args[0]) throw new Error('close status required: completed, blocked, or abandoned.');
      moveActive(archiveDir, args[0], args.slice(1).join(' '));
      break;
    case 'search':
      searchIndex(args.join(' '));
      break;
    case 'context':
      showContext();
      break;
    case 'reindex':
      reindex();
      invokeEvolutionCheck('reindex');
      break;
    case 'index-json':
      process.stdout.write(getIndexJson());
      break;
    default:
      console.error('Usage: harness-change <new|status|validate|park|resume|close|search|context|reindex|index-json>');
      process.exit(1);
  }
} catch (err) {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
}
