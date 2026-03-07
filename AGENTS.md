# Agent Instructions

## Project Overview

This is **git-worktree-organize**, a CLI tool that reorganizes git repositories into a hub-and-worktree layout. It handles migration of standard repos into a structure with a bare repository hub and linked worktrees for each branch.

**Key files:**
- `src/cli.ts` - CLI entry point
- `src/migrate.ts` - Core migration logic
- `src/detect.ts` - Repository type detection
- `src/worktrees.ts` - Worktree parsing

**Codebase documentation:** `.planning/codebase/` contains detailed analysis:
- `STACK.md` - Technologies and dependencies
- `ARCHITECTURE.md` - System design and patterns
- `TESTING.md` - Test structure and conventions
- `CONVENTIONS.md` - Code style and patterns
- `CONCERNS.md` - Technical debt and known issues

---

## Test-Driven Development (MANDATORY)

**TDD is non-negotiable in this project.** Every feature, bug fix, and refactor must have tests.

### The Red-Green-Refactor Cycle

1. **RED**: Write a failing test that describes the desired behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Clean up the code while keeping tests green

### Before Writing Any Code

```bash
# 1. Check test conventions
cat .planning/codebase/TESTING.md

# 2. Run existing tests to ensure baseline is green
npm test

# 3. Create the test file if new module, or add to existing
```

### Test Requirements

| Change Type | Test Requirement |
|-------------|------------------|
| New feature | Tests MUST exist before implementation |
| Bug fix | Test that reproduces the bug MUST exist |
| Refactor | Existing tests MUST remain passing |
| CLI change | Add integration test for user flow |

### Test Structure

```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from '../src/module.ts'
import { makeTempDir, makeStandardRepo } from './helpers/repo.ts'

describe('moduleName', () => {
  it('describes scenario -> expected outcome', async () => {
    // Setup
    const dir = makeTempDir()
    await makeStandardRepo(dir)

    // Execute
    const result = await functionToTest(dir)

    // Assert
    expect(result).toEqual({ ... })
  })
})
```

### Test Commands

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Watch mode
npm run test:coverage # Run with coverage
```

### Test Helpers

Use factories from `test/helpers/repo.ts`:
- `makeTempDir()` - Create isolated temp directory
- `makeStandardRepo(dir, branches?)` - Create standard git repo
- `makeBareHubRepo(dir)` - Create hub-layout repo
- `assertHubStructure(dir)` - Verify hub layout is valid
- `assertWorktreeWorks(dir, branch)` - Verify worktree is functional

Shell commands use `test/helpers/shell.ts`:
- `run(cmd, args, options)` - Execute shell commands with Node.js spawn

---

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd sync               # Sync with git
```

### Creating Issues

```bash
# New feature with test requirement
bd create "Add dry-run mode" \
  --description="Add --dry-run flag to preview migration changes. MUST include tests for: 1) dry-run shows planned operations 2) dry-run makes no filesystem changes 3) dry-run works with all migration scenarios" \
  -t feature -p 1

# Bug fix with reproduction test
bd create "Fix cross-fs move" \
  --description="Cross-filesystem moves fail silently. MUST include test that reproduces the bug before fix." \
  -t bug -p 0

# Discovered work (links to parent)
bd create "Found edge case" \
  --description="Details about what was found" \
  -p 2 --deps discovered-from:bd-123
```

### Issue Types & Priorities

| Type | Use For |
|------|---------|
| `bug` | Something broken |
| `feature` | New functionality |
| `task` | Tests, docs, refactoring |
| `chore` | Dependencies, tooling |

| Priority | Meaning |
|----------|---------|
| `0` | Critical (security, data loss, broken builds) |
| `1` | High (major features, important bugs) |
| `2` | Medium (default) |
| `3` | Low (polish, optimization) |
| `4` | Backlog |

### Agent Workflow

1. **Check ready work**: `bd ready`
2. **Claim task**: `bd update <id> --claim`
3. **Write failing test FIRST** (for features/bugs)
4. **Implement minimum code to pass**
5. **Refactor if needed**
6. **Run tests**: `npm test`
7. **Close issue**: `bd close <id> --reason "Done"`

---

## GSD Workflow Integration

This project uses the **Get Shit Done (GSD)** workflow for structured development.

### Key Commands

```bash
/gsd:plan-phase    # Plan a phase with TDD in mind
/gsd:execute-phase # Execute with atomic commits
/gsd:progress      # Check current progress
```

### Planning with TDD

When using `/gsd:plan-phase`, the plan MUST include:
1. Test file(s) to create
2. Test cases for each acceptance criterion
3. Implementation tasks that come AFTER tests

---

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** to avoid hanging on confirmation prompts.

```bash
# Force without prompting
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest

# Other non-interactive forms
scp -o BatchMode=yes
ssh -o BatchMode=yes
apt-get -y
HOMEBREW_NO_AUTO_UPDATE=1 brew install X
```

---

## Session Completion Checklist

**Work is NOT complete until `git push` succeeds.**

```bash
# 1. Run tests
npm test

# 2. Commit changes
git add -A && git commit -m "..."

# 3. Sync and push
git pull --rebase
bd sync
git push

# 4. Verify
git status  # MUST show "up to date with origin"
```

### Before Ending Session

- [ ] All tests passing (`npm test`)
- [ ] Changes committed
- [ ] Pushed to remote
- [ ] Issues closed or updated
- [ ] Handoff context provided if work incomplete

---

## Code Conventions

From `.planning/codebase/CONVENTIONS.md`:

- **TypeScript strict mode** - No `any` without justification
- **Functional style** - Prefer pure functions, avoid classes
- **Error handling** - Throw descriptive errors with context
- **Logging** - Use injected log callbacks, not `console.*` directly
- **Imports** - Use `.ts` extension for local imports

### File Naming

- Source: `src/<module>.ts`
- Tests: `test/<module>.test.ts`
- Helpers: `test/helpers/<name>.ts`

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Writing code before tests | STOP. Write the test first. |
| Using `console.log` in production | Use injected log callback |
| Forgetting `await` on git ops | All git operations are async |
| Interactive shell commands | Always use `-f`, `-y`, etc. |
| Skipping the push step | Work isn't done until pushed |

---

## Quick Reference

```bash
# Tests
npm test                            # Run all tests
npm test test/migrate.test.ts       # Run specific file

# Issues
bd ready                            # Find available work
bd create "Title" -t feature -p 1   # New issue
bd update bd-42 --claim             # Claim work
bd close bd-42                      # Complete

# Codebase context
cat .planning/codebase/ARCHITECTURE.md  # System design
cat .planning/codebase/CONCERNS.md      # Known issues

# Session end
npm test && git add -A && git commit -m "..." && git push
```
