# git-worktree-organize

## What This Is

A CLI tool that converts any git repository into a bare-hub worktree layout where every branch lives in its own directory. Users can work on multiple branches simultaneously without stashing or switching.

Current version: **v1.0.13** — Stable, 34/34 tests passing, zero runtime dependencies.

## Core Value

Every branch as a sibling directory — work on multiple branches simultaneously without stashing or switching.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Migrate standard repos to hub layout (v1.0)
- ✓ Migrate bare-root, bare-dotgit, bare-external, bare-hub repos (v1.0)
- ✓ Resume partial migrations (v1.0)
- ✓ Repair stale .git pointers (v1.0)
- ✓ Interactive confirmation before changes (v1.0)
- ✓ Branch name sanitization (slashes to hyphens) (v1.0)
- ✓ Collision detection for sanitized names (v1.0)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Remove Bun runtime, standardize on Node.js
- [ ] Single test runner (Vitest only)
- [ ] Find and repair missing worktrees instead of prune
- [ ] In-place operation with validation or migration
- [ ] Code quality improvements (duplication, logging)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- `--force` flag — User wants explicit confirmation, not scripted bypass
- Windows support — Project is Unix-focused, no Windows testing available
- GUI interface — CLI is the product
- Git worktree creation — Only organizes existing worktrees, doesn't create new ones

## Context

**Technical environment:**
- TypeScript 5.x with strict mode
- Currently dual-runtime: Bun (dev) + Node.js (production)
- Zero runtime dependencies — only Node.js standard library + git CLI
- Vitest for testing with Bun shell API shim

**Codebase state:**
- Well-structured pipeline: detect → list → migrate
- Discriminated union (RepoConfig) drives branching logic
- All git operations via spawnSync (synchronous, blocking)
- Test coverage good for core modules, CLI module untested

**Known issues:**
- Duplicate move logic in fs.ts and migrate.ts
- Console.warn mixed with injected log callbacks
- CLI module has no direct test coverage
- Missing worktrees trigger prune suggestion instead of search/repair

## Constraints

- **Runtime**: Node.js only (remove Bun) — Simpler development, single runtime
- **Testing**: Vitest only — Remove dual-runtime complexity
- **Dependencies**: Zero runtime deps — Must stay zero
- **UX**: Always confirm destructive operations — No --force flag

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bare-hub layout as target | Every branch as sibling directory, IDE-friendly | ✓ Good |
| Synchronous git operations | CLI simplicity over concurrency | ✓ Good |
| Zero runtime dependencies | Smaller install, fewer failure modes | ✓ Good |
| Bun for development | Fast test runs, shell API convenience | ⚠️ Revisit — removing Bun |

---
*Last updated: 2026-03-07 after v1.1 milestone planning started*
