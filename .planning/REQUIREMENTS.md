# Requirements: git-worktree-organize

**Defined:** 2026-03-07
**Core Value:** Every branch as a sibling directory — work on multiple branches simultaneously

## v1.1 Requirements

Requirements for Production Ready milestone. Each maps to roadmap phases.

### Runtime

- [x] **RUNTIME-01**: User can run all development commands with Node.js (no Bun required)
- [x] **RUNTIME-02**: Build produces Node.js-compatible output without Bun-specific APIs
- [x] **RUNTIME-03**: Package.json uses Node.js-compatible devDependencies only

### Testing

- [x] **TEST-01**: User can run all tests with `npm test` using Vitest only
- [x] **TEST-02**: Tests use Node.js-compatible shell execution (no Bun `$` API)
- [x] **TEST-03**: Test helper functions work without Bun runtime

### Worktree Recovery

- [x] **WORKTREE-01**: Tool searches for missing worktrees under source directory
- [x] **WORKTREE-02**: Tool searches for missing worktrees under destination directory (if provided)
- [x] **WORKTREE-03**: Search traverses up to 3 levels deep (hub, immediate children, grandchildren)
- [x] **WORKTREE-04**: Tool matches directories to missing worktrees by sanitized branch name
- [x] **WORKTREE-05**: Tool repairs found worktrees by fixing .git pointer instead of pruning
- [ ] **WORKTREE-06**: User sees which worktrees were found and repaired

### CLI

- [x] **CLI-01**: User can run tool on existing hub directory to validate structure
- [x] **CLI-02**: Validation reports which worktrees are healthy, missing, or have stale pointers
- [x] **CLI-03**: User running tool on standard repo is prompted to migrate in-place
- [x] **CLI-04**: In-place migration renames source to `.old` before proceeding
- [x] **CLI-05**: In-place migration destination matches original source path

### Quality

- [x] **QUALITY-01**: Move logic consolidated to single implementation in fs.ts
- [x] **QUALITY-02**: All migrate functions use injected log callback (no console.warn)
- [x] **QUALITY-03**: CLI module has test coverage for user interaction flows

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Quality

- **QUAL-04**: Error path testing (permission errors, disk full, git failures)
- **QUAL-05**: Verbose logging mode for troubleshooting

### Features

- **FEAT-01**: Dry-run mode to preview changes without executing
- **FEAT-02**: Progress reporting for large repo migrations

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `--force` flag | User wants explicit confirmation, not scripted bypass |
| Windows support | Project is Unix-focused, no Windows testing available |
| GUI interface | CLI is the product |
| Git worktree creation | Only organizes existing worktrees, doesn't create new ones |
| Parallel worktree processing | Sequential is simpler, performance not a concern |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

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
| WORKTREE-06 | Phase 4 | Pending |
| CLI-01 | Phase 5 | Complete |
| CLI-02 | Phase 5 | Complete |
| CLI-03 | Phase 5 | Complete |
| CLI-04 | Phase 5 | Complete |
| CLI-05 | Phase 5 | Complete |
| QUALITY-03 | Phase 5 | Complete |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 (Phase 4 Plan 1 complete)*
