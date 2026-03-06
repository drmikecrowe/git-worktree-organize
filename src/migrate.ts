import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync, statSync } from 'node:fs'
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
 * Resume a partial migration: find worktrees registered in the hub whose
 * paths are still outside dest/ and move them into place.
 * Returns the hub path.
 */
export async function resumeMigrate(dest: string, log: (msg: string) => void = console.log): Promise<string> {
  const destBare = join(dest, '.bare')
  const hubWorktrees = await listWorktrees(dest)
  const pending = hubWorktrees.filter(wt => !wt.isBare && !wt.path.startsWith(dest + '/'))

  if (pending.length === 0) {
    log('Nothing to resume — all worktrees are already in place.')
    return dest
  }

  for (const wt of pending) {
    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    if (!existsSync(wt.path)) {
      log(`warn: Skipping [${branch}] — path no longer exists: ${wt.path}`)
      continue
    }
    log(`Moving [${branch}] → ${join(dest, sanitizeBranch(branch))}`)
    await processLinkedWorktree(wt, dest, destBare)
  }

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
    for (let i = 1; i < worktrees.length; i++) {
      await processLinkedWorktree(worktrees[i], dest, destBare)
    }
  } else {
    // Step 9: Not standard — process all linked worktrees starting at index 0
    for (const wt of worktrees) {
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
