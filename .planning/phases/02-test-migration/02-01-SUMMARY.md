---
phase: 02-test-migration
plan: 01
subsystem: testing
tags: [vitest, node.js, spawn, shell-helper, tdd]

# Dependency graph
requires:
  - phase: 01-runtime-migration
    provides: Node.js build toolchain with esbuild
provides:
  - Function-based shell helper for test migration
  - Test configuration updated for vitest
affects: [02-test-migration, test-helpers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Function-based shell API (replaces tagged-template)
    - Node.js spawn for async command execution

key-files:
  created:
    - test/helpers/shell.ts
    - test/helpers/shell.test.ts
  modified:
    - package.json

key-decisions:
  - "Keep bun alias in vitest.config.ts until tests are migrated"
  - "Shell helper uses spawn (async) not spawnSync for better test isolation"

patterns-established:
  - "run(cmd, args, options) function signature for shell commands"
  - "ShellResult interface with stdout, stderr, exitCode"

requirements-completed: [TEST-02]

# Metrics
duration: 5min
completed: 2026-03-07
---

# Phase 02 Plan 01: Shell Helper Summary

**Created function-based shell helper using Node.js spawn to replace Bun's `$` API, establishing foundation for test migration from Bun to Node.js.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T15:37:34Z
- **Completed:** 2026-03-07T15:42:32Z
- **Tasks:** 4
- **Files modified:** 3

## Accomplishments
- Function-based `run()` API for shell command execution
- 4 passing tests for shell helper using TDD (RED-GREEN)
- Updated package.json to use `vitest run` for test command
- Added `test:coverage` script for coverage reports

## Task Commits

Each task was committed atomically:

1. **Task 0: Create failing tests for shell helper (RED phase)** - `d7202ff` (test)
2. **Task 1: Create function-based shell helper (GREEN phase)** - `e141993` (feat)
3. **Task 2: Update package.json test scripts** - `b310b58` (chore)
4. **Task 3: Keep bun alias in vitest.config.ts** - No commit (deviation - kept original)

**Plan metadata:** (pending)

_Note: TDD tasks have multiple commits (test -> feat)_

## Files Created/Modified
- `test/helpers/shell.ts` - Function-based shell helper using node:child_process spawn
- `test/helpers/shell.test.ts` - Tests for shell helper (4 tests)
- `package.json` - Updated test scripts to use vitest

## Decisions Made
- Keep bun alias in vitest.config.ts until all tests are migrated to use the new shell helper
- Shell helper uses async spawn instead of spawnSync for better test isolation

## Deviations from Plan

### Deviation: Kept bun alias in vitest.config.ts

**Task 3: Update vitest.config.ts to remove bun alias**

- **Found during:** Task 3 verification
- **Issue:** Plan said to remove the bun alias, but existing tests (migrate.test.ts, detect.test.ts, worktrees.test.ts) still import `{ $ } from 'bun'`. The bun shim has a bug with Node.js Promise subclassing that causes "Promise resolve or reject function is not callable" errors when running under vitest.
- **Fix:** Kept the bun alias in vitest.config.ts. The alias will be removed in a subsequent plan after all tests are migrated to use the new shell helper.
- **Files:** vitest.config.ts (unchanged)
- **Impact:** Existing tests continue to work with `bun test`. New shell helper tests work with vitest.

### Pre-existing Issue: Bun shim incompatibility with vitest

- **Issue:** The bun shim's `ShellPromise` class extends Promise incorrectly for Node.js, causing runtime errors when running tests with vitest. This is a pre-existing issue not caused by this plan.
- **Workaround:** Use `bun test` for running all tests until migration is complete. New tests using the shell helper will work with both bun and vitest.

---

**Total deviations:** 1 (architectural decision to keep alias)
**Impact on plan:** Minimal - shell helper foundation is complete and functional.

## Self-Check: PASSED

- All created files verified to exist
- All task commits verified in git history
- Shell helper tests pass with vitest (4/4)
- Bun test passes with all tests (37/37)

## Issues Encountered
- Bun shim's ShellPromise class has a bug with Node.js Promise subclassing that prevents it from working with vitest. This is a pre-existing issue that will be resolved when tests are migrated to use the new shell helper.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shell helper is ready for use in test migration
- Next plans should migrate test/helpers/repo.ts to use the new shell helper
- After repo.ts is migrated, migrate individual test files
- Remove bun alias from vitest.config.ts after all tests are migrated

---
*Phase: 02-test-migration*
*Completed: 2026-03-07*
