# External Integrations

**Analysis Date:** 2026-03-07

## APIs & External Services

**None.** This is a standalone CLI tool with no network calls, no external API dependencies, and no cloud services.

## Data Storage

**Databases:**
- None

**File Storage:**
- Local filesystem only
- Reads and writes git repository structures (`.git`, `.bare`, worktree admin dirs)
- All file operations use synchronous Node.js `fs` APIs

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None - The tool operates on local git repositories with no authentication

## External CLI Dependencies

**Git:**
- The tool shells out to `git` via `spawnSync` for all git operations (`src/run.ts`)
- Commands used: `git worktree list --porcelain`, `git config --get`, `git config`, `git -C`, `git worktree prune`, `git worktree repair`
- Git must be installed and on PATH
- No minimum version specified

**System commands (cross-filesystem fallback):**
- `cp -a` - Used in `src/fs.ts` and `src/migrate.ts` for cross-device moves
- `rm -rf` - Used to remove source after cross-device copy

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- `console.log` with ANSI color helpers for user-facing output (`src/cli.ts`)
- `console.warn` for non-fatal warnings in migration logic (`src/migrate.ts`)

## CI/CD & Deployment

**Hosting:**
- npm registry (published as `git-worktree-organize`)

**CI Pipeline:**
- Not detected in repository

**Release process:**
- `op run -- npm publish` - Uses 1Password CLI (`op`) to inject npm credentials
- `prepublishOnly` hook runs `bun run build` before publish

## Environment Configuration

**Required env vars:**
- None for normal operation

**Secrets location:**
- npm publish credentials managed via 1Password (`op run --`)
- No `.env` files present or expected

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Integration Summary

This is a zero-dependency CLI tool that operates entirely on the local filesystem. Its only external integration is shelling out to `git` for repository operations. The tool reads and manipulates git internal structures (worktree admin dirs, `.git` files, git config) directly via the filesystem alongside git CLI commands.

---

*Integration audit: 2026-03-07*
