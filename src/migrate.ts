import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { run } from './run.ts'
import type { RepoConfig } from './detect.ts'
import { listWorktrees } from './worktrees.ts'
import { setGitConfig } from './git.ts'

/**
 * Move src to dest. Uses rename if on same filesystem, cp+rm otherwise.
 * Unlike fs.ts move(), this handles the case where dest does not yet exist
 * by statting the parent of dest for the filesystem check.
 */
async function moveDir(src: string, dest: string): Promise<void> {
  const destForStat = existsSync(dest) ? dest : dirname(dest)
  if (statSync(src).dev === statSync(destForStat).dev) {
    renameSync(src, dest)
  } else {
    run('cp', ['-a', src, dest])
    run('rm', ['-rf', src])
  }
}

export interface MigrateOptions {
  source: string
  dest: string
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
export async function resumeMigrate(dest: string, log: (msg: string) => void = console.log): Promise<string> {
  const destBare = join(dest, '.bare')
  const hubWorktrees = await listWorktrees(dest)

  // A worktree is pending if it's not already at its exact expected location.
  // This catches both worktrees outside dest/ AND worktrees inside dest/ but
  // at the wrong sub-path (e.g. dest/main-bare/feature instead of dest/feature).
  const pending = hubWorktrees.filter(wt => {
    if (wt.isBare) return false
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
      await processLinkedWorktree({ ...wt, path: wtPath }, dest, destBare)
    }
  }

  // Always run repair pass: fixes stale .git files for worktrees that are
  // already at their expected location (e.g. manually placed by the user, or
  // cases where admin gitdir was updated but worktree .git was not).
  await repairHub(dest, log)

  return dest
}

/**
 * Orchestrate the full migration of a git repo into the bare-hub layout.
 * Returns the path to the created hub directory.
 */
export async function migrate(config: RepoConfig, options: MigrateOptions): Promise<string> {
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
    await moveDir(source, mainDest)

    // Create dest/.bare/worktrees/mainSafe/ dir
    const mainAdminDir = join(destBare, 'worktrees', mainSafe)
    mkdirSync(mainAdminDir, { recursive: true })

    // Write gitdir, commondir, HEAD
    writeFileSync(join(mainAdminDir, 'gitdir'), mainDest + '/.git\n')
    writeFileSync(join(mainAdminDir, 'commondir'), '../../\n')
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
      await processLinkedWorktree(worktreesResolved[i], dest, destBare)
    }
  } else {
    // Step 9: Not standard — process all linked worktrees starting at index 0
    for (const wt of worktreesResolved) {
      await processLinkedWorktree(wt, dest, destBare)
    }
  }

  return dest
}

async function processLinkedWorktree(
  wt: { path: string; head: string; branch: string | null; isBare: boolean },
  dest: string,
  destBare: string,
): Promise<void> {
  const wtSrc = wt.path
  const wtBranch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
  const wtSafe = sanitizeBranch(wtBranch)
  const wtDest = join(dest, wtSafe)

  // Move wtSrc → wtDest
  await moveDir(wtSrc, wtDest)

  // Read wtDest/.git file, parse gitdir: <oldPath>
  const gitFileContent = readFileSync(join(wtDest, '.git'), 'utf8')
  const match = gitFileContent.match(/^gitdir:\s*(.+)/m)
  if (!match) {
    console.warn(`Could not parse .git file in ${wtDest}`)
    return
  }
  const oldPath = match[1].trim()
  const adminName = basename(oldPath)
  const newAdmin = join(destBare, 'worktrees', adminName)

  // Write wtDest/.git pointing to new admin dir
  writeFileSync(join(wtDest, '.git'), `gitdir: ${newAdmin}\n`)

  // Update admin dir's gitdir if it exists
  if (existsSync(newAdmin)) {
    writeFileSync(join(newAdmin, 'gitdir'), wtDest + '/.git\n')
  } else {
    console.warn(`Admin dir ${newAdmin} does not exist for worktree ${wtDest}`)
  }
}
