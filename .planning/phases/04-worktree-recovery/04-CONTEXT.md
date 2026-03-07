# Phase 4: Worktree Recovery - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current "prune missing worktrees" behavior with search-and-repair. When git knows about a worktree but its path doesn't exist, search nearby directories and fix the `.git` pointer instead of removing the registration.

**NOT in scope:** In-place migration (Phase 5), creating new worktrees, modifying git's worktree registry.

**Requirements addressed:** WORKTREE-01, WORKTREE-02, WORKTREE-03, WORKTREE-04, WORKTREE-05, WORKTREE-06

</domain>

<decisions>
## Implementation Decisions

### Search Behavior
- **Depth:** Fixed 3 levels deep (per ROADMAP) — no configuration needed
- **Directories searched:** Both source parent AND dest directories
- **Exclusions:** Skip hidden dirs (`.*`), `node_modules`, `.git`
- **Trigger:** When `listWorktrees()` returns paths that don't exist on filesystem

### Match Confidence
- **Multiple matches:** Prompt user to pick which directory is the correct worktree
- **Validation:** Found directory must be a git worktree (any `.git` file present)
- **No match:** Report as "not found" and continue with other worktrees

### User Interaction
- **Confirmation:** Show all found worktrees first, ask once to repair all (batch confirmation)
- **Multiple match prompt:** Interactive selection when multiple directories match one branch
- **Output timing:** Streaming output during search (show progress as found)

### Output Format
- **Display:** Table format (consistent with current worktree list display)
- **Per worktree:** Show old path → new path transformation
- **Summary:** Full report with all paths at the end

### Claude's Discretion
- Exact table column layout and widths
- Streaming output format (dots, spinners, or per-found lines)
- Error message wording for validation failures
- How to present multi-match selection (numbered list, etc.)

</decisions>

<specifics>
## Specific Ideas

- Replace the `git worktree prune` suggestion (cli.ts:165) with search-and-repair flow
- Reuse `sanitizeBranch()` for directory name matching
- Build on existing `repairHub()` pattern for fixing `.git` pointers

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sanitizeBranch(branch)` in migrate.ts — replaces `/` with `-` for directory matching
- `repairHub(dest, log)` in migrate.ts — scans `.bare/worktrees/` and fixes `.git` files
- `listWorktrees(repoPath)` in worktrees.ts — returns registered worktrees from git
- Log/warn callback pattern from Phase 3 — use for new functions

### Established Patterns
- Discriminated union (`RepoConfig`) drives branching logic
- Synchronous operations via `run()` wrapper
- Table display for worktree lists in CLI
- Confirmation prompts before destructive operations

### Integration Points
- cli.ts:159-173 — current prune suggestion flow to replace
- migrate.ts:resumeMigrate() — already handles pending worktrees, may need search integration
- worktrees.ts:listWorktrees() — source of truth for registered worktrees

### Hub Structure Reference
- `dest/.bare/worktrees/<admin-name>/gitdir` → points to worktree's `.git` file
- Worktree's `.git` file contains `gitdir: <path-to-admin-dir>`
- Admin dir name comes from original worktree path (not branch name)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-worktree-recovery*
*Context gathered: 2026-03-07*
