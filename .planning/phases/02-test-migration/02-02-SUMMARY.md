---
phase: 02-test-migration
plan: 02
subsystem: testing
tags: [vitest, nodejs, shell, spawn, migration]

# Dependency graph
requires:
  - phase: 02-test-migration/01
    provides: Shell helper with run() function API
provides:
  - All test files migrated from Bun $ API to Node.js spawn-based run()
  - Zero Bun imports in test files
  - Function-based shell execution pattern
affects: [03-recovery, 04-in-place, 05-cli-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Function-based shell API: run(cmd, args[], options?) over tagged templates"
    - "Node.js spawn for shell command execution"

key-files:
  created: []
  modified:
    - test/helpers/repo.ts
    - test/detect.test.ts
    - test/worktrees.test.ts
    - test/migrate.test.ts

key-decisions:
  - "Converted all $ tagged template calls to run() function API"
  - "Preserved quiet: true option where .quiet() was used"

patterns-established:
  - "run('git', ['-C', dir, 'command', 'arg'], { quiet: true })"

requirements-completed: [TEST-02, TEST-03]

# Metrics
duration: 7min
completed: 2026-03-07
---

# Phase 2 Plan 2: Test File Migration Summary

**Migrated all test files from Bun's $ tagged-template API to Node.js spawn-based run() function, removing all direct Bun dependencies from test code.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-07T15:46:31Z
- **Completed:** 2026-03-07T15:53:23Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- Migrated test/helpers/repo.ts - all factory functions now use run() API
- Migrated test/detect.test.ts - all detection tests use new shell helper
- Migrated test/worktrees.test.ts - worktree listing tests converted
- Migrated test/migrate.test.ts - complex migration tests with mv and git commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate test/helpers/repo.ts** - `efa940c` (refactor)
2. **Task 2: Migrate test/detect.test.ts** - `958ad74` (refactor)
3. **Task 3: Migrate test/worktrees.test.ts** - `5420c40` (refactor)
4. **Task 4: Migrate test/migrate.test.ts** - `06104c7` (refactor)

## Files Created/Modified
- `test/helpers/repo.ts` - Factory functions (makeStandardRepo, makeBareRootRepo, makeBareHubRepo, assertHubStructure, assertWorktreeWorks)
- `test/detect.test.ts` - Repository detection tests with makeCommit helper
- `test/worktrees.test.ts` - Worktree parsing and listing tests
- `test/migrate.test.ts` - Migration logic tests with complex git and mv operations

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All test files now use Node.js-compatible shell execution
- Ready to remove bun alias from vitest.config.ts (Plan 02-03)
- Test suite passes: 37 tests across 5 files

---
*Phase: 02-test-migration*
*Completed: 2026-03-07*
