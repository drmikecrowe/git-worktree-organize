# Testing Patterns

**Analysis Date:** 2026-03-07

## Test Framework

**Runner:**
- Vitest v2.0.0
- Config: `vitest.config.ts`
- Dual support: `bun test` (native) and `vitest` (watch mode)

**Assertion Library:**
- Vitest built-in assertions via `expect`

**Run Commands:**
```bash
bun test              # Run all tests (native Bun)
npm run test          # Same via npm script
npm run test:watch    # Watch mode with Vitest
vitest                # Direct Vitest invocation
```

## Configuration

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      bun: resolve(__dirname, 'test/__bun-shim__.ts'),
    },
  },
  test: {
    globals: false,
  },
})
```

**Key Settings:**
- `globals: false` - Must explicitly import `describe`, `it`, `expect` from vitest
- Bun shell API (`$`) is aliased to a Node.js-compatible shim for Vitest

## Test File Organization

**Location:**
- Tests are in a separate `test/` directory (not co-located with source)
- Test helpers in `test/helpers/`

**Naming:**
- Pattern: `*.test.ts`
- Examples: `detect.test.ts`, `migrate.test.ts`, `worktrees.test.ts`, `security.test.ts`

**Structure:**
```
test/
├── __bun-shim__.ts    # Shim for Bun's $ shell API under Vitest/Node
├── detect.test.ts     # Repository detection tests
├── helpers/
│   └── repo.ts        # Test utilities for creating git repos
├── migrate.test.ts    # Migration and resume tests
├── security.test.ts   # Security guard tests
└── worktrees.test.ts  # Worktree parsing tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.ts'

describe('detect', () => {
  it('standard: git init + commit -> type standard', async () => {
    const dir = tempDir()
    await $`git -C ${dir} init`.quiet()
    await makeCommit(dir)

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'standard',
      gitdir: join(dir, '.git'),
      mainWorktree: dir,
    })
  })
})
```

**Patterns:**
- Group related tests by function/module in a `describe` block
- Test names describe the scenario and expected outcome
- Use `async/await` for all git operations
- Use `toEqual` for deep object comparison
- Use `toThrow` with string matching for error cases

## Mocking & Fixtures

**Framework:** None - uses real git operations against temp directories

**Test Isolation Strategy:**
- Each test creates isolated temp directories using `mkdtempSync`
- Uses real `git` commands via Bun's shell API (`$`)
- No mocking of git operations - integration-style testing

**Shell Command Pattern:**
```typescript
import { $ } from 'bun'

// Bun's tagged-template shell API
await $`git -C ${dir} init`.quiet()
await $`git -C ${dir} config user.email "test@test.com"`.quiet()
await $`git -C ${dir} commit --allow-empty -m "init"`.quiet()
```

**Vitest Shim for Shell Commands:**
The `test/__bun-shim__.ts` file provides a Node.js-compatible implementation of Bun's `$` API:
```typescript
// Implements the same tagged-template interface
export function $(strings: TemplateStringsArray, ...values: unknown[]): ShellPromise {
  const cmd = buildCmd(strings, ...values)
  return new ShellPromise(cmd)
}

// Usage is identical under both Bun and Vitest
await $`git -C ${dir} status`.quiet()
```

**What NOT to Mock:**
- Git commands - these are the core functionality being tested
- Filesystem operations - tests verify real file states

## Fixtures and Factories

**Test Data:**
Factory functions in `test/helpers/repo.ts` create test repositories:

```typescript
/** Create a temp directory and return its path. */
export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'git-worktree-organize-'))
}

