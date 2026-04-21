import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { run } from './run.ts'
import type { RepoConfig } from './detect.ts'
import { listWorktrees } from './worktrees.ts'
import { setGitConfig } from './git.ts'
import { move } from './fs.ts'

/**
 * Template content for AGENTS.md, documenting the hub-and-worktree layout
 * for AI coding agents working in the repository.
 */
const AGENTS_MD_TEMPLATE = `# Git Worktree Layout

This repository uses **git worktrees** with a bare repository pattern for parallel development across multiple branches.

## Directory Structure

\`\`\`
<project>/                        # Root project directory
├── .bare/                        # Bare git repository (shared git data)
│   ├── worktrees/               # Worktree metadata
│   │   ├── main/                # Main branch metadata
│   │   └── <branch-name>/       # Per-branch worktree metadata
│   ├── objects/                 # Git objects (shared)
│   ├── refs/                    # Git refs (shared)
│   └── config                   # Repository config
├── .git                         # Points to .bare (gitdir: ./.bare)
├── main/                        # Main branch worktree (primary)
├── <branch-name>/               # Feature/fix branch worktrees
└── *.code-workspace             # VS Code multi-root workspace
\`\`\`

## How It Works

- **Bare Repository**: \`.bare/\` contains all git data (objects, refs, config)
- **Worktrees**: Each branch checkout is a separate directory at the root level
- **Shared History**: All worktrees share the same git history from \`.bare/\`

## Working with Worktrees

### Create a new worktree

\`\`\`bash
# From any worktree or the root
git worktree add <branch-name>

# Create new branch and worktree
git worktree add -b <new-branch> <directory-name>
\`\`\`

### List worktrees

\`\`\`bash
git worktree list
\`\`\`

### Remove a worktree

\`\`\`bash
# After merging/deleting the branch
git worktree remove <branch-name>

# Force removal (if untracked files exist)
git worktree remove --force <branch-name>
\`\`\`

### Prune stale worktree references

\`\`\`bash
git worktree prune
\`\`\`

## Conventions

1. **Naming**: Worktree directories match the branch name (e.g., \`feature-auth\`, \`fix-login-bug\`)
2. **Main worktree**: \`main/\` is the primary worktree for the main branch
3. **Workspace file**: Open \`*.code-workspace\` in VS Code to work with multiple worktrees

## Tips

- Each worktree has its own \`.git\` file pointing back to \`.bare/\`
- You can run different branches simultaneously without stashing
- IDEs can open multiple worktrees as separate folders in one workspace
- Run \`git worktree prune\` periodically to clean up deleted worktree references
`

/**
 * Write AGENTS.md to the hub root if it doesn't already exist.
 * Skips creation if any worktree already contains an AGENTS.md
 * (to avoid overwriting user-maintained docs).
 */
export function writeAgentsMd(dest: string): void {
  const agentsPath = join(dest, 'AGENTS.md')
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, AGENTS_MD_TEMPLATE)
  }
}

/**
 * Returns true if .bare/config has [extensions] worktreeConfig = true.
 * When enabled, each worktree admin dir needs a config.worktree file with
 * core.bare = false to override the shared core.bare = true setting.
 */
