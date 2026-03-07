# git-worktree-organize

Convert any git repository into the canonical bare-hub worktree layout, so every branch lives in its own directory and you never need to stash or switch again.

## What it does

Takes an existing git repo (any type) and migrates it into this structure:

```
<dest>/
├── .bare/       ← bare git repo (the actual git database)
├── .git         ← plain file: "gitdir: ./.bare"
├── main/        ← worktree for the main branch
└── feature-x/  ← worktree for each other branch
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
| `destination` | Target hub directory (default: `<parent>/<repo-name>-bare`)      |

The tool shows a preview of what will be created and asks for confirmation before making any changes.

## Example

Given a repo at `/projects/myrepo` with branches `main`, `feature-x`, and `hotfix`:

```sh
git-worktree-organize /projects/myrepo /projects/myrepo-bare
```

Result:

```
/projects/myrepo-bare/
├── .bare/
├── .git
├── main/
├── feature-x/
└── hotfix/
```

The original `/projects/myrepo` is moved to `/projects/myrepo-bare/main/`. No data is lost.

## Features

- **Migrate existing repos** — Convert any git repository type to the bare-hub layout
- **Fix worktree locations** — Resume interrupted migrations or fix worktrees that moved
- **Handle parent directory renames** — Automatically detect and fix stale worktree paths when parent directories are renamed
- **Convert to .bare layout** — Transform standard checkouts into the canonical bare-hub structure
- **Worktree recovery** — Find and repair worktrees at unexpected locations

## Recovery and Resume

If a migration was interrupted or worktrees have moved, running the tool on the hub directory will:

1. Detect worktrees at incorrect locations
2. Move them to the correct location within the hub
3. Repair `.git` pointer files
4. Fix stale git administrative data

This handles common scenarios:
- Renaming the parent directory of a hub
- Partial migrations that failed midway
- Worktrees that were manually moved

## Supported repo types

- **Standard repos** — ordinary repos with a `.git` directory
- **Bare-root** — bare repo with git internals at the root (`HEAD`, `refs/`, `objects/`)
- **Bare-dotgit** — repo where `.git` is a bare git directory (`core.bare = true`)
- **Bare-external** — repo where `.git` is a file pointing to a gitdir elsewhere
- **Bare-hub** — already in the bare-hub layout (re-organizes worktrees into the canonical structure)

Branch names with slashes (e.g. `feature/auth`) are mapped to hyphenated directory names (`feature-auth`).

## Why this layout

Having every branch as a sibling directory means you can work on multiple branches simultaneously without stashing or switching. It is also easier to run branch-specific build artifacts side by side, and the `.git` file at the hub root ensures IDE and tooling compatibility without any special configuration.

## License

MIT — see [github.com/drmikecrowe/git-worktree-organize](https://github.com/drmikecrowe/git-worktree-organize).
