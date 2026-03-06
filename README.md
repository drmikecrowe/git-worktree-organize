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
