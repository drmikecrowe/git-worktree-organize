# git-worktree-organize

> ⚠️ **Use at your own risk.** This tool works for me and passes all tested scenarios, but it modifies your git repository structure. **Make a full backup first** before running on any repository you care about.

Convert any git repository into the canonical bare-hub worktree layout, so every branch lives in its own directory and you never need to stash or switch again.

## What it does

Takes an existing git repo (any type) and migrates it into this structure:

```
<dest>/
├── .bare/       ← bare git repo (the actual git database)
├── .git         ← plain file: "gitdir: ./.bare"
├── main/        ← worktree for the main branch
└── feature-x/   ← worktree for each other branch
```

Each branch directory is a fully functional working tree. Open them in separate terminals or IDE windows simultaneously — no stashing, no switching.

The `.git` file at the hub root makes tools that walk up looking for `.git` (IDEs, linters, etc.) find the repo correctly.

## Installation

**Zero-install (npx):**
```sh
npx git-worktree-organize <source> [destination]
```

**Global install:**
```sh
npm install -g git-worktree-organize
git-worktree-organize <source> [destination]
```

## Usage

```
git-worktree-organize <source> [destination]
```

| Argument      | Description                                                      |
|---------------|------------------------------------------------------------------|
| `source`      | Path to the existing git repository to migrate                   |
| `destination` | Target hub directory (omit for in-place migration prompt)        |

**Without a destination**, the tool prompts for in-place migration:
- Renames `<source>` to `<source>.old`
- Creates the hub at the original `<source>` path

**With a destination**, the tool migrates to the specified path.

The tool shows a preview of what will be created and asks for confirmation before making any changes.

## Examples

### In-place migration (recommended)

```sh
git-worktree-organize /projects/myrepo
```

Prompts to reorganize in place, resulting in:

```
/projects/myrepo/          ← hub (was renamed from myrepo.old)
├── .bare/
├── .git
├── main/
└── feature-x/

/projects/myrepo.old/      ← backup of original
```

### Migrate to new location

```sh
git-worktree-organize /projects/myrepo /projects/myrepo-organized
```

Result:

```
/projects/myrepo-organized/
├── .bare/
├── .git
├── main/          ← original /projects/myrepo moved here
├── feature-x/
└── hotfix/
```

The original `/projects/myrepo` becomes the `main/` worktree. No data is lost.

## Features

### Repository Migration

Convert any git repository type to the bare-hub layout:

- **Standard repos** — ordinary repos with a `.git` directory
- **Bare-root** — bare repo with git internals at the root (`HEAD`, `refs/`, `objects/`)
- **Bare-dotgit** — repo where `.git` is a bare git directory (`core.bare = true`)
- **Bare-external** — repo where `.git` is a file pointing to a gitdir elsewhere
- **Bare-hub** — already in the bare-hub layout (re-organizes worktrees into the canonical structure)

### Resume & Recovery

If a migration was interrupted or worktrees have moved, running the tool on the hub directory will:

1. **Resume partial migrations** — Continue moving worktrees that weren't fully processed
2. **Repair stale `.git` pointers** — Fix worktrees with broken connections to the bare repo
3. **Search for missing worktrees** — Find worktrees that were moved outside the hub (searches up to 3 directory levels deep)
4. **Fix parent directory renames** — Automatically detect and repair when a hub's parent directory was renamed

### Safety Features

- **Interactive confirmation** — Preview all changes before execution
- **Branch name sanitization** — Names with slashes (e.g. `feature/auth`) become hyphenated directories (`feature-auth`)
- **Collision detection** — Warns if sanitized names would conflict
- **Zero runtime dependencies** — Only requires Node.js and git

## Recovery Scenarios

### Partial Migration

If migration was interrupted:

```sh
git-worktree-organize /path/to/hub
```

The tool detects the partial state, shows which worktrees still need to be moved, and offers to resume.

### Moved Worktrees

If worktrees were manually moved outside the hub:

```sh
git-worktree-organize /path/to/hub
```

The tool searches for missing worktrees by branch name and offers to repair their `.git` pointers.

### Parent Directory Rename

If you renamed a parent directory, worktree `.git` files will have stale paths. Run the tool on any worktree path inside the hub:

```sh
git-worktree-organize /new/path/to/hub/some-worktree
```

The tool detects the hub, navigates to it, and repairs all worktree connections.

## Why this layout

Having every branch as a sibling directory means you can work on multiple branches simultaneously without stashing or switching. It is also easier to run branch-specific build artifacts side by side, and the `.git` file at the hub root ensures IDE and tooling compatibility without any special configuration.

## Requirements

- Node.js 18+
- Git 2.5+ (for worktree support)

## Development

```sh
# Clone and install
git clone https://github.com/drmikecrowe/git-worktree-organize.git
cd git-worktree-organize
npm install

# Run tests
npm test

# Build
npm run build

# Test locally
node dist/cli.js /path/to/test/repo
```

## License

MIT — see [github.com/drmikecrowe/git-worktree-organize](https://github.com/drmikecrowe/git-worktree-organize).
