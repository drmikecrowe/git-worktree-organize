# Codebase Concerns

**Analysis Date:** 2026-03-07

## Tech Debt

**Duplicate move logic:**
- Issue: Two separate move implementations exist with slightly different behavior
- Files: `src/fs.ts:8-15` (`move`) and `src/migrate.ts:13-21` (`moveDir`)
- Impact: Code duplication, potential inconsistency when one is updated
- Fix approach: Consolidate into a single exported function in `src/fs.ts`, have `src/migrate.ts` import and use it

**fs.ts module underutilization:**
- Issue: `src/fs.ts` only contains `move()` and `samefs()` but is not imported anywhere
- Files: `src/fs.ts`
- Impact: Dead code, confusion about intended use
- Fix approach: Either remove `src/fs.ts` or have `src/migrate.ts` use its `move()` function

**Console logging mixed with injected log callbacks:**
- Issue: `src/migrate.ts` uses `console.warn` in `processLinkedWorktree()` while using injected `log` callbacks elsewhere
- Files: `src/migrate.ts:296, 310`
- Impact: Inconsistent logging behavior, cannot suppress warnings in library usage
- Fix approach: Pass log callback through to `processLinkedWorktree()` or make it a proper exported function with options

**Bun/Vitest dual runtime complexity:**
- Issue: Tests can run under both `bun test` and `vitest`, requiring a bun shim
- Files: `test/__bun-shim__.ts`, `vitest.config.ts`
- Impact: Maintenance burden, potential for subtle runtime differences
- Fix approach: Standardize on one test runner (recommend Vitest for broader Node.js compatibility)

## Known Bugs

**None detected** - All tests pass (34/34). The test file `test/migrate.test.ts` shows as modified in git status but this appears to be local development changes, not a bug.

## Security Considerations

**Command execution via spawnSync:**
- Risk: Shell commands executed via `spawnSync` could be vulnerable to injection if paths contain special characters
- Files: `src/run.ts:12`
- Current mitigation: Uses argument array (not shell string), which prevents shell injection
- Recommendations: Add input validation for paths containing shell metacharacters like `;`, `|`, `$`, backticks

**Path traversal in .git file parsing:**
- Risk: Malicious `.git` file could point to arbitrary directories
- Files: `src/detect.ts:47-70`
- Current mitigation: Validates that resolved gitdir contains `HEAD`, `objects`, and `refs` directories before accepting it
- Recommendations: Current mitigation is adequate; test exists in `test/security.test.ts`

**Destructive operations without rollback:**
- Risk: If migration fails mid-way, repo state may be inconsistent
- Files: `src/migrate.ts:241` (`rm -rf` of source .git), `src/migrate.ts:18-19` (rm -rf in cross-filesystem move)
- Current mitigation: `resumeMigrate()` and `repairHub()` can recover from partial migrations
- Recommendations: Document recovery procedures; consider a dry-run mode

**rm -rf usage:**
- Risk: Potential for catastrophic data loss if paths are incorrect
- Files: `src/migrate.ts:19, 241`, `src/fs.ts:13`
- Current mitigation: Paths are resolved and validated before operations
- Recommendations: Add explicit safety checks before destructive operations

## Performance Bottlenecks

**Synchronous command execution:**
- Problem: All git operations use `spawnSync`, blocking the event loop
- Files: `src/run.ts:11-24`
- Cause: CLI tool design favors simplicity over concurrency
- Improvement path: Acceptable for CLI use case; async would complicate error handling without significant benefit

**Cross-filesystem copy performance:**
- Problem: When source and dest are on different filesystems, falls back to `cp -a` + `rm -rf` which is slow for large repos
- Files: `src/migrate.ts:17-20`, `src/fs.ts:11-14`
- Cause: No way to atomically move across filesystem boundaries
- Improvement path: Show progress indicator during cross-filesystem copies; consider rsync for large transfers

