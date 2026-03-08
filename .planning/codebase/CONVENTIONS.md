# Coding Conventions

**Analysis Date:** 2026-03-07

## Naming Patterns

**Files:**
- Use lowercase, single-word names: `run.ts`, `git.ts`, `fs.ts`, `detect.ts`, `migrate.ts`, `worktrees.ts`, `cli.ts`
- Test files use `.test.ts` suffix: `detect.test.ts`, `migrate.test.ts`
- Test helpers live in `test/helpers/` with descriptive names: `test/helpers/repo.ts`

**Functions:**
- Use camelCase: `listWorktrees`, `parsePorcelain`, `sanitizeBranch`, `resolveWorktreePath`, `isPartialMigration`
- Prefix boolean-returning functions with `is` or `same`: `isPartialMigration()`, `samefs()`
- Use verb-first naming: `detect()`, `migrate()`, `move()`, `run()`
- Private/internal helpers use camelCase without export: `moveDir()`, `readCoreBare()`, `processLinkedWorktree()`

**Variables:**
- Use camelCase: `destBare`, `mainBranch`, `wtSafe`, `hubWorktrees`
- Abbreviations are acceptable for local scope: `wt` (worktree), `src` (source), `dest` (destination)
- Constants use UPPER_SNAKE_CASE only for ANSI color codes in `src/cli.ts`: `GREEN`, `YELLOW`, `BOLD`, `RESET`

**Types:**
- Use PascalCase for interfaces and type aliases: `Worktree`, `RepoConfig`, `RunResult`, `MigrateOptions`
- Use discriminated unions with a `type` string field for variant types:
  ```typescript
  export type RepoConfig =
    | { type: 'standard';      gitdir: string; mainWorktree: string }
    | { type: 'bare-root';     gitdir: string }
    | { type: 'bare-hub';      gitdir: string }
    | { type: 'bare-dotgit';   gitdir: string }
    | { type: 'bare-external'; gitdir: string }
  ```

## Code Style

**Formatting:**
- No formatter configuration detected (no Prettier, no Biome)
- 2-space indentation used consistently
- Single quotes for strings
- No trailing commas enforced but used inconsistently
- Alignment of related declarations with extra spaces:
  ```typescript
  const GREEN  = '\x1b[32m'
  const YELLOW = '\x1b[33m'
  const BOLD   = '\x1b[1m'
  const RESET  = '\x1b[0m'
  ```

**Linting:**
- No ESLint or linting configuration detected
- TypeScript strict mode enabled via `tsconfig.json`

## Import Organization

**Order:**
1. Node.js built-in modules with `node:` prefix: `import { join } from 'node:path'`
2. External packages (Bun in tests): `import { $ } from 'bun'`
3. Test framework imports: `import { describe, it, expect } from 'vitest'`
4. Local project imports with `.ts` extension: `import { run } from './run.ts'`

**Path Aliases:**
- Vitest config aliases `bun` to `test/__bun-shim__.ts` so Bun's `$` shell API works under Node.js/Vitest
- No other path aliases; all imports use relative paths with `.ts` extensions

**Import Style:**
- Always use named imports, never default imports
- Always include `.ts` file extension in local imports
- Use `import type` for type-only imports: `import type { RepoConfig } from './detect.ts'`

## Error Handling

**Patterns:**
- Throw `Error` with descriptive messages for invalid states:
  ```typescript
  throw new Error(`not a git repository: ${repoPath}`)
  throw new Error(`'${destBare}' already exists`)
  throw new Error(`branch name collision: '${seen.get(safe)}' and '${branch}' both map to '${safe}'`)
  ```
- Attach extra properties to errors for programmatic handling:
  ```typescript
  const err: any = new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr?.trim()}`)
  err.exitCode = result.status
  err.stderr = result.stderr
  throw err
  ```
- Use `catch` with `any` type annotation: `catch (err: any)`
- Swallow expected errors (e.g., git config key not found returns exit code 1):
  ```typescript
  try {
    const result = await git(['config', '--get', key], ...)
    return result.trimEnd()
  } catch (err: any) {
    if (err?.exitCode === 1) return null
    throw err
  }
  ```
- CLI top-level catch writes to stderr and exits:
  ```typescript
  main().catch(err => {
    process.stderr.write(`error: ${err.message}\n`)
    process.exit(1)
  })
  ```

## Logging

**Framework:** Direct `console.log` and `console.warn` calls

**Patterns:**
- CLI output uses ANSI color helper functions: `green()`, `yellow()`, `bold()`
- Library functions accept an optional `log` callback parameter with a default:
  ```typescript
  export async function repairHub(dest: string, log: (msg: string) => void = console.log): Promise<void>
  export async function resumeMigrate(dest: string, log: (msg: string) => void = console.log): Promise<string>
  ```
- Use `console.warn` for non-fatal issues in library code: `console.warn(\`Could not parse .git file in ${wtDest}\`)`
- CLI prefixes log messages with a green arrow: `${green('==>')} ${msg}`

## Comments

**When to Comment:**
- Use JSDoc for all exported functions with a one-line description
- Use inline comments for non-obvious logic, especially git internals
- Use section divider comments in CLI for logical blocks:
  ```typescript
  // ── Resume partial migration? ─────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  ```

**JSDoc/TSDoc:**
- Single-line `/** ... */` JSDoc on all exported functions
- No `@param` or `@returns` annotations; description only:
  ```typescript
  /**
   * Run a command synchronously. Throws on non-zero exit.
   */
  export function run(cmd: string, args: string[], ...): RunResult
  ```

## Function Design

**Size:** Functions range from 3-90 lines. Most utility functions are under 20 lines. The `migrate()` function is the largest at ~100 lines. `main()` in CLI is ~200 lines (procedural flow).

**Parameters:**
- Use options objects for optional parameters: `options?: { cwd?: string; env?: Record<string, string> }`
- Use simple positional parameters for required args: `(src: string, dest: string)`
- Log callbacks use `(msg: string) => void` type with `console.log` default

**Return Values:**
- Functions return specific types, not `any`
- Async functions return `Promise<T>` even when internally synchronous (e.g., `detect()`, `git()`)
- Use `null` for "not found" cases: `gitConfig()` returns `string | null`

## Module Design

**Exports:**
- Named exports only, no default exports
- Each module exports a focused set of related functions
- Types are exported alongside the functions that use them

**Barrel Files:**
- No barrel/index files; each module imported directly by path

**Module Responsibilities:**
- `src/run.ts`: Low-level synchronous command execution
- `src/git.ts`: Git command wrapper functions
- `src/fs.ts`: Filesystem utilities (move, samefs)
- `src/detect.ts`: Repository type detection
- `src/worktrees.ts`: Worktree parsing and listing
- `src/migrate.ts`: Migration orchestration and repair logic
- `src/cli.ts`: CLI entry point and user interaction

---

*Convention analysis: 2026-03-07*
