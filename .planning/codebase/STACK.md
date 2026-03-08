# Technology Stack

**Analysis Date:** 2026-03-07

## Languages

**Primary:**
- TypeScript 5.x - All source and test code (`src/**/*.ts`, `test/**/*.ts`)

**Secondary:**
- None

## Runtime

**Environment:**
- Bun (primary runtime for development and testing)
- Node.js (target runtime for published CLI binary)

**Package Manager:**
- Bun - Primary package manager
- Lockfile: `bun.lock` (present, Bun v1 lockfile format)
- `package-lock.json` also present (npm compatibility)

## Frameworks

**Core:**
- None - Pure Node.js standard library. Zero runtime dependencies.

**Testing:**
- Vitest 2.x - Test runner (`vitest.config.ts`)
- Bun's built-in test runner - Also supported via `bun test` (primary test command)

**Build/Dev:**
- Bun bundler - Builds single-file CLI (`bun build src/cli.ts --outfile dist/cli.js --target node`)
- TypeScript 5.x - Type checking only (`noEmit: true` in `tsconfig.json`)

## Key Dependencies

**Critical:**
- Zero runtime dependencies. The published package contains only `dist/cli.js`.

**Dev Dependencies:**
- `@types/bun` (latest) - Bun type definitions
- `typescript` (^5.0.0) - Type checking
- `vitest` (^2.0.0) - Test runner (alternative to `bun test`)

## Configuration

**TypeScript (`tsconfig.json`):**
- Target: ESNext
- Module: ESNext with bundler resolution
- Strict mode enabled
- Types: `bun-types`
- `allowImportingTsExtensions: true` - All imports use `.ts` extensions

**Vitest (`vitest.config.ts`):**
- Aliases `bun` module to `test/__bun-shim__.ts` for Node.js compatibility
- Globals disabled (`globals: false`)

**Package (`package.json`):**
- ESM only (`"type": "module"`)
- Version: 1.0.13
- License: MIT
- Binary: `git-worktree-organize` maps to `./dist/cli.js`
- Published files: `dist/` only

## Build Pipeline

**Build command:** `bun build src/cli.ts --outfile dist/cli.js --target node`
- Single entry point bundled to one file
- Targets Node.js runtime (shebang: `#!/usr/bin/env node`)
- No minification or source maps observed

**Test command:** `bun test` (primary), `vitest` (watch mode)

**Release:** `op run -- npm publish` (uses 1Password CLI for npm auth)

## Node.js Standard Library Usage

All functionality built on Node.js builtins:
- `node:child_process` (`spawnSync`) - Running git commands (`src/run.ts`)
- `node:fs` (`existsSync`, `statSync`, `readFileSync`, `writeFileSync`, `mkdirSync`, `renameSync`, `readdirSync`) - All file operations
- `node:path` (`resolve`, `join`, `dirname`, `basename`, `isAbsolute`) - Path manipulation

## Platform Requirements

**Development:**
- Bun runtime installed
- Git installed (CLI shells out to `git` for all git operations)

**Production (end user):**
- Node.js (any modern version supporting ESM)
- Git installed and available on PATH

---

*Stack analysis: 2026-03-07*
