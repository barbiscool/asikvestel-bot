#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const changesDir = path.join(root, 'harness', 'changes');
const archiveDir = path.join(changesDir, 'archive');
const indexPath = path.join(changesDir, 'INDEX.json');
const evolutionDir = path.join(root, 'harness', 'evolution');
const statePath = path.join(evolutionDir, 'state.json');
const pendingPath = path.join(evolutionDir, 'pending.md');
const resultsPath = path.join(evolutionDir, 'results.tsv');
const proposalsDir = path.join(evolutionDir, 'proposals');

function ensureEvolutionDirs() {
  for (const d of [evolutionDir, proposalsDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function readState() {
  ensureEvolutionDirs();
  if (!fs.existsSync(statePath)) {
    const initial = {
      enabled: true,
      threshold: 5,
      window: 10,
      last_evolved_archive_count: 0,
      last_evolved_change_id: null,
      last_score: null,
      last_run_at: null,
      pending: false
    };
    fs.writeFileSync(statePath, JSON.stringify(initial, null, 2) + '\n', 'utf8');
    return initial;
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  ensureEvolutionDirs();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function ensureResultsHeader() {
  ensureEvolutionDirs();
  if (!fs.existsSync(resultsPath)) {
    const header = "timestamp\tproposal_id\teval_mode\tscore_before\tscore_after\tdelta\tdecision\treason\tcandidate_archives\tapplied_commit\n";
    fs.writeFileSync(resultsPath, header, 'utf8');
  }
}

function getArchiveItems() {
  if (!fs.existsSync(archiveDir)) return [];
  const entries = fs.readdirSync(archiveDir, { withFileTypes: true });
  const archives = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summaryPath = path.join(archiveDir, entry.name, 'summary.md');
    if (!fs.existsSync(summaryPath)) continue;
    archives.push({
      id: entry.name,
      path: path.relative(root, path.join(archiveDir, entry.name)).replace(/\\/g, '/'),
      summary: summaryPath
    });
  }
  archives.sort((a, b) => a.id.localeCompare(b.id));
  return archives;
}

function checkEvolution(reason = 'manual') {
  const state = readState();
  if (!state.enabled) {
    console.log('Harness evolution is disabled in state.json.');
    return;
  }
  const archives = getArchiveItems();
  const total = archives.length;
  const lastCount = state.last_evolved_archive_count || 0;
  const delta = total - lastCount;
  const threshold = state.threshold || 5;

  console.log(`Auto-evolve check: ${total} total archives, ${lastCount} last evolved, ${delta} new (threshold: ${threshold}) [reason: ${reason}]`);

  if (delta >= threshold && !state.pending) {
    state.pending = true;
    writeState(state);

    const candidates = archives.slice(Math.max(0, total - (state.window || 10)));
    const candidateList = candidates.map(c => `- \`${c.id}\` (${c.path}/summary.md)`).join('\n');

    const pendingContent = `# Harness Evolution Pending

**Status**: Maintenance Required
**Triggered**: ${new Date().toISOString()}
**Reason**: Archive threshold reached (${delta} >= ${threshold})

## Candidate Archives
${candidateList}

## Instructions for Agent
1. When no active change exists, review candidate archives for patterns, failure modes, and repeated manual steps.
2. Formulate a proposal in \`harness/evolution/proposals/\`.
3. If valid improvements are scored, apply small, evidence-backed improvements to \`AGENTS.md\`, linters, or docs.
4. Record the outcome in \`harness/evolution/results.tsv\`.
5. Run \`scripts/harness-evolve.sh mark-complete\`.
`;
    fs.writeFileSync(pendingPath, pendingContent, 'utf8');
    console.warn(`\x1b[33mGenerated harness/evolution/pending.md (${delta} new archives).\x1b[0m`);
  }
}

function markComplete() {
  const state = readState();
  const archives = getArchiveItems();
  state.last_evolved_archive_count = archives.length;
  state.last_evolved_change_id = archives.length > 0 ? archives[archives.length - 1].id : null;
  state.last_run_at = new Date().toISOString();
  state.pending = false;
  writeState(state);

  if (fs.existsSync(pendingPath)) {
    fs.unlinkSync(pendingPath);
  }
  ensureResultsHeader();
  console.log('Marked harness evolution complete.');
}

const [,, cmd, ...args] = process.argv;

try {
  ensureEvolutionDirs();
  switch (cmd || 'check') {
    case 'check':
      const reasonIdx = args.indexOf('--reason');
      const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : 'manual';
      checkEvolution(reason);
      break;
    case 'mark-complete':
      markComplete();
      break;
    default:
      console.error('Usage: harness-evolve <check|mark-complete>');
      process.exit(1);
  }
} catch (err) {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
}