function worktreeConfigEnabled(bareDir: string): boolean {
  const configFile = join(bareDir, 'config')
  if (!existsSync(configFile)) return false
  const content = readFileSync(configFile, 'utf8')
  const extensionsMatch = content.match(/\[extensions\]([\s\S]*?)(?=\[|$)/i)
  if (!extensionsMatch) return false
  return /worktreeconfig\s*=\s*true/i.test(extensionsMatch[1])
}

const WORKTREE_CONFIG_CONTENT = '[core]\n\tbare = false\n'

/**
 * If extensions.worktreeConfig is enabled, write config.worktree to adminDir
 * with core.bare = false so git operations work inside the worktree.
 * Safe to call unconditionally — skips if worktreeConfig is not enabled.
 */
export function ensureWorktreeConfig(adminDir: string, bareDir: string, log?: (msg: string) => void): void {
  if (!worktreeConfigEnabled(bareDir)) return
  const configWtFile = join(adminDir, 'config.worktree')
  if (!existsSync(configWtFile) || readFileSync(configWtFile, 'utf8') !== WORKTREE_CONFIG_CONTENT) {
    log?.(`Writing config.worktree for [${basename(adminDir)}]`)
    writeFileSync(configWtFile, WORKTREE_CONFIG_CONTENT)
  }
}

export interface MigrateOptions {
  source: string
  dest: string
}

/**
 * Check if a worktree path is a Claude agent worktree (.claude/worktrees/agent-*).
 */
export function isAgentWorktree(wtPath: string): boolean {
  const normalized = wtPath.replace(/\\/g, '/')
  return /\/\.claude\/worktrees\/agent-[^/]+\/?$/.test(normalized)
}

/**
 * Fix git references for an agent worktree that stayed inside the main worktree.
 * Unlike processLinkedWorktree, this does NOT move the worktree — it only updates
 * .git file and admin dir to point to the new bare repo.
 */
export function fixupAgentWorktree(
  wt: { path: string; head: string; branch: string | null; isBare: boolean },
  source: string,
  mainDest: string,
  destBare: string,
  warn?: (msg: string) => void,
): void {
  // Compute new path: agent worktree moved with main worktree
  const normalized = wt.path.replace(/\\/g, '/')
  const sourceNorm = source.replace(/\\/g, '/')
  let relativePath: string
  if (normalized.startsWith(sourceNorm + '/')) {
    relativePath = normalized.slice(sourceNorm.length + 1)
  } else {
    // Stale path (e.g. migrateInPlace renamed source) — extract .claude/... suffix
    const idx = normalized.indexOf('/.claude/worktrees/')
    if (idx === -1) {
      warn?.(`Cannot determine new path for agent worktree ${wt.path}`)
      return
    }
    relativePath = normalized.slice(idx + 1)
  }

  const newPath = join(mainDest, relativePath)
  if (!existsSync(newPath)) {
    warn?.(`Agent worktree not found at ${newPath}, skipping`)
    return
  }

  const gitFile = join(newPath, '.git')
  if (!existsSync(gitFile)) {
    warn?.(`No .git file in agent worktree ${newPath}`)
    return
  }

  const gitFileContent = readFileSync(gitFile, 'utf8')
  const match = gitFileContent.match(/^gitdir:\s*(.+)/m)
  if (!match) {
    warn?.(`Could not parse .git file in ${newPath}`)
    return
  }

  const adminName = basename(match[1].trim())
  const newAdmin = join(destBare, 'worktrees', adminName)

  writeFileSync(gitFile, `gitdir: ${newAdmin}\n`)

  if (existsSync(newAdmin)) {
    writeFileSync(join(newAdmin, 'gitdir'), newPath + '/.git\n')
    writeFileSync(join(newAdmin, 'commondir'), '../../\n')
    ensureWorktreeConfig(newAdmin, destBare)
  } else {
    warn?.(`Admin dir ${newAdmin} does not exist for agent worktree ${newPath}`)
  }
}

/**
 * Sanitize a branch name for use as a directory name (replace / with -).
 */
export function sanitizeBranch(branch: string): string {
  return branch.replace(/\//g, '-')
}

/**
 * If `worktreePath` doesn't exist but was registered when the parent directory
 * had a different name (e.g. "expense" renamed to "expense.old"), try to find
 * the actual path by substituting the `dest` prefix with `sourceParent`.
 */
export function resolveWorktreePath(
  worktreePath: string,
  dest: string,
  sourceParent: string,
): string {
  if (existsSync(worktreePath)) return worktreePath
  if (worktreePath.startsWith(dest + '/')) {
    const remapped = sourceParent + worktreePath.slice(dest.length)
    if (existsSync(remapped)) return remapped
  }
  return worktreePath
}

/**
 * Returns true if dest looks like a partially-completed migration
 * (.bare/ and .git file both exist).
 */
export function isPartialMigration(dest: string): boolean {
  const gitFile = join(dest, '.git')
  return (
    existsSync(join(dest, '.bare')) &&
    existsSync(gitFile) &&
    statSync(gitFile).isFile()
  )
}

/**
 * Walk upward from `startPath` to find an ancestor hub directory
 * (.bare/ + .git file). Returns the hub path or null if not found.
 * Useful when the caller provides a worktree path with a broken .git file
 * rather than the hub root itself.
 */
export function findHub(startPath: string): string | null {
  let current = resolve(startPath)
  while (true) {
    if (isPartialMigration(current)) return current
    const parent = dirname(current)
    if (parent === current) return null   // reached filesystem root
    current = parent
  }
}

/**
 * Filesystem-based repair pass: scan dest/.bare/worktrees/ admin dirs and for
 * each one that points to a worktree inside dest/, check whether the worktree's
 * .git file points back to the correct admin dir. Fix it if not.
 *
 * This catches worktrees that are at their expected location (dest/<branch>)
 * but whose .git files were never updated (e.g. admin gitdir was repaired via
 * `git worktree repair` but the reverse pointer in .git was not).
 *
 * Note: admin dirs are named from the original worktree path, not the branch
 * name, so we scan admin dirs (whose gitdir we trust) rather than by name.
 */
export async function repairHub(dest: string, log: (msg: string) => void = console.log): Promise<void> {
  const adminBase = join(dest, '.bare', 'worktrees')
  if (!existsSync(adminBase)) return

  for (const adminName of readdirSync(adminBase)) {
    const adminDir = join(adminBase, adminName)
    if (!statSync(adminDir).isDirectory()) continue
    const gitdirFile = join(adminDir, 'gitdir')
    if (!existsSync(gitdirFile)) continue

    // adminDir/gitdir contains the path to the worktree's .git file
    const registeredGitFile = readFileSync(gitdirFile, 'utf8').trim()
    const worktreePath = dirname(registeredGitFile)

    // Only repair worktrees that are (or should be) inside dest/
    if (!worktreePath.startsWith(dest + '/')) continue
    if (!existsSync(registeredGitFile) || !statSync(registeredGitFile).isFile()) continue

    // Fix commondir if it's wrong — must always be '../../' (relative to .bare/worktrees/<name>/)
    const commondirFile = join(adminDir, 'commondir')
    const expectedCommondir = '../../\n'
    if (!existsSync(commondirFile) || readFileSync(commondirFile, 'utf8') !== expectedCommondir) {
      log(`Repairing commondir for [${basename(worktreePath)}]`)
      writeFileSync(commondirFile, expectedCommondir)
    }

    // If worktreeConfig is enabled, ensure config.worktree has core.bare = false
    ensureWorktreeConfig(adminDir, join(dest, '.bare'), log)

    const content = readFileSync(registeredGitFile, 'utf8')
    const match = content.match(/^gitdir:\s*(.+)/m)
    if (!match) continue
    if (match[1].trim() === adminDir) continue   // already correct

    log(`Repairing .git for [${basename(worktreePath)}]`)
    writeFileSync(registeredGitFile, `gitdir: ${adminDir}\n`)
  }
}

/**
 * Resume a partial migration: find worktrees registered in the hub that are
 * not yet at their expected location (dest/<branch>) and move/repair them.
 * Also handles worktrees that are already at the correct location but whose
 * .git files point to stale paths (e.g. after a parent-dir rename).
 * Returns the hub path.
 */
export async function resumeMigrate(dest: string, log: (msg: string) => void = console.log, warn?: (msg: string) => void): Promise<string> {
  const destBare = join(dest, '.bare')
  const hubWorktrees = await listWorktrees(dest)

  // A worktree is pending if it's not already at its exact expected location.
  // This catches both worktrees outside dest/ AND worktrees inside dest/ but
  // at the wrong sub-path (e.g. dest/main-bare/feature instead of dest/feature).
  const pending = hubWorktrees.filter(wt => {
    if (wt.isBare) return false
    if (isAgentWorktree(wt.path)) return false
    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    return wt.path !== join(dest, sanitizeBranch(branch))
  })

  if (pending.length === 0) {
    log('Nothing to resume — all worktrees are already in place.')
  } else {
    for (const wt of pending) {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      const expectedPath = join(dest, sanitizeBranch(branch))

      let wtPath = wt.path
      if (!existsSync(wtPath)) {
        // Registered path is stale (e.g. parent dir was renamed). Check if the
        // worktree is already at its expected destination — it may have been
        // moved there by a directory rename without git knowing about it.
        if (existsSync(expectedPath)) {
          wtPath = expectedPath
        } else {
          log(`warn: Skipping [${branch}] — path no longer exists: ${wt.path}`)
          continue
        }
      }

      log(`Moving [${branch}] → ${expectedPath}`)
      await processLinkedWorktree({ ...wt, path: wtPath }, dest, destBare, log, warn)
    }
  }

  // Always run repair pass: fixes stale .git files for worktrees that are
  // already at their expected location (e.g. manually placed by the user, or
  // cases where admin gitdir was updated but worktree .git was not).
  await repairHub(dest, log)

  return dest
}

/**
 * Migrate a standard repository in-place.
 * Renames source to source.old, then creates the hub at the original source path.
 * The backup at source.old is preserved.
 * Returns the path to the created hub directory.
 */
export async function migrateInPlace(
  source: string,
  log: (msg: string) => void = console.log,
  warn?: (msg: string) => void,
): Promise<string> {
  const resolvedSource = resolve(source)
  const oldPath = resolvedSource + '.old'

  // Check if .old already exists
  if (existsSync(oldPath)) {
    throw new Error(`'${oldPath}' already exists. Remove it and try again.`)
  }

  log(`Renaming ${bold(resolvedSource)} to ${bold(oldPath)}`)

  // Rename source to .old
  await move(resolvedSource, oldPath)

  // Read worktrees from the backup location
  const allWorktrees = await listWorktrees(oldPath)
  const worktrees = allWorktrees.filter(wt => !wt.isBare)

  if (worktrees.length === 0) {
    throw new Error('No worktrees found in source repository')
  }

  // Collision check on sanitized names
  const seen = new Map<string, string>()
  for (const wt of worktrees) {
    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    const safe = sanitizeBranch(branch)
    if (seen.has(safe)) {
      throw new Error(`branch name collision: '${seen.get(safe)}' and '${branch}' both map to '${safe}'`)
    }
    seen.set(safe, branch)
  }

  // The main branch is the first worktree
  const mainBranch = worktrees[0].branch!
  const mainSafe = sanitizeBranch(mainBranch)

  // Create hub directory structure
  const destBare = join(resolvedSource, '.bare')
  const mainDest = join(resolvedSource, mainSafe)

  // Step 1: mkdir -p dest/.bare
  mkdirSync(destBare, { recursive: true })

  // Step 2: Copy git database: cp -a <oldPath>/.git/* dest/.bare/
  // Note: We copy the contents (not the .git dir itself) into .bare
  const gitDir = join(oldPath, '.git')
  for (const entry of readdirSync(gitDir)) {
    const srcPath = join(gitDir, entry)
    const destPath = join(destBare, entry)
    if (statSync(srcPath).isDirectory()) {
      run('cp', ['-a', srcPath + '/.', destPath + '/'])
    } else {
      run('cp', ['-a', srcPath, destPath])
    }
  }

  // Step 3: Set core.bare = true
  await setGitConfig('core.bare', 'true', { gitdir: destBare })

  // Step 4: Set remote.origin.fetch
  await setGitConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*', { gitdir: destBare })

  // Step 5: Write dest/.git file
  writeFileSync(join(resolvedSource, '.git'), 'gitdir: ./.bare\n')

  // Step 6: Read HEAD content from dest/.bare/HEAD
  const mainHeadContent = readFileSync(join(destBare, 'HEAD'), 'utf8')

  // Step 7: Copy the backup to main worktree location (not move!)
  // We copy because we want to preserve the backup
  log(`Creating main worktree at ${bold(mainDest)}`)
  run('cp', ['-a', oldPath + '/.', mainDest + '/'])

  // Step 8: Create dest/.bare/worktrees/mainSafe/ dir
  const mainAdminDir = join(destBare, 'worktrees', mainSafe)
  mkdirSync(mainAdminDir, { recursive: true })

  // Step 9: Write gitdir, commondir, HEAD, and config.worktree if needed
  writeFileSync(join(mainAdminDir, 'gitdir'), mainDest + '/.git\n')
  writeFileSync(join(mainAdminDir, 'commondir'), '../../\n')
  ensureWorktreeConfig(mainAdminDir, destBare)
  const headToWrite = mainHeadContent.endsWith('\n') ? mainHeadContent : mainHeadContent + '\n'
  writeFileSync(join(mainAdminDir, 'HEAD'), headToWrite)

  // Step 10: Move index if it exists
  const bareIndex = join(destBare, 'index')
  if (existsSync(bareIndex)) {
    renameSync(bareIndex, join(mainAdminDir, 'index'))
  }

  // Step 11: Remove the .git directory from mainDest (it's now in the admin dir)
  run('rm', ['-rf', join(mainDest, '.git')])

  // Step 12: Write mainDest/.git
  writeFileSync(join(mainDest, '.git'), `gitdir: ${mainAdminDir}\n`)

  // Step 13: Process linked worktrees starting at index 1
  for (let i = 1; i < worktrees.length; i++) {
    const wt = worktrees[i]
    if (isAgentWorktree(wt.path)) {
      fixupAgentWorktree(wt, resolvedSource, mainDest, destBare, warn)
    } else {
      await processLinkedWorktree(wt, resolvedSource, destBare, log, warn)
    }
  }

  log(`Original repo backed up at: ${oldPath}`)

  writeAgentsMd(resolvedSource)

  return resolvedSource
}

// Helper for bold text (needed for migrateInPlace log message)
function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`
}

/**
 * Orchestrate the full migration of a git repo into the bare-hub layout.
 * Returns the path to the created hub directory.
 */
export async function migrate(config: RepoConfig, options: MigrateOptions, log?: (msg: string) => void, warn?: (msg: string) => void): Promise<string> {
  const source = resolve(options.source)
  const dest = options.dest
    ? resolve(options.dest)
    : join(dirname(source), basename(source) + '-bare')

  // Check dest/.bare doesn't already exist
  const destBare = join(dest, '.bare')
  if (existsSync(destBare)) {
    throw new Error(`'${destBare}' already exists`)
  }

  // Step 1: Read worktrees, filter out bare entries
  const allWorktrees = await listWorktrees(source)
  const worktrees = allWorktrees.filter(wt => !wt.isBare)

  // Step 2: Collision check on sanitized names
  const seen = new Map<string, string>()
  for (const wt of worktrees) {
    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    const safe = sanitizeBranch(branch)
    if (seen.has(safe)) {
      throw new Error(`branch name collision: '${seen.get(safe)}' and '${branch}' both map to '${safe}'`)
    }
    seen.set(safe, branch)
  }

  // Step 3: mkdir -p dest/.bare
  mkdirSync(destBare, { recursive: true })

  // Step 4: Copy git database: cp -a <source_gitdir>/. dest/.bare/
  run('cp', ['-a', config.gitdir + '/.', destBare + '/'])

  // Step 5: Set core.bare = true
  await setGitConfig('core.bare', 'true', { gitdir: destBare })

  // Step 6: Set remote.origin.fetch
  await setGitConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*', { gitdir: destBare })

  // Step 7: Write dest/.git file
  writeFileSync(join(dest, '.git'), 'gitdir: ./.bare\n')

  // Remap any linked worktree paths that are stale because the source's parent
  // directory was renamed (the paths in git still reference the old name which
  // happens to match dest). Main worktree (index 0) uses `source` directly.
  const sourceParent = dirname(source)
  const worktreesResolved = worktrees.map((wt, i) =>
    i === 0 && config.type === 'standard'
      ? wt
      : { ...wt, path: resolveWorktreePath(wt.path, dest, sourceParent) },
  )

  // Step 8: If standard, handle main worktree
  if (config.type === 'standard') {
    const mainBranch = worktrees[0].branch!
    const mainSafe = sanitizeBranch(mainBranch)
    const mainDest = join(dest, mainSafe)

    // Read HEAD content from dest/.bare/HEAD
    const mainHeadContent = readFileSync(join(destBare, 'HEAD'), 'utf8')

    // Remove source/.git directory
    run('rm', ['-rf', join(source, '.git')])

    // Move source dir → mainDest
    await move(source, mainDest)

    // Create dest/.bare/worktrees/mainSafe/ dir
    const mainAdminDir = join(destBare, 'worktrees', mainSafe)
    mkdirSync(mainAdminDir, { recursive: true })

    // Write gitdir, commondir, HEAD, and config.worktree if needed
    writeFileSync(join(mainAdminDir, 'gitdir'), mainDest + '/.git\n')
    writeFileSync(join(mainAdminDir, 'commondir'), '../../\n')
    ensureWorktreeConfig(mainAdminDir, destBare)
    const headToWrite = mainHeadContent.endsWith('\n') ? mainHeadContent : mainHeadContent + '\n'
    writeFileSync(join(mainAdminDir, 'HEAD'), headToWrite)

    // Move index if it exists
    const bareIndex = join(destBare, 'index')
    if (existsSync(bareIndex)) {
      renameSync(bareIndex, join(mainAdminDir, 'index'))
    }

    // Write mainDest/.git
    writeFileSync(join(mainDest, '.git'), `gitdir: ${mainAdminDir}\n`)

    // Process linked worktrees starting at index 1
    for (let i = 1; i < worktreesResolved.length; i++) {
      const wt = worktreesResolved[i]
      if (isAgentWorktree(wt.path)) {
        fixupAgentWorktree(wt, source, mainDest, destBare, warn)
      } else {
        await processLinkedWorktree(wt, dest, destBare, log, warn)
      }
    }
  } else {
    // Step 9: Not standard — process all linked worktrees starting at index 0
    for (const wt of worktreesResolved) {
      if (isAgentWorktree(wt.path)) {
        fixupAgentWorktree(wt, source, join(dest, sanitizeBranch(wt.branch ?? `detached-${wt.head.slice(0, 8)}`)), destBare, warn)
      } else {
        await processLinkedWorktree(wt, dest, destBare, log, warn)
      }
    }
  }

  writeAgentsMd(dest)

  return dest
}

async function processLinkedWorktree(
  wt: { path: string; head: string; branch: string | null; isBare: boolean },
  dest: string,
  destBare: string,
  log?: (msg: string) => void,
  warn?: (msg: string) => void,
): Promise<void> {
  const wtSrc = wt.path
  const wtBranch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
  const wtSafe = sanitizeBranch(wtBranch)
  const wtDest = join(dest, wtSafe)

  // Move wtSrc → wtDest
  await move(wtSrc, wtDest)

  // Read wtDest/.git file, parse gitdir: <oldPath>
  const gitFileContent = readFileSync(join(wtDest, '.git'), 'utf8')
  const match = gitFileContent.match(/^gitdir:\s*(.+)/m)
  if (!match) {
    warn?.(`Could not parse .git file in ${wtDest}`)
    return
  }
  const oldPath = match[1].trim()
  const adminName = basename(oldPath)
  const newAdmin = join(destBare, 'worktrees', adminName)

  // Write wtDest/.git pointing to new admin dir
  writeFileSync(join(wtDest, '.git'), `gitdir: ${newAdmin}\n`)

  // Update admin dir's gitdir, commondir, and config.worktree
  if (existsSync(newAdmin)) {
    writeFileSync(join(newAdmin, 'gitdir'), wtDest + '/.git\n')
    writeFileSync(join(newAdmin, 'commondir'), '../../\n')
    ensureWorktreeConfig(newAdmin, destBare)
  } else {
    warn?.(`Admin dir ${newAdmin} does not exist for worktree ${wtDest}`)
  }
}