**No parallel worktree processing:**
- Problem: Linked worktrees are processed sequentially in a loop
- Files: `src/migrate.ts:266-273`
- Cause: Simplicity and predictable error handling
- Improvement path: Could use `Promise.all()` for parallel moves if worktrees are independent

## Fragile Areas

**processLinkedWorktree internal function:**
- Files: `src/migrate.ts:279-312`
- Why fragile: Handles complex git worktree admin directory remapping; has two warning paths that use `console.warn` instead of throwing
- Safe modification: Extract to a separate exported function with proper error handling and logging injection
- Test coverage: Well-covered via `test/migrate.test.ts` (multiple scenarios)

**Branch name sanitization collision:**
- Files: `src/migrate.ts:31-33`, `src/migrate.ts:196-204`
- Why fragile: `a/b` and `a-b` both become `a-b`, causing data loss if both exist
- Safe modification: Current behavior throws error before any changes; safe as-is
- Test coverage: `test/migrate.test.ts:81-101` tests collision detection

**resumeMigrate path resolution:**
- Files: `src/migrate.ts:129-173`
- Why fragile: Complex logic for handling stale paths, missing paths, and wrong locations
- Safe modification: Extensive tests cover edge cases; modify with caution and add new tests
- Test coverage: Well-covered with multiple scenarios in `test/migrate.test.ts:115-338`

**detect() function state assumptions:**
- Files: `src/detect.ts:30-92`
- Why fragile: Assumes certain filesystem state; changes to repo between detect and migrate could cause issues
- Safe modification: Detect and migrate should be called atomically
- Test coverage: `test/detect.test.ts` and `test/security.test.ts`

## Scaling Limits

**Large number of worktrees:**
- Current capacity: No explicit limit
- Limit: Sequential processing becomes slow with many worktrees (50+)
- Scaling path: Parallelize worktree processing

**Repository size:**
- Current capacity: No explicit limit
- Limit: Cross-filesystem moves require full copy; very large repos (>10GB) may be slow
- Scaling path: Add progress reporting; use rsync for large transfers

**Branch name length:**
- Current capacity: Limited by filesystem (255 bytes typical)
- Limit: Very long branch names may hit filesystem limits
- Scaling path: Add validation/warning for extremely long branch names

## Dependencies at Risk

**Bun-specific APIs:**
- Risk: Tests use `import { $ } from 'bun'` which requires a shim for Vitest/Node
- Impact: Tests cannot run in pure Node.js environments
- Migration plan: Consider using Node.js native APIs or a cross-runtime shell library

**No lockfile version pinning:**
- Risk: `package.json` uses `"latest"` for `@types/bun` and no version constraints on some devDependencies
- Impact: Potential for breaking changes on fresh installs
- Migration plan: Pin exact versions in `package.json`

## Missing Critical Features

**Dry-run mode:**
- Problem: No way to preview changes without executing them
- Blocks: Safe evaluation of migration impact

**Force flag:**
- Problem: All operations require interactive confirmation
- Blocks: Scripted/automated usage

**Verbose logging:**
- Problem: Limited visibility into what's happening during migration
- Blocks: Troubleshooting failed migrations

## Test Coverage Gaps

**CLI module not directly tested:**
- What's not tested: `src/cli.ts` user interaction flows, argument parsing, error messages
- Files: `src/cli.ts`
- Risk: Breaking changes to CLI behavior may go undetected
- Priority: Medium

**Error path testing:**
- What's not tested: Edge cases like permission errors, disk full, git command failures mid-migration
- Files: All source files
- Risk: Unclear how tool behaves under error conditions
- Priority: Low (hard to simulate reliably)

**Windows compatibility:**
- What's not tested: Path handling on Windows (backslash vs forward slash)
- Files: All source files use `node:path`
- Risk: May not work correctly on Windows
- Priority: Low (project appears Unix-focused)

---

*Concerns audit: 2026-03-07*
