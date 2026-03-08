# git-worktree-organize

## What This Is

A CLI tool that converts any git repository into a bare-hub worktree layout where every branch lives in its own directory. Users can work on multiple branches simultaneously without stashing or switching.

Current version: **v1.1** — Production Ready. Node.js-only toolchain, worktree recovery, in-place migration, 64/64 tests passing.

## Core Value

Every branch as a sibling directory — work on multiple branches simultaneously without stashing or switching.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

**v1.0 Capabilities:**
- ✓ Migrate standard repos to hub layout
- ✓ Migrate bare-root, bare-dotgit, bare-external, bare-hub repos
- ✓ Resume partial migrations
- ✓ Repair stale .git pointers
- ✓ Interactive confirmation before changes
- ✓ Branch name sanitization (slashes to hyphens)
- ✓ Collision detection for sanitized names

**v1.1 Capabilities:**
- ✓ Node.js-only development and production (no Bun)
- ✓ Vitest-only test runner with function-based shell helper
- ✓ Worktree recovery: search and repair missing worktrees
- ✓ Validation mode: run on existing hub to check health
- ✓ In-place migration: migrate repos without specifying destination
- ✓ Consolidated move logic (single source of truth)
- ✓ Consistent logging via injected callbacks

### Active

<!-- Current scope. Building toward these. -->

(No active requirements — milestone complete. Plan next milestone with `/gsd:new-milestone`)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- `--force` flag — User wants explicit confirmation, not scripted bypass
- Windows support — Project is Unix-focused, no Windows testing available
- GUI interface — CLI is the product
- Git worktree creation — Only organizes existing worktrees, doesn't create new ones
- Parallel worktree processing — Sequential is simpler, performance not a concern

## Context

**Technical environment:**
- TypeScript 5.x with strict mode
- Node.js 18+ only (Bun removed in v1.1)
- Zero runtime dependencies — only Node.js standard library + git CLI
- Vitest for testing with function-based shell helper

**Codebase state:**
- Well-structured pipeline: detect → list → migrate
- Discriminated union (RepoConfig) drives branching logic
- All git operations via Node.js spawn (async)
- Full test coverage including CLI module (64 tests)
- 1,456 lines of TypeScript in src/

**Resolved issues:**
- ✓ Duplicate move logic consolidated to fs.ts
- ✓ Console.warn replaced with injected log callbacks
- ✓ CLI module has test coverage
- ✓ Missing worktrees trigger search/repair instead of prune suggestion

## Constraints

- **Runtime**: Node.js 18+ only — Single runtime, simpler development
- **Testing**: Vitest only — Function-based shell helper
- **Dependencies**: Zero runtime deps — Must stay zero
- **UX**: Always confirm destructive operations — No --force flag

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bare-hub layout as target | Every branch as sibling directory, IDE-friendly | ✓ Good |
| Synchronous git operations | CLI simplicity over concurrency | ✓ Good |
| Zero runtime dependencies | Smaller install, fewer failure modes | ✓ Good |
| Node.js-only toolchain | Single runtime, broader compatibility | ✓ Good |
| esbuild for bundling | Fast builds, ESM output | ✓ Good |
| Function-based shell helper | Replaces Bun `$` API, better Node.js compatibility | ✓ Good |
| Copy backup for in-place | Preserves .old directory after migration | ✓ Good |
| Depth-limited worktree search | 3 levels balances thoroughness vs performance | ✓ Good |

---
*Last updated: 2026-03-08 after v1.1 milestone completion*
