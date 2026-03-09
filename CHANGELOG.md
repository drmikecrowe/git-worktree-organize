# Changelog

## [Unreleased]

### Added

- Generate `AGENTS.md` at hub root after migration, documenting the worktree layout for AI coding agents. Skipped if the file already exists.

## [1.1.0] - 2026-03-07

### Added

- In-place migration: omit the destination to reorganize the repo at its current path (renames original to `.old`)
- Validation mode: run on an existing bare-hub to check worktree health (healthy/missing/stale)
- Version tracking with `--version` flag and startup banner
- Worktree recovery: search for missing worktrees and repair stale `.git` pointers
- Parent directory rename detection and automatic repair
- Resume partial migrations

### Fixed

- Show worktree list before in-place migration prompt

## [1.0.0] - 2026-03-06

### Added

- Initial release
- Migrate standard, bare-root, bare-dotgit, bare-external, and bare-hub repositories
- Branch name sanitization (slashes to hyphens) with collision detection
- Interactive confirmation before all changes
- Cross-filesystem move support
