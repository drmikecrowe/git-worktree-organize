# Codebase Structure

**Analysis Date:** 2026-03-07

## Directory Layout

```
git-worktree-organize/
├── src/                # All source code (6 modules)
│   ├── cli.ts          # CLI entry point, arg parsing, user interaction
│   ├── detect.ts       # Repo type detection + RepoConfig type
│   ├── fs.ts           # Filesystem move utility (unused)
│   ├── git.ts          # Git config read/write helpers
│   ├── migrate.ts      # Core migration logic
│   ├── run.ts          # Synchronous child process runner
│   └── worktrees.ts    # Worktree listing and porcelain parser
├── test/               # Test files
│   ├── helpers/        # Shared test utilities
│   │   └── repo.ts     # Temp repo creation and assertion helpers
│   ├── __bun-shim__.ts # Bun shell ($) shim for vitest compatibility
│   ├── detect.test.ts  # Detection layer tests
│   ├── migrate.test.ts # Migration and resume tests
│   ├── security.test.ts # Command injection security tests
│   └── worktrees.test.ts # Worktree parsing tests
├── dist/               # Build output (single bundled file)
│   └── cli.js          # Bun-built Node.js bundle
├── package.json        # Project manifest
├── tsconfig.json       # TypeScript config (noEmit, bundler resolution)
├── vitest.config.ts    # Vitest config with bun shim alias
├── bun.lock            # Bun lockfile
├── package-lock.json   # npm lockfile
├── CLAUDE.md           # Agent instructions
├── AGENTS.md           # Agent instructions (alt)
└── README.md           # Project documentation
```

## Directory Purposes

**`src/`:**
- Purpose: All application source code
- Contains: 6 TypeScript modules, each with a single responsibility
- Key files: `cli.ts` (entry), `migrate.ts` (core logic), `detect.ts` (repo classification)

**`test/`:**
- Purpose: Test suites
- Contains: Integration tests that create real git repos in temp directories
- Key files: `helpers/repo.ts` (shared repo builders), `migrate.test.ts` (most comprehensive)

**`dist/`:**
- Purpose: Build output for npm publishing
- Contains: Single bundled `cli.js` file
- Generated: Yes (via `bun build`)
- Committed: Yes (published to npm)

## Key File Locations

**Entry Points:**
- `src/cli.ts`: CLI entry point, built to `dist/cli.js`
- `dist/cli.js`: Published executable (shebang `#!/usr/bin/env node`)

**Configuration:**
- `package.json`: Project config, scripts, bin mapping
- `tsconfig.json`: TypeScript compiler options
- `vitest.config.ts`: Test runner config with bun shim alias

**Core Logic:**
- `src/migrate.ts`: Migration orchestration (`migrate()`, `resumeMigrate()`, `repairHub()`)
- `src/detect.ts`: Repository type detection and `RepoConfig` type definition
- `src/worktrees.ts`: Worktree listing, `Worktree` interface, porcelain parser

**Infrastructure:**
- `src/run.ts`: `run()` function -- the single process execution primitive
- `src/git.ts`: Git config read/write wrappers
- `src/fs.ts`: Cross-filesystem move (currently unused -- `migrate.ts` has its own `moveDir()`)

**Testing:**
- `test/helpers/repo.ts`: `makeStandardRepo()`, `makeBareRootRepo()`, `makeBareHubRepo()`, `assertHubStructure()`, `assertWorktreeWorks()`
- `test/__bun-shim__.ts`: Compatibility shim so tests using Bun's `$` shell work under vitest

## Naming Conventions

**Files:**
- Lowercase, single-word names: `detect.ts`, `migrate.ts`, `run.ts`
- Test files: `<module>.test.ts` pattern
- No barrel/index files -- direct imports with `.ts` extension

**Functions:**
- camelCase: `listWorktrees()`, `sanitizeBranch()`, `isPartialMigration()`
- Predicate functions prefixed with `is`: `isPartialMigration()`

**Types:**
- PascalCase: `RepoConfig`, `Worktree`, `RunResult`, `MigrateOptions`
- Discriminated unions for variants: `RepoConfig` with `type` field

**Imports:**
- Use `.ts` extension in import paths: `import { run } from './run.ts'`
- Node.js builtins prefixed with `node:`: `import { join } from 'node:path'`

## Where to Add New Code

**New migration strategy or repo type:**
- Add variant to `RepoConfig` union in `src/detect.ts`
- Add detection logic in `detect()` function in `src/detect.ts`
- Add handling branch in `migrate()` in `src/migrate.ts`
- Add test in `test/migrate.test.ts`
- Add repo builder helper in `test/helpers/repo.ts` if needed

**New CLI feature or flag:**
- Add arg parsing in `src/cli.ts` `main()`
- Update `usage()` in `src/cli.ts`

**New git utility:**
- Add to `src/git.ts` if it wraps `git config` or similar
- Add to `src/run.ts` only if changing process execution behavior

**New test:**
- Place test file at `test/<module>.test.ts`
- Use helpers from `test/helpers/repo.ts` to create temp git repos
- Tests create real git repos in temp dirs -- no mocking of git operations

**New utility function:**
- General filesystem: `src/fs.ts`
- Git-specific: `src/git.ts`
- Branch/path manipulation for migration: `src/migrate.ts`

## Special Directories

**`dist/`:**
- Purpose: Single-file bundle for npm distribution
- Generated: Yes, via `bun build src/cli.ts --outfile dist/cli.js --target node`
- Committed: Yes (included in `"files"` for npm publish)

**`node_modules/`:**
- Purpose: Dev dependencies only (typescript, vitest, bun-types)
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-07*
