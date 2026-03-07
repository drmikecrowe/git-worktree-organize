---
phase: 02-test-migration
plan: 03
type: execute
wave: 3
depends_on: [02-02]
files_modified: [test/__bun-shim__.ts, test/helpers/repo.ts, README.md, CLAUDE.md]
autonomous: true
requirements: [TEST-01, TEST-03]
tags:
  - test-migration
  - cleanup
  - documentation
  - git-config-isolation
key-files:
  created: []
  modified:
    - test/helpers/shell.ts (added env option to RunOptions interface)
    - test/helpers/repo.ts (added GIT_CONFIG_GLOBAL isolation, all factory functions)
    - test/detect.test.ts (added isolatedEnv to inline git commands)
    - test/migrate.test.ts (added isolatedEnv to inline git commands)
    - test/worktrees.test.ts (added isolatedEnv to inline git commands)
    - README.md (added Features section, Recovery and Resume section)
    - AGENTS.md (updated testing instructions from bun test to npm test)
tech-stack:
  added:
    - GIT_CONFIG_GLOBAL environment variable for git config isolation
  - --initial-branch=main flag for consistent branch naming
patterns:
  - Environment option propagation for shell commands
  - Factory function pattern for test repo creation
  - Inline isolatedEnv constant in test files

decisions:
  - Use GIT_CONFIG_GLOBAL=/dev/null for git config isolation (cleanest approach)
  - Use --initial-branch=main to avoid branch name inconsistency across environments
---

## Summary

**One-liner:** Complete test migration cleanup with git config isolation, comprehensive documentation, and Vitest-only testing instructions.

Completed Phase 2 Plan 3: cleanup, git config isolation, and documentation updates.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Remove obsolete __bun-shim__.ts | fdbc866 |
| 2 | Add git config isolation to test helpers | cd8a628 |
| 3 | Update README.md with comprehensive feature documentation | ff7023d |
| 4 | Update CLAUDE.md testing instructions | 3bf7fb8 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Remove bun alias from vitest.config.ts**
- **Found during:** Task 1
- **Issue:** The vitest.config.ts still had a bun alias even though the plan stated it no longer had it
- **Fix:** Removed the alias configuration from vitest.config.ts
- **Files modified:** vitest.config.ts
- **Commit:** fdbc866

**2. [Rule 2 - Bug] Fix branch name inconsistency with isolated env**
- **Found during:** Task 2
- **Issue:** When using GIT_CONFIG_GLOBAL=/dev/null, git uses 'master' as default branch instead of 'main' (from user's gitconfig)
- **Fix:** Added --initial-branch=main to git init in makeStandardRepo and inline test repo creation
- **Files modified:** test/helpers/repo.ts, test/migrate.test.ts
- **Commit:** cd8a628

## Verification Results

- All 37 tests pass
- test/__bun-shim__.ts deleted (verified)
- GIT_CONFIG_GLOBAL used in test helpers (verified)
- README has "Recovery and Resume" section (verified)
- CLAUDE.md has no "bun test" references (verified)

## Files Modified

```
test/__bun-shim__.ts (deleted)
test/helpers/shell.ts (added env option)
test/helpers/repo.ts (added GIT_CONFIG_GLOBAL isolation)
test/detect.test.ts (added isolatedEnv)
test/migrate.test.ts (added isolatedEnv)
test/worktrees.test.ts (added isolatedEnv)
vitest.config.ts (removed bun alias)
README.md (added Features and Recovery sections)
AGENTS.md (updated testing instructions)
```
