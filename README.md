# git-worktree-organize

Convert any git repository into a bare-hub worktree layout where every branch lives in its own directory. No more stashing, no more switching.

> **Use at your own risk.** This tool modifies your git repository structure. Always ensure you have a copy of important repositories before running it.

> **Opinionated layout.** This tool enforces a specific structure where every branch is a sibling directory under a single hub root. If you prefer a different worktree arrangement, this tool may not be for you. See [Why this layout?](#why-this-layout) for the rationale.

## The target layout

```
myrepo/
├── .bare/       ← bare git repo (the actual git database)
├── .git         ← plain file: "gitdir: ./.bare"
├── main/        ← worktree for the main branch
└── feature-x/   ← worktree for each other branch
```

Each branch directory is a fully functional working tree. Open them in separate terminals or IDE windows simultaneously.

The `.git` file at the hub root means `git worktree list` (and any git command) works from **anywhere** -- the hub root, any worktree directory, or even nested subdirectories. IDEs, linters, and other tools that walk up looking for `.git` also find the repo correctly.

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

| Argument      | Description                                                |
|---------------|------------------------------------------------------------|
| `source`      | Path to the existing git repository to migrate             |
| `destination` | Target hub directory (omit for in-place migration)         |

The tool shows a preview of what will be created and asks for confirmation before making any changes.

### In-place migration

When no destination is provided, the tool prompts to migrate in place:

1. Renames `<source>` to `<source>.old`
2. Creates the hub at the original `<source>` path

```sh
git-worktree-organize /projects/myrepo
```

Result:

```
/projects/myrepo/              ← new hub
├── .bare/
├── .git
├── main/
└── feature-x/

/projects/myrepo.old/          ← original repo (renamed)
```

The `.old` directory is kept so you can verify the migration before deleting it manually.

### Migration to a new location

When a destination is provided, the source repo is moved into the new hub as the main branch worktree:

```sh
git-worktree-organize /projects/myrepo /projects/myrepo-hub
```

Result:

```
/projects/myrepo-hub/
├── .bare/
├── .git
├── main/              ← original /projects/myrepo moved here
├── feature-x/
└── hotfix/
```

The original source directory becomes the `main/` worktree. No data is lost.

## Supported repository types

The tool detects and migrates five different git repository layouts:

| Type | Description |
|------|-------------|
| **Standard** | Ordinary repo with a `.git` directory |
| **Bare root** | Bare repo with git internals at the root (`HEAD`, `refs/`, `objects/`) |
| **Bare dotgit** | Repo where `.git` is a bare directory (`core.bare = true`) |
| **Bare external** | Repo where `.git` is a file pointing to a gitdir elsewhere |
| **Bare hub** | Already in the bare-hub layout (re-organizes worktrees into canonical structure) |

See [Layout conversions](#layout-conversions) for detailed before/after diagrams of each type.

## Recovery

Running the tool on an existing hub detects problems and offers to fix them:

- **Partial migrations** -- Resumes moving worktrees that weren't fully processed (e.g. after an interruption).
- **Stale `.git` pointers** -- Repairs worktrees with broken connections to the bare repo.
- **Missing worktrees** -- Searches for worktrees that were moved outside the hub (up to 3 directory levels deep).
- **Parent directory renames** -- Detects and repairs when a hub's parent directory was renamed.

```sh
# Resume a partial migration or repair an existing hub
git-worktree-organize /path/to/hub

# Repair after renaming a parent directory (can point to any worktree inside the hub)
git-worktree-organize /new/path/to/hub/some-worktree
```

## Safety

- **Interactive confirmation** -- Preview all changes before execution
- **Branch name sanitization** -- Slashes become hyphens (e.g. `feature/auth` becomes `feature-auth`)
- **Collision detection** -- Warns if sanitized names would conflict
- **AI agent documentation** -- Creates an `AGENTS.md` at the hub root for AI coding agents (never overwrites existing files)
- **Zero runtime dependencies** -- Only requires Node.js and git

## Why this layout?

Every branch as a sibling directory means you can work on multiple branches simultaneously. Run branch-specific builds side by side. No stashing, no context switching.

The `.git` file at the hub root is the key detail. Because it points to `.bare/`, git resolves the repository from any location in the tree:

```sh
# All of these work -- no -C flag or cd needed:
~/projects/myrepo $ git worktree list
~/projects/myrepo/main $ git worktree list
~/projects/myrepo/feature-x $ git worktree list
~/projects/myrepo/main/src/deep/nested $ git worktree list
```

IDEs, linters, pre-commit hooks, and AI coding agents all discover the repo automatically regardless of which worktree directory they're opened in.

## Requirements

- Node.js 18+
- Git 2.5+ (for worktree support)

## Development

```sh
git clone https://github.com/drmikecrowe/git-worktree-organize.git
cd git-worktree-organize
npm install

npm test              # Run tests
npm run build         # Build
node dist/cli.js /path/to/test/repo   # Test locally
```

## Layout conversions

Detailed before/after diagrams for each supported repository type.

### Standard repository

The most common case -- a normal repo with a `.git` directory and optionally some linked worktrees.

**Before:**
```
myrepo/
├── .git/              ← standard git directory
├── src/
└── package.json

myrepo-feature/        ← linked worktree (created by git worktree add)
├── .git               ← file pointing back to myrepo/.git/worktrees/feature
├── src/
└── package.json
```

**After:**
```
myrepo/
├── .bare/             ← bare git repo (contents of old .git/)
├── .git               ← file: "gitdir: ./.bare"
├── AGENTS.md
├── main/              ← main branch worktree (was myrepo/)
│   ├── src/
│   └── package.json
└── feature/           ← feature worktree (was myrepo-feature/)
    ├── .git           ← file pointing to .bare/worktrees/feature
    ├── src/
    └── package.json
```

### Bare root

A bare repository where git internals sit directly at the root. Often created by `git clone --bare` or `git init --bare`.

**Before:**
```
myrepo.git/
├── HEAD
├── config
├── objects/
└── refs/
```

**After:**
```
myrepo-hub/
├── .bare/             ← git internals moved here
│   ├── HEAD
│   ├── config
│   ├── objects/
│   └── refs/
├── .git               ← file: "gitdir: ./.bare"
└── AGENTS.md
```

No worktrees are created since a bare repo has no checked-out branches. Use `git worktree add <branch>` from the hub to start working.

### Bare dotgit

A repository where `.git` is a directory but `core.bare = true`.

**Before:**
```
myrepo/
└── .git/              ← directory, but core.bare = true
    ├── HEAD
    ├── config         ← contains core.bare = true
    ├── objects/
    └── refs/
```

**After:**
```
myrepo-hub/
├── .bare/             ← contents of old .git/
├── .git               ← file: "gitdir: ./.bare"
└── AGENTS.md
```

### Bare external

A repository where `.git` is a file pointing to a gitdir stored elsewhere on the filesystem.

**Before:**
```
myrepo/
├── .git               ← file: "gitdir: /somewhere/else/myrepo.git"
├── src/
└── package.json

/somewhere/else/myrepo.git/
├── HEAD
├── objects/
└── refs/
```

**After:**
```
myrepo-hub/
├── .bare/             ← copy of /somewhere/else/myrepo.git/
├── .git               ← file: "gitdir: ./.bare"
└── AGENTS.md
```

### Bare hub (re-organize)

Already in the bare-hub layout but with worktrees scattered in non-standard locations.

**Before:**
```
myrepo/
├── .bare/
├── .git               ← file: "gitdir: ./.bare"
└── main/

/other/path/feature/   ← worktree outside the hub
└── .git
```

**After:**
```
myrepo/
├── .bare/
├── .git               ← file: "gitdir: ./.bare"
├── AGENTS.md
├── main/
└── feature/           ← moved into the hub
    └── .git           ← repaired to point to .bare/worktrees/feature
```

## License

MIT -- see [github.com/drmikecrowe/git-worktree-organize](https://github.com/drmikecrowe/git-worktree-organize).
