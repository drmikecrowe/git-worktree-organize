# Phase 5: CLI In-Place - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can run the tool on existing hub directories (validation mode) or be prompted to migrate standard repos in-place. The hub ends up at the original repo path with minimal disruption.

</domain>

<decisions>
## Implementation Decisions

### In-place migration flow
- **Confirm before rename**: User sees what will happen and confirms before source is renamed to .old
- **Handle .old conflict**: Abort with error message if .old already exists — don't overwrite or auto-delete
- **No auto-cleanup**: Mention .old backup at end of successful migration, but don't offer to delete it
- **Rollback on failure**: Leave .old as-is if migration fails mid-way — user can manually recover

### Mode detection & routing
- **Standard repo + no dest arg** → in-place migration (rename to .old, hub ends up at original path)
- **Standard repo + dest arg** → migrate to new location (current behavior preserved)
- **Bare-hub detected** → validate mode (always)
- **No new flags**: Mode detection from args is sufficient — no --in-place or --validate flags needed

### Validation report format
- **Format**: Table with columns (consistent with migration preview style)
- **Status categories**: healthy / missing / stale per worktree
  - healthy: path exists, .git pointer valid
  - missing: path does not exist
  - stale: path exists but .git pointer points to wrong location
- **Summary**: Show counts at start (e.g., "3 healthy, 1 missing, 0 stale")
- **Actions**: Offer repair for missing/stale worktrees using existing Phase 4 repair flow

### Claude's Discretion
- Exact table column widths and alignment
- Wording of confirmation prompts
- Error message phrasing

</decisions>

<specifics>
## Specific Ideas

- "Rename the <name> to <name>.old (if that doesn't exist) and proceed in converting" — direct quote on in-place behavior
- Validation should feel like a health check, not just error reporting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `detect()`: Returns `RepoConfig` with `type: 'bare-hub'` for existing hubs — use to route to validate mode
- `listWorktrees()`: Enumerates all worktrees for any repo — use for validation report
- `findMissingWorktrees()`: Searches for worktrees whose paths don't exist — reuse for validation
- `repairWorktree()`: Fixes .git pointers — reuse when user accepts repair offer
- `prompt()`: Async stdin prompt helper — reuse for confirmations
- Color helpers (`green()`, `yellow()`, `bold()`): Consistent output formatting

### Established Patterns
- Table output with aligned columns (see migration preview in CLI)
- Batch confirmation before destructive operations
- Log callback pattern for library functions
- Section divider comments for logical CLI blocks

### Integration Points
- `cli.ts` main() function: Add routing logic after `detect()` call
- Existing resume flow: Template for in-place flow structure
- Existing repair flow: Template for validation + repair offer

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-cli-in-place*
*Context gathered: 2026-03-07*
