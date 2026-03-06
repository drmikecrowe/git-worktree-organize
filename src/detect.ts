import { existsSync, statSync, readFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'

export type RepoConfig =
  | { type: 'standard';      gitdir: string; mainWorktree: string }
  | { type: 'bare-root';     gitdir: string }
  | { type: 'bare-hub';      gitdir: string }
  | { type: 'bare-dotgit';   gitdir: string }
  | { type: 'bare-external'; gitdir: string }

/**
 * Read core.bare from a git config file at `gitdir/config`.
 * Returns true if set to "true", false if set to "false" or not set.
 */
function readCoreBare(gitdir: string): boolean {
  try {
    const result = execSync(`git --git-dir=${gitdir} config --get core.bare`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result === 'true'
  } catch {
    // exit code 1 means key not found — treat as false
    return false
  }
}

/**
 * Detect the type of git repository at `repoPath`.
 * Throws if the path is not a recognized git repo or is a linked worktree.
 */
export async function detect(repoPath: string): Promise<RepoConfig> {
  const gitEntryPath = join(repoPath, '.git')
  const gitEntryExists = existsSync(gitEntryPath)

  if (gitEntryExists) {
    const stat = statSync(gitEntryPath)

    if (stat.isDirectory()) {
      // .git is a directory — standard or bare-dotgit
      const isbare = readCoreBare(gitEntryPath)
      if (isbare) {
        return { type: 'bare-dotgit', gitdir: gitEntryPath }
      } else {
        return { type: 'standard', gitdir: gitEntryPath, mainWorktree: repoPath }
      }
    } else if (stat.isFile()) {
      // .git is a file — parse gitdir
      const contents = readFileSync(gitEntryPath, 'utf8')
      const firstLine = contents.split('\n')[0].trim()
      const match = firstLine.match(/^gitdir:\s*(.+)$/)
      if (!match) {
        throw new Error(`not a git repository: ${repoPath}`)
      }
      const rawGitdir = match[1].trim()
      const absGitdir = isAbsolute(rawGitdir)
        ? rawGitdir
        : resolve(repoPath, rawGitdir)

      // Linked worktree: resolved path contains /worktrees/
      if (absGitdir.includes('/worktrees/')) {
        throw new Error('is a linked worktree, not a repo root')
      }

      // Validate the resolved gitdir looks like a git object store
      if (
        !existsSync(join(absGitdir, 'HEAD')) ||
        !existsSync(join(absGitdir, 'objects')) ||
        !existsSync(join(absGitdir, 'refs'))
      ) {
        throw new Error(`gitdir does not appear to be a git repository: ${absGitdir}`)
      }

      // bare-hub: resolved path ends with .bare
      if (absGitdir.endsWith('.bare')) {
        return { type: 'bare-hub', gitdir: absGitdir }
      }

      // bare-external: points elsewhere
      return { type: 'bare-external', gitdir: absGitdir }
    }
  }

  // No .git entry — check for bare-root (HEAD + refs/ + objects/ at root)
  const headExists    = existsSync(join(repoPath, 'HEAD'))
  const refsExists    = existsSync(join(repoPath, 'refs'))
  const objectsExists = existsSync(join(repoPath, 'objects'))

  if (headExists && refsExists && objectsExists) {
    return { type: 'bare-root', gitdir: repoPath }
  }

  throw new Error(`not a git repository: ${repoPath}`)
}
