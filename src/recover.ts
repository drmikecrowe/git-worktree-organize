import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { sanitizeBranch } from './migrate.ts'
import { listWorktrees } from './worktrees.ts'

export interface SearchResult {
  branch: string
  sanitizedBranch: string
  foundPath: string | null
  candidates: string[]  // all potential matches
}

export interface SearchOptions {
  searchDirs: string[]  // directories to search
  maxDepth: number      // default 3
}

/**
 * Search directories for a worktree matching the given branch name.
 * Searches up to maxDepth levels, matching by sanitized branch name.
 * Skips hidden directories, node_modules, and .git directories.
 * Returns all valid candidates that have a .git file (not directory).
 */
export async function searchForWorktree(
  branch: string,
  options: SearchOptions,
  log?: (msg: string) => void
): Promise<SearchResult> {
  const sanitizedBranch = sanitizeBranch(branch)
  const candidates: string[] = []

  for (const searchDir of options.searchDirs) {
    searchAtDepth(searchDir, sanitizedBranch, 0, options.maxDepth, candidates, log)
  }

  // Filter candidates to only those with valid .git file
  const validCandidates = candidates.filter(c => {
    const gitPath = join(c, '.git')
    return existsSync(gitPath) && statSync(gitPath).isFile()
  })

  return {
    branch,
    sanitizedBranch,
    foundPath: validCandidates.length === 1 ? validCandidates[0] : null,
    candidates: validCandidates
  }
}

function searchAtDepth(
  dir: string,
  targetName: string,
  currentDepth: number,
  maxDepth: number,
  candidates: string[],
  log?: (msg: string) => void
): void {
  if (currentDepth > maxDepth) return
  if (!existsSync(dir)) return

  const entries = readdirSync(dir)
  for (const entry of entries) {
    // Skip excluded directories
    if (entry.startsWith('.') || entry === 'node_modules') continue

    const fullPath = join(dir, entry)
    if (!statSync(fullPath).isDirectory()) continue

    // Check if this directory name matches target
    if (entry === targetName) {
      log?.(`Found candidate: ${fullPath}`)
      candidates.push(fullPath)
    }

    // Recurse into subdirectories
    searchAtDepth(fullPath, targetName, currentDepth + 1, maxDepth, candidates, log)
  }
}

/**
 * Find all missing worktrees for a hub by searching registered worktrees
 * that have non-existent paths.
 */
export async function findMissingWorktrees(
  hubPath: string,
  searchDirs: string[],
  log?: (msg: string) => void
): Promise<SearchResult[]> {
  const worktrees = await listWorktrees(hubPath)
  const results: SearchResult[] = []

  for (const wt of worktrees) {
    if (wt.isBare) continue
    if (existsSync(wt.path)) continue  // not missing

    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    log?.(`Searching for missing worktree [${branch}]...`)

    const result = await searchForWorktree(branch, { searchDirs, maxDepth: 3 }, log)
    results.push(result)
  }

  return results
}

/**
 * Repair a worktree by updating its .git file to point to the correct admin dir.
 * Also updates the admin dir's gitdir file to point back to the worktree.
 */
export async function repairWorktree(
  worktreePath: string,
  hubPath: string,
  log?: (msg: string) => void
): Promise<void> {
  const bareDir = join(hubPath, '.bare')
  const adminBase = join(bareDir, 'worktrees')

  // Read worktree's .git file to find the old admin dir name
  const gitFile = join(worktreePath, '.git')
  const content = readFileSync(gitFile, 'utf8')
  const match = content.match(/^gitdir:\s*(.+)/m)
  if (!match) {
    throw new Error(`Cannot parse .git file in ${worktreePath}`)
  }
  const oldAdminPath = match[1].trim()
  const adminName = basename(oldAdminPath)
  const newAdminPath = join(adminBase, adminName)

  // Update worktree's .git file
  log?.(`Repairing ${worktreePath} -> ${newAdminPath}`)
  writeFileSync(gitFile, `gitdir: ${newAdminPath}\n`)

  // Update admin dir's gitdir file
  const gitdirFile = join(newAdminPath, 'gitdir')
  if (existsSync(gitdirFile)) {
    writeFileSync(gitdirFile, `${worktreePath}/.git\n`)
  }
}
