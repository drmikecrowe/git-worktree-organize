# Phase 3: Code Quality - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor codebase to have single source of truth for move logic and consistent logging via injected callbacks. No new features, no behavior changes — only internal code quality improvements.

**NOT in scope:** Test migration (Phase 2 complete), worktree recovery (Phase 4), CLI features (Phase 5).

**Requirements addressed:** QUALITY-01, QUALITY-02

</domain>

<decisions>
## Implementation Decisions

### Move Logic Consolidation
- **Approach:** Merge migrate.ts:moveDir() into fs.ts:move()
- **Single function:** One `move()` function handles both cases (dest exists or not)
- **Logic:** If dest exists, stat dest for samefs check. If dest doesn't exist, stat dest's parent.
- **Export:** Single `move()` export from fs.ts — delete moveDir from migrate.ts
- **Safety:** Trust existing tests — no new unit tests for move() required

### Logging Callback Pattern
- **Problem:** Two `console.warn()` calls in migrate.ts (lines 296, 310) bypass injected log callback
- **Solution:** Add separate `warn` callback parameter
- **Signature:** Separate params, not options object: `(log?, warn?)`
- **Scope:** Only add `warn` to functions that currently use console.warn (minimal change)
- **Functions affected:** repairHub, and any other functions with console.warn calls

### Refactoring Safety
- **Verification:** Existing tests only — run `bun test` before and after
- **No new tests:** The existing test suite covers migrate.ts functions that call move logic
- **Behavioral guarantee:** If tests pass, refactoring succeeded

### Claude's Discretion
- Exact samefs() visibility (keep exported or make internal)
- Whether to inline samefs() logic into move() or keep separate
- Error messages for edge cases
- Import cleanup order (remove unused imports)

</decisions>

<specifics>
## Specific Ideas

- "Single source of truth" — one move implementation, not two
- Keep refactoring minimal — only what's needed for QUALITY-01 and QUALITY-02
- Tests are the safety net — if they pass, we're good

</specifics>

<code_context>
## Existing Code Insights

### Current Duplication
- `src/fs.ts:move()` — requires dest to exist for samefs check
- `src/migrate.ts:moveDir()` — handles dest not existing by checking parent
- Both use same pattern: renameSync if same filesystem, cp+rm otherwise

### Console.warn Locations
- `src/migrate.ts:296` — "Could not parse .git file in {wtDest}"
- `src/migrate.ts:310` — "Admin dir {newAdmin} does not exist for worktree {wtDest}"

### Functions with Log Callbacks
- `repairHub(dest, log = console.log)` — needs warn added
- `resumeMigrate(dest, log = console.log)` — check if warn needed

### Established Patterns
- Log callbacks default to console.log
- All logging in CLI goes through console.log directly (expected)
- Tests don't verify log output currently

### Integration Points
- migrate.ts imports from fs.ts (will import move after consolidation)
- CLI calls migrate functions with log callbacks
- Tests call migrate functions directly

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-code-quality*
*Context gathered: 2026-03-07*