/** Create a standard git repo with optional worktrees. */
export async function makeStandardRepo(dir: string, branches: string[] = []): Promise<void> {
  await $`git init ${dir}`.quiet()
  await $`git -C ${dir} config user.email "test@test.com"`.quiet()
  await $`git -C ${dir} config user.name "Test"`.quiet()
  await $`git -C ${dir} commit --allow-empty -m "init"`.quiet()

  for (const branch of branches) {
    const wtDir = join(dir + '-' + branch.replace(/\//g, '-'))
    await $`git -C ${dir} worktree add -b ${branch} ${wtDir}`.quiet()
  }
}

/** Create a bare-hub repo (already in hub layout). */
export async function makeBareHubRepo(dir: string): Promise<void> { ... }

/** Assert the hub structure is valid. */
export async function assertHubStructure(dir: string): Promise<void> { ... }

/** Assert a worktree for branch is functional. */
export async function assertWorktreeWorks(dir: string, branch: string): Promise<void> { ... }
```

**Location:**
- All test utilities in `test/helpers/repo.ts`
- Factory functions prefixed with `make` (e.g., `makeStandardRepo`, `makeBareHubRepo`)
- Assertion helpers prefixed with `assert` (e.g., `assertHubStructure`, `assertWorktreeWorks`)

## Coverage

**Requirements:** None enforced

**Configuration:** No coverage configuration in vitest.config.ts

**View Coverage:**
```bash
vitest --coverage    # Would require @vitest/coverage-v8 package
```

## Test Types

**Unit Tests:**
- Pure function tests like `parsePorcelain` in `worktrees.test.ts`
- Test string parsing with inline fixtures:
```typescript
it('parses a single normal worktree with branch main', () => {
  const input = `worktree /path/to/main
HEAD abc123def456abc123def456abc123def456abc123
branch refs/heads/main
`
  const result = parsePorcelain(input)
  expect(result).toHaveLength(1)
  expect(result[0]).toEqual({
    path: '/path/to/main',
    head: 'abc123def456abc123def456abc123def456abc123',
    branch: 'main',
    isBare: false,
  })
})
```

**Integration Tests:**
- Most tests are integration tests using real git operations
- Create temp repos, run operations, verify state
- Located in `migrate.test.ts`, `detect.test.ts`, `worktrees.test.ts`

**E2E Tests:**
- Full migration scenarios from start to finish
- Tests verify complete workflows including edge cases

**Security Tests:**
- Dedicated `security.test.ts` for security-specific scenarios
- Tests path traversal guards and malicious input handling

## Common Patterns

**Async Testing:**
```typescript
it('standard repo with extra worktree -> hub layout', async () => {
  const src = makeTempDir()
  await makeStandardRepo(src, ['feature'])
  const config = await detect(src)
  const dest = src + '-hub'

  await migrate(config, { source: src, dest })

  await assertHubStructure(dest)
  await assertWorktreeWorks(dest, 'main')
  await assertWorktreeWorks(dest, 'feature')
})
```

**Error Testing:**
```typescript
it('reject linked worktree: detect on worktree dir throws', async () => {
  const mainDir = tempDir()
  const wtDir = join(tempDir(), 'wt')
  await $`git -C ${mainDir} init`.quiet()
  await makeCommit(mainDir)
  await $`git -C ${mainDir} worktree add ${wtDir}`.quiet()

  await expect(detect(wtDir)).rejects.toThrow('linked worktree')
})

it('throws if dest/.bare already exists', async () => {
  // ... setup ...
  await expect(migrate(config, { source: src, dest })).rejects.toThrow('already exists')
})
```

**Complex Scenario Testing:**
```typescript
it('resumeMigrate: source is already partial hub, moves remaining worktrees in-place', async () => {
  // 1. Create full migration
  // 2. Manually break it to simulate partial state
  // 3. Run resumeMigrate
  // 4. Assert both worktrees are fixed
})
```

**Log Capture Pattern:**
For functions that accept a log callback, tests capture logs for assertion:
```typescript
const logs: string[] = []
await resumeMigrate(dest, msg => logs.push(msg))

expect(logs.some(l => l.includes('feature'))).toBe(true)
```

## Adding New Tests

**For a new function in existing module:**
1. Add test to existing `*.test.ts` file in `test/`
2. Follow existing describe block structure

**For a new module:**
1. Create `test/<module>.test.ts`
2. Import from `../src/<module>.ts`
3. Add helper functions to `test/helpers/repo.ts` if needed

**Test file template:**
```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from '../src/module.ts'
import { makeTempDir } from './helpers/repo.ts'

describe('moduleName', () => {
  it('describes the scenario and expected outcome', async () => {
    // Setup
    const dir = makeTempDir()

    // Execute
    const result = await functionToTest(dir)

    // Assert
    expect(result).toEqual({ ... })
  })
})
```

---

*Testing analysis: 2026-03-07*
