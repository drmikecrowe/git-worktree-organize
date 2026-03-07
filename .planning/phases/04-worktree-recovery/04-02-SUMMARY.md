---
plan: 04-02
phase: worktree-recovery
status: complete
completed: 2026-03-07
duration_minutes: 15
requirements: [WORKTREE-06]
---

# Plan 04-02: CLI Integration for Recovery Flow

## Summary

Integrated worktree recovery into the CLI, replacing the prune suggestion with a search-and-repair flow when missing worktrees are detected during partial migration handling.

## What Was Built

### CLI Recovery Flow
- **Detection**: When `migrate` detects missing worktrees, triggers search instead of suggesting prune
- **Search**: Calls `findMissingWorktrees()` with streaming progress output
- **Display**: Shows found worktrees in table format with branch names and paths
- **Multiple Matches**: Interactive selection when multiple directories match one branch
- **Confirmation**: Batch confirmation prompt before repairing all worktrees
- **Repair**: Calls `repairWorktree()` for each found worktree

### User Experience
```
warn: Partial migration detected at /path/to/hub

The following worktree paths no longer exist:
  [feature/test]  /path/to/hub/feature-test

==> Searching for missing worktrees...
    Searching for missing worktree [feature/test]...
    Found candidate: /path/to/external/feature-test

Found:
  [feature/test]  /path/to/external/feature-test

Repair these worktrees? [y/N] y
==> Repairing /path/to/external/feature-test -> /path/to/hub/.bare/worktrees/feature-test
==> Repaired 1 worktree(s).
```

## Files Modified

| File | Changes |
|------|---------|
| `src/cli.ts` | Added recovery flow in partial migration handling (+170 lines) |
| `test/cli.test.ts` | CLI tests for recovery detection and search |

## Test Results

- **Total**: 53 tests passing
- **New**: 4 CLI recovery tests
- **Coverage**: Detection, search, display, no-match handling

## Requirements Completed

| ID | Requirement | Status |
|----|-------------|--------|
| WORKTREE-06 | CLI integration for recovery | ✓ Complete |

## Deviations

1. **Simplified CLI tests**: Full subprocess interaction testing with multiple prompts proved unreliable due to stdin buffering. Focused tests on detection and search behavior. Core recovery functions tested in `recover.test.ts`.

2. **No integration tests for full repair flow**: Multi-prompt scenarios require PTY-based testing which adds complexity. The repair logic is covered by unit tests.

## Self-Check

- [x] All tasks executed
- [x] Each task committed individually
- [x] SUMMARY.md created
- [x] Tests passing (53/53)
- [x] No regressions
