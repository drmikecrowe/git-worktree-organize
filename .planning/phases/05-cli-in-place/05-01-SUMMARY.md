---
phase: 5
plan: 01
subsystem: cli
tags: [validation, bare-hub, worktree-status, repair]

# Dependency graph
requires:
  - phase: 04-worktree-recovery
    provides: findMissingWorktrees, repairWorktree, searchForWorktree
provides:
  - Validation mode for bare-hub repositories
  - Worktree status reporting (healthy/missing/stale)
  - Integrated repair offer for broken worktrees
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [validation-mode, status-table, interactive-repair]

key-files:
  created: []
  modified:
    - src/cli.ts
    - test/cli.test.ts

key-decisions:
  - "Validation mode runs immediately when bare-hub detected, before any other processing"
  - "Status categories: healthy (path exists + valid .git), missing (path doesn't exist), stale (path exists but invalid .git)"
  - "Repair offer integrated into validation mode, not separate flow"

patterns-established:
  - "Pattern 1: runValidationMode() called early in CLI after detect()"
  - "Pattern 2: Table format with Branch/Status/Path columns for validation report"

requirements-completed: [CLI-01, CLI-02, QUALITY-03]

# Metrics
duration: 15m
completed: 2026-03-07
---

# Phase 5 Plan 1: Validation Mode Summary

**Users running tool on existing hub directory get a validation report with status table and repair offer.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-07T19:59:34Z
- **Completed:** 2026-03-07T20:15:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Validation mode automatically runs when CLI is invoked on a bare-hub repository
- Worktree status correctly identifies healthy vs missing vs stale
- Summary counts displayed after table (X healthy, Y missing, Z stale)
- Repair offer with search and fix for missing/stale worktrees

## Task Commits

Each task was committed atomically:

1. **Task 1: Write validation mode tests** - `8afa460` (test)
2. **Task 2: Implement validation mode in CLI** - `4f4bb84` (feat)
3. **Task 3: Add repair offer** - Included in Task 2 commit (integrated implementation)

**Plan metadata:** `c1b6c4e` (docs: complete plan)

## Files Created/Modified

- `src/cli.ts` - Added runValidationMode() with status detection and repair offer
- `test/cli.test.ts` - Added 5 validation mode tests + 4 worktree recovery tests

## Decisions Made

- **Early routing:** Validation mode check placed immediately after detect() to intercept bare-hub before other flows
- **Status categories:** Three states (healthy/missing/stale) cover all worktree conditions
- **Integrated repair:** Repair offer is part of validation mode, not a separate flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all validation mode tests pass (5/5), worktree recovery tests pass (4/4).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Validation mode complete, ready for in-place migration (05-02)
- All CLI tests for validation and recovery pass

---
*Phase: 05-cli-in-place*
*Completed: 2026-03-07*
