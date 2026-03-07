# Roadmap: git-worktree-organize

**Milestone:** v1.1 — Production Ready
**Created:** 2026-03-07
**Granularity:** Standard

## Goal

Transform git-worktree-organize into a production-grade CLI tool with simplified runtime (Node.js only), robust worktree recovery, and in-place operation support.

## Phases

- [x] **Phase 1: Runtime Migration** - Remove Bun, standardize on Node.js
- [x] **Phase 2: Test Migration** - Vitest only, remove dual-runtime complexity
- [x] **Phase 3: Code Quality** - Consolidate move logic, fix logging inconsistencies
- [x] **Phase 4: Worktree Recovery** - Find and repair missing worktrees instead of prune
- [x] **Phase 5: CLI In-Place** - In-place operation with validation mode

---

## Phase Details

### Phase 1: Runtime Migration

**Goal:** Developers can build and run the tool using only Node.js — no Bun required.

**Depends on:** Nothing (first phase)

**Requirements:** RUNTIME-01, RUNTIME-02, RUNTIME-03

**Success Criteria** (what must be TRUE):
1. User can run `npm run build` successfully without Bun installed
2. User can execute built CLI with `node dist/cli.js` on any Node.js 18+ system
3. Package.json contains only Node.js-compatible devDependencies (no Bun-specific packages)
4. All build artifacts work without Bun runtime APIs

**Plans:** 01 (3 tasks)

---

### Phase 2: Test Migration

**Goal:** Developers can run all tests with a single command using Vitest only.

**Depends on:** Phase 1

**Requirements:** TEST-01, TEST-02, TEST-03

**Success Criteria** (what must be TRUE):
1. User can run `npm test` to execute all tests without Bun installed
2. Tests use Node.js spawn/exec for shell commands instead of Bun `$` API
3. Test helper functions (makeTempDir, makeStandardRepo, etc.) work with Node.js only
4. All 34+ existing tests pass after migration

**Plans:** 01 (3 tasks), 02 (4 tasks), 03 (4 tasks)

---

### Phase 3: Code Quality

**Goal:** Codebase has single source of truth for move logic and consistent logging.

**Depends on:** Phase 2

**Requirements:** QUALITY-01, QUALITY-02

**Success Criteria** (what must be TRUE):
1. Move logic exists in exactly one place (fs.ts) with no duplication in migrate.ts
2. All functions in migrate.ts use injected log callback — no console.warn calls remain
3. All existing tests continue to pass after refactoring
4. Code review confirms no behavioral changes to migration logic

**Plans:** 01 (2 tasks)

---

### Phase 4: Worktree Recovery

**Goal:** Users can recover from missing worktrees by searching and repairing instead of pruning.

**Depends on:** Phase 3

**Requirements:** WORKTREE-01, WORKTREE-02, WORKTREE-03, WORKTREE-04, WORKTREE-05, WORKTREE-06

**Success Criteria** (what must be TRUE):
1. User with missing worktrees sees tool search for them instead of suggesting prune
2. Tool finds worktrees located up to 3 directory levels deep from hub/destination
3. Tool matches directories to missing worktrees by sanitized branch name
4. Tool repairs found worktrees by fixing .git pointer to point to correct hub location
5. User sees clear output showing which worktrees were found and repaired
6. Tests verify search logic, matching algorithm, and repair functionality

**Plans:** TBD

---

### Phase 5: CLI In-Place

**Goal:** Users can operate on existing hub directories and migrate repos in-place.

**Depends on:** Phase 4

**Requirements:** CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, QUALITY-03

**Success Criteria** (what must be TRUE):
1. User running tool on existing hub directory gets validation report (healthy, missing, stale worktrees)
2. User running tool on standard repo is prompted to migrate in-place
3. In-place migration renames source directory to `.old` before creating hub
4. In-place migration destination matches original source path (hub ends up where repo was)
5. CLI module has test coverage for validation mode and in-place migration flow
6. Tests cover user interaction scenarios (confirmation prompts, error handling)

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Runtime Migration | 1/1 | Done | 2026-03-07 |
| 2. Test Migration | 3/3 | Done | 2026-03-07 |
| 3. Code Quality | 1/1 | Done | 2026-03-07 |
| 4. Worktree Recovery | 2/2 | Done | 2026-03-07 |
| 5. CLI In-Place | 2/2 | Done | 2026-03-07 |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUNTIME-01 | Phase 1 | Done |
| RUNTIME-02 | Phase 1 | Done |
| RUNTIME-03 | Phase 1 | Done |
| TEST-01 | Phase 2 | Done |
| TEST-02 | Phase 2 | Done |
| TEST-03 | Phase 2 | Done |
| QUALITY-01 | Phase 3 | Done |
| QUALITY-02 | Phase 3 | Done |
| WORKTREE-01 | Phase 4 | Done |
| WORKTREE-02 | Phase 4 | Done |
| WORKTREE-03 | Phase 4 | Done |
| WORKTREE-04 | Phase 4 | Done |
| WORKTREE-05 | Phase 4 | Done |
| WORKTREE-06 | Phase 4 | Done |
| CLI-01 | Phase 5 | Done |
| CLI-02 | Phase 5 | Done |
| CLI-03 | Phase 5 | Done |
| CLI-04 | Phase 5 | Done |
| CLI-05 | Phase 5 | Done |
| QUALITY-03 | Phase 5 | Done |

**Coverage:** 20/20 requirements mapped (100%)

---

*Roadmap created: 2026-03-07*
*Last updated: 2026-03-07 (Phase 4 Plan 1 complete)*
