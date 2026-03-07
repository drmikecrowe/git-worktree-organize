# Phase 2: Test Migration - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Bun test dependencies with Node.js-compatible Vitest setup. Tests must run with `npm test` using Vitest only, without Bun installed.

**NOT in scope:** Adding new features, changing CLI behavior, refactoring production code (Phase 3).

**Added scope:**
- Audit README.md to document all features
- Verify each documented feature has at least one test
- Git config isolation (tests must not use user's ~/.gitconfig)

</domain>

<decisions>
## Implementation Decisions

### Shell Execution (Test Helpers)
- **Location:** Move `__bun-shim__.ts` to `test/helpers/shell.ts`
- **API style:** Function-based, NOT tagged template
  - Old: `await $`git -C ${dir} status`.quiet()`
  - New: `await run('git', ['-C', dir, 'status'], { quiet: true })`
- **Error handling:** Throw on non-zero exit code (current behavior)
- **Options:** Use options object with `quiet` flag

### Test Commands (package.json)
- **test:** `vitest run` — single run, exits with code
- **test:coverage:** `vitest run --coverage` — coverage tracking
- **No test:watch script** — users can run `npx vitest` directly

### Git Config Isolation
- Tests must NOT use user's `~/.gitconfig`
- Each test creates isolated git config
- Approach: Planner's discretion (env var, temp HOME, or inline config flags)

### Cleanup Scope
- **Thorough:** Remove all Bun references
  - All `import { $ } from 'bun'` → `import { run } from './helpers/shell.ts'`
  - Update comments referencing Bun
  - Update documentation (CLAUDE.md, etc.)
  - Remove `__bun-shim__.ts` after moving to helpers

### README & Feature Coverage
- **Audit README.md:** Ensure all features are documented:
  - Migrating existing repos
  - Fixing worktree locations
  - Renaming worktree parents
  - Converting standard checkout to .bare setup
  - Other features as discovered
- **Test coverage:** Each documented feature has at least one test
- **Gap handling:** If feature lacks test, document as gap for future phase

### Claude's Discretion
- Exact function signature for shell helper (run vs exec vs shell)
- Git config isolation implementation approach
- Whether to add vitest.config.ts or use defaults
- Import extension style (.ts vs .js)

</decisions>

<specifics>
## Specific Ideas

- "All tests must setup to ignore the user's gitconfig" — explicit user requirement
- README should document all features comprehensively
- Each feature needs at least one test to verify it works

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/__bun-shim__.ts`: Already implements `$` API with spawnSync — logic can be adapted to function API
- `test/helpers/repo.ts`: Factory functions for test repos — needs Bun imports replaced
- `vitest` already in devDependencies — no new dependency needed

### Established Patterns
- Tests use Vitest (`describe`, `it`, `expect`)
- Async/await pattern throughout tests
- Factory functions for repo creation (makeStandardRepo, makeBareHubRepo, etc.)

### Files Needing Changes
- `test/__bun-shim__.ts` → move to `test/helpers/shell.ts`, refactor API
- `test/helpers/repo.ts` → replace `import { $ } from 'bun'`
- `test/detect.test.ts` → replace Bun imports
- `test/worktrees.test.ts` → replace Bun imports
- `test/security.test.ts` → replace Bun imports
- `test/migrate.test.ts` → replace Bun imports
- `package.json` → update test scripts
- `README.md` → add missing feature documentation
- `CLAUDE.md` → update testing section

### Integration Points
- `npm test` → runs Vitest
- `npm run test:coverage` → runs with coverage
- Tests call git CLI via new shell helper

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-test-migration*
*Context gathered: 2026-03-07*
