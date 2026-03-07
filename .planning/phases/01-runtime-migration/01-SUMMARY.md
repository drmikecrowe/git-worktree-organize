---
phase: 01-runtime-migration
plan: 01
subsystem: build
tags: [esbuild, node, typescript, toolchain]

# Dependency graph
requires: []
provides:
  - Node.js-only build toolchain using esbuild
  - @types/node for TypeScript compilation
affects: [test-migration, code-quality]

# Tech tracking
tech-stack:
  added: [esbuild (via npx), @types/node]
  patterns: [esm bundle, platform=node]

key-files:
  created: []
  modified:
    - package.json
    - tsconfig.json
    - package-lock.json

key-decisions:
  - "Use npx esbuild instead of bun build for build command"
  - "Use --format=esm to maintain ESM module compatibility"
  - "Use --outfile= syntax (with equals) for esbuild argument parsing"

patterns-established:
  - "Build: npx esbuild src/cli.ts --bundle --platform=node --format=esm --outfile=dist/cli.js"
  - "TypeScript types: node instead of bun-types"

requirements-completed: [RUNTIME-01, RUNTIME-02, RUNTIME-03]

# Metrics
duration: 4min
completed: 2026-03-07
---

# Phase 1 Plan 1: Runtime Migration Summary

**Replaced Bun build toolchain with Node.js-compatible esbuild, enabling developers to build and run the CLI without Bun installed.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T14:50:57Z
- **Completed:** 2026-03-07T14:55:10Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Removed Bun as a build dependency - developers can now build with just Node.js
- Updated package.json to use `npx esbuild` with ESM output format
- Updated tsconfig.json to use `@types/node` instead of `bun-types`
- Verified built CLI runs correctly on Node.js 22

## Task Commits

Each task was committed atomically:

1. **Task 1: Update package.json for Node.js build toolchain** - `51e1dcb` (feat)
2. **Task 2: Update tsconfig.json for Node.js types** - `217eb5f` (feat)
3. **Task 3: Install dependencies and verify build** - `e2789f0` (feat)

## Files Created/Modified

- `package.json` - Updated build script to use esbuild, replaced @types/bun with @types/node
- `tsconfig.json` - Changed types from ["bun-types"] to ["node"]
- `package-lock.json` - Updated lockfile with new dependencies

## Decisions Made

- Used `npx esbuild` instead of installing esbuild as a devDependency (no additional dependency)
- Used `--format=esm` flag because package.json has `"type": "module"` - default CJS format caused require() errors
- Used `--outfile=` syntax (with equals sign) because esbuild argument parser requires it for this flag

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed esbuild --outfile flag syntax**
- **Found during:** Task 3 (build verification)
- **Issue:** `--outfile dist/cli.js` caused "Invalid build flag" error; esbuild requires `--outfile=dist/cli.js` syntax
- **Fix:** Changed to `--outfile=dist/cli.js` with equals sign
- **Files modified:** package.json
- **Verification:** `npm run build` succeeds
- **Committed in:** e2789f0 (Task 3 commit)

**2. [Rule 3 - Blocking] Added --format=esm flag**
- **Found during:** Task 3 (CLI execution verification)
- **Issue:** Built CLI used require() but package.json has "type": "module", causing ES module error
- **Fix:** Added `--format=esm` to esbuild command
- **Files modified:** package.json
- **Verification:** `node dist/cli.js --help` outputs usage text correctly
- **Committed in:** e2789f0 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both fixes necessary for correct operation. No scope creep.

## Issues Encountered

- TypeScript compilation fails on test files because they import from `bun` - this is expected and will be addressed in Phase 2 (Test Migration)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Build toolchain complete - developers can build without Bun
- Phase 2 (Test Migration) can now proceed to replace Bun test dependencies with Vitest/Node equivalents
- Test files still import `from 'bun'` and will need migration

---
*Phase: 01-runtime-migration*
*Completed: 2026-03-07*
