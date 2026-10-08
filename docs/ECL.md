# Explicit Change Lifecycle (ECL) Manual

> Sources: [`scripts/harness-change.mjs:1-350`](file:///home/barb/gemini/asikvestel-bot/scripts/harness-change.mjs), [`scripts/harness-evolve.mjs:1-120`](file:///home/barb/gemini/asikvestel-bot/scripts/harness-evolve.mjs), [`harness/changes/INDEX.json`](file:///home/barb/gemini/asikvestel-bot/harness/changes/INDEX.json)

## 1 Principles & Philosophy

The Explicit Change Lifecycle (ECL) provides structured mechanical gates for AI agent collaboration in `asikvestel-bot`.
Intelligence without infrastructure leads to hallucinated architectures, lost task state, and broken deployments. The repository is the single source of truth.

## 2 Change Classification

Every proposed modification must be classified before implementation:

| Classification | Criteria | Required Handling |
|---|---|---|
| **Small Change** | Local, low-risk edits (copy, comments, formatting, or single-file bug fix with no interface, database, permission, or architecture impact). | Active change is optional; record the verification command and results in the final response. |
| **Structured Change** | Cross-file edits (>2 files), APIs, database schema, permissions, architectural boundaries, daemon lifecycle, or work exceeding 20 minutes. | Create an active change; complete Intake, Spec, and Plan Review before writing code. |

## 3 Intake & Plan Review Gates

### 3.1 Bounded Intake
- When requirements are underspecified, ask at most **three** high-impact questions per round.
- Low-risk unknowns become recorded assumptions in `spec.md`.
- High-impact unknowns become `[NEEDS CLARIFICATION: ...]` and block implementation until resolved.

### 3.2 Plan-First vs Requirement-First
- **Requirement-First**: Extract goals, user scenarios, and acceptance criteria into `spec.md`.
- **Plan-First**: Treat user plans as drafts; split WHAT/WHY into `spec.md` and HOW into `plan.md`.

### 3.3 Gate Enforcement
Before changing phase to `implement`, `validate`, or `done`:
1. `spec.md` must contain zero unresolved `[NEEDS CLARIFICATION]` markers.
2. `summary.md` must have `plan_review: "approved"` or an approved plan review in `reviews/review.md`.
3. `tasks.md` items must use predictable `T###` identifiers (e.g. `T001`).

## 4 Change Lifecycle Commands

ECL changes are managed via `scripts/harness-change.sh`:

```bash
# 1. Start a new change
bash scripts/harness-change.sh new "Implement /resim slash command"

# 2. Check active change status
bash scripts/harness-change.sh status

# 3. Validate active change gates
bash scripts/harness-change.sh validate

# 4. Park active work if switching tasks
bash scripts/harness-change.sh park "Waiting on Discord API rate limit"

# 5. Resume parked work
bash scripts/harness-change.sh resume 2026-10-08-implement-resim-slash-command

# 6. Close completed change (rebuilds INDEX.json & checks evolution)
bash scripts/harness-change.sh close completed

# 7. Close blocked or abandoned change
bash scripts/harness-change.sh close blocked "Blocked on external upstream API"
bash scripts/harness-change.sh close abandoned "Deprecated by architecture decision"

# 8. Rebuild search index manually
bash scripts/harness-change.sh reindex
```

## 5 Auto-Evolution Protocol

1. When 5 closed changes accumulate in `harness/changes/archive/`, `scripts/harness-evolve.sh check` automatically writes `harness/evolution/pending.md`.
2. When an agent starts a session with no active change and `pending.md` exists, it alerts the user to pending maintenance.
3. If approved, the agent formulates an evolution proposal in `harness/evolution/proposals/`, reviews archive patterns, applies evidence-backed rule updates, records the score in `harness/evolution/results.tsv`, and runs:
   ```bash
   bash scripts/harness-evolve.sh mark-complete
   ```
