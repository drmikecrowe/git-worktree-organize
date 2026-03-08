# Architecture

**Analysis Date:** 2026-03-07

## Pattern Overview

**Overall:** Single-purpose CLI tool with a pipeline architecture (detect -> list -> migrate)

**Key Characteristics:**
- Zero runtime dependencies -- only Node.js standard library and git CLI
- Synchronous shell execution via `spawnSync` for all git and filesystem operations
- Discriminated union type (`RepoConfig`) drives branching logic through the pipeline
- Functions are `async` by signature but execute synchronously internally (via `run()`)

## Layers

**CLI Layer:**
- Purpose: Argument parsing, user interaction (prompts, display), orchestration
- Location: `src/cli.ts`
- Contains: `main()` entry point, ANSI formatting, usage text, interactive prompts
- Depends on: detect, worktrees, migrate, run
- Used by: End users via `npx git-worktree-organize` or the `git-worktree-organize` bin

**Detection Layer:**
- Purpose: Classify git repository type from filesystem inspection
- Location: `src/detect.ts`
- Contains: `detect()` function, `RepoConfig` discriminated union type
- Depends on: run (for `git config` reads), Node.js `fs`
- Used by: CLI layer to determine migration strategy

**Worktree Layer:**
- Purpose: Parse git worktree metadata from porcelain output
- Location: `src/worktrees.ts`
- Contains: `listWorktrees()`, `parsePorcelain()`, `Worktree` interface
- Depends on: run
- Used by: CLI layer (display), migrate layer (worktree enumeration)

**Migration Layer:**
- Purpose: Execute the actual repo restructuring (move files, rewrite .git pointers)
- Location: `src/migrate.ts`
- Contains: `migrate()`, `resumeMigrate()`, `repairHub()`, `processLinkedWorktree()`, helper functions
- Depends on: run, worktrees, git
- Used by: CLI layer

**Git Utilities:**
- Purpose: Typed wrappers around `git config` operations
- Location: `src/git.ts`
- Contains: `git()`, `gitConfig()`, `setGitConfig()`
- Depends on: run
- Used by: migrate layer

**Process Runner:**
- Purpose: Synchronous child process execution with error handling
- Location: `src/run.ts`
- Contains: `run()` function, `RunResult` interface
- Depends on: Node.js `child_process`
- Used by: All other layers

**Filesystem Utilities:**
- Purpose: Cross-filesystem move operation
- Location: `src/fs.ts`
- Contains: `move()`, `samefs()`
- Depends on: run, Node.js `fs`
- Used by: Not currently imported (superseded by `moveDir()` in `src/migrate.ts`)

## Data Flow

**Fresh Migration (standard repo):**

1. CLI parses args, resolves source/dest paths (`src/cli.ts` `main()`)
2. `detect(source)` inspects `.git` entry to classify repo type -> returns `RepoConfig` (`src/detect.ts`)
3. `listWorktrees(source)` runs `git worktree list --porcelain` and parses output -> returns `Worktree[]` (`src/worktrees.ts`)
4. CLI displays worktree table with destination paths, prompts for confirmation
5. `migrate(config, options)` orchestrates the restructuring (`src/migrate.ts`):
   a. Collision-checks sanitized branch names
   b. Creates `dest/.bare/` and copies git database
   c. Sets `core.bare = true` and writes `dest/.git` file
   d. Handles main worktree: removes `.git` dir, moves source to `dest/<branch>/`, creates admin dir
   e. Processes linked worktrees via `processLinkedWorktree()`: moves dirs, rewrites `.git` pointers
6. CLI verifies with `git worktree list` and displays result

**Resume Migration (partial hub detected):**

1. `isPartialMigration(dest)` detects `.bare/` + `.git` file at dest
2. `listWorktrees(dest)` enumerates registered worktrees
3. CLI filters for pending (not yet at expected location), displays them
4. `resumeMigrate(dest)` moves pending worktrees and runs `repairHub()`

**Hub Repair (broken .git files):**

1. `findHub(dirname(source))` walks ancestors looking for hub structure
2. `repairHub(hubPath)` scans `.bare/worktrees/` admin dirs
3. For each admin dir, reads the `gitdir` file to find the worktree's `.git` file
4. If the `.git` file's `gitdir:` pointer is stale, rewrites it

**State Management:**
- No persistent state -- all state is the git repository filesystem structure
- Partial migrations are detected by the presence of `.bare/` + `.git` file
- Worktree metadata comes from `git worktree list --porcelain` output

## Key Abstractions

**RepoConfig (discriminated union):**
- Purpose: Represents the 5 recognized git repository layouts
- Definition: `src/detect.ts` lines 5-10
- Variants: `standard`, `bare-root`, `bare-hub`, `bare-dotgit`, `bare-external`
- Pattern: Each variant has `type` discriminant and `gitdir` path; `standard` adds `mainWorktree`

**Worktree (interface):**
- Purpose: Represents a single git worktree's metadata
- Definition: `src/worktrees.ts` lines 3-8
- Fields: `path`, `head` (commit SHA), `branch` (null if detached), `isBare`
- Pattern: Parsed from `git worktree list --porcelain` blocks

**Hub Layout (filesystem convention):**
- Purpose: The canonical target structure for all migrations
- Pattern: `dest/.bare/` (bare git repo), `dest/.git` (file pointing to `.bare`), `dest/<branch>/` (worktree dirs)
- Detection: `isPartialMigration()` checks for `.bare/` dir + `.git` file

**run() (synchronous executor):**
- Purpose: Single point of child process execution with consistent error handling
- Definition: `src/run.ts`
- Pattern: Wraps `spawnSync`, throws on non-zero exit with `exitCode` and `stderr` on error object

## Entry Points

**CLI Entry (`src/cli.ts`):**
- Location: `src/cli.ts`
- Built to: `dist/cli.js` (via `bun build`)
- Triggers: `npx git-worktree-organize <source> [dest]` or direct invocation
- Shebang: `#!/usr/bin/env node`
- Responsibilities: Arg parsing, repo detection, user prompts, migration orchestration, verification

**Programmatic API:**
- No explicit public API module -- all exports are available from individual source files
- Key exports: `detect()` from `src/detect.ts`, `migrate()` from `src/migrate.ts`, `listWorktrees()` from `src/worktrees.ts`

## Error Handling

**Strategy:** Throw-on-failure with top-level catch in CLI

**Patterns:**
- `run()` throws an `Error` with `exitCode` and `stderr` properties on non-zero exit
- `detect()` throws descriptive errors for unrecognized repo types and linked worktrees
- `migrate()` throws on pre-existing `dest/.bare` or branch name collisions
- `gitConfig()` catches exit code 1 (key not found) and returns `null`
- `processLinkedWorktree()` uses `console.warn` for non-fatal issues (unparseable `.git` files, missing admin dirs)
- Top-level: `main().catch(err => { process.stderr.write(...); process.exit(1) })`

## Cross-Cutting Concerns

**Logging:** Direct `console.log` with ANSI color helpers in CLI layer; `log` callback parameter in migrate/repair functions
**Validation:** Filesystem existence checks (`existsSync`) before operations; collision detection for sanitized branch names
**Authentication:** Not applicable -- operates on local git repos only

---

*Architecture analysis: 2026-03-07*
