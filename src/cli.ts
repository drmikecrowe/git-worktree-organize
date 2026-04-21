#!/usr/bin/env node
/**
 * git-worktree-organize <source> [destination]
 *
 * Convert any git repo into the canonical bare-hub worktree layout.
 */

import { resolve, join, dirname, basename } from 'node:path'
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs'
import { run } from './run.ts'
import { detect } from './detect.ts'
import { listWorktrees, type Worktree } from './worktrees.ts'
import { migrate, resumeMigrate, repairHub, isPartialMigration, sanitizeBranch, resolveWorktreePath, findHub, migrateInPlace, isAgentWorktree } from './migrate.ts'
import { findMissingWorktrees, repairWorktree, type SearchResult } from './recover.ts'
import { getVersion } from './version.ts'

// ANSI color helpers
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function green(s: string)  { return `${GREEN}${s}${RESET}` }
function yellow(s: string) { return `${YELLOW}${s}${RESET}` }
function red(s: string)    { return `${RED}${s}${RESET}` }
function bold(s: string)   { return `${BOLD}${s}${RESET}` }

function prompt(): Promise<string> {
  return new Promise<string>(res => {
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', chunk => res(chunk.toString().trim()))
  })
}

/** Worktree status for validation mode */
type WorktreeStatus = 'healthy' | 'missing' | 'stale'

interface ValidatedWorktree {
  worktree: Worktree
  status: WorktreeStatus
}

/**
 * Check if a worktree's .git file points to the correct admin directory.
 */
function isGitPointerValid(worktreePath: string, hubPath: string): boolean {
  const gitFile = join(worktreePath, '.git')
  if (!existsSync(gitFile) || !statSync(gitFile).isFile()) {
    return false
  }

  const content = readFileSync(gitFile, 'utf8')
  const match = content.match(/^gitdir:\s*(.+)$/m)
  if (!match) {
    return false
  }

  const adminDir = match[1].trim()
  const bareDir = join(hubPath, '.bare')

  // Must point inside this hub's .bare/worktrees/
  if (!adminDir.includes(bareDir) || !adminDir.includes('/worktrees/')) {
    return false
  }

  // Admin dir must actually exist
  if (!existsSync(adminDir)) {
    return false
  }

  // Admin dir's gitdir must point back to this worktree's .git file
  const adminGitdirFile = join(adminDir, 'gitdir')
  if (!existsSync(adminGitdirFile)) {
    return false
  }
  const adminGitdir = readFileSync(adminGitdirFile, 'utf8').trim()
  if (adminGitdir !== gitFile) {
    return false
  }

  // commondir must be '../../' (relative to .bare/worktrees/<name>/)
  const commondirFile = join(adminDir, 'commondir')
  if (!existsSync(commondirFile) || readFileSync(commondirFile, 'utf8').trim() !== '../..') {
    return false
  }

  // If extensions.worktreeConfig = true, config.worktree must exist with core.bare = false
  const sharedConfig = join(hubPath, '.bare', 'config')
  if (existsSync(sharedConfig)) {
    const cfg = readFileSync(sharedConfig, 'utf8')
    const extMatch = cfg.match(/\[extensions\]([\s\S]*?)(?=\[|$)/i)
    if (extMatch && /worktreeconfig\s*=\s*true/i.test(extMatch[1])) {
      const configWt = join(adminDir, 'config.worktree')
      if (!existsSync(configWt) || !readFileSync(configWt, 'utf8').includes('bare = false')) {
        return false
      }
    }
  }

  // Functional check: verify git actually works in this worktree by
  // reading the HEAD commit (requires a working commondir to resolve refs)
  try {
    run('git', ['-C', worktreePath, 'rev-parse', 'HEAD'])
    return true
  } catch {
    return false
  }
}

/**
 * Enumerate worktrees by scanning .bare/worktrees/ admin dirs directly.
 * Used as a fallback when `git worktree list` fails due to corruption.
 */
function listWorktreesFromAdminDirs(hubPath: string): Worktree[] {
  const adminBase = join(hubPath, '.bare', 'worktrees')
  if (!existsSync(adminBase)) return []

  const worktrees: Worktree[] = []
  for (const adminName of readdirSync(adminBase)) {
    const adminDir = join(adminBase, adminName)
    if (!statSync(adminDir).isDirectory()) continue

    const gitdirFile = join(adminDir, 'gitdir')
    if (!existsSync(gitdirFile)) continue

    const wtGitFile = readFileSync(gitdirFile, 'utf8').trim()
    const wtPath = dirname(wtGitFile)

    // Read branch from HEAD file in admin dir
    const headFile = join(adminDir, 'HEAD')
    let branch: string | null = null
    let head = ''
    if (existsSync(headFile)) {
      const headContent = readFileSync(headFile, 'utf8').trim()
      if (headContent.startsWith('ref: refs/heads/')) {
        branch = headContent.slice('ref: refs/heads/'.length)
      } else {
        head = headContent
      }
    }

    worktrees.push({ path: wtPath, head, branch, isBare: false })
  }
  return worktrees
}

/**
 * Run validation mode on an existing bare-hub repository.
 * Reports the status of all worktrees: healthy, missing, or stale.
 * If any missing or stale worktrees exist, offers to search and repair them.
 */
async function runValidationMode(hubPath: string): Promise<void> {
  let worktrees: Worktree[]
  try {
    worktrees = await listWorktrees(hubPath)
  } catch {
    // git worktree list failed — likely due to broken commondir or other corruption.
    // Fall back to scanning admin dirs to enumerate worktrees.
    console.log(`${yellow('warn:')} git worktree list failed; scanning admin dirs to enumerate worktrees`)
    worktrees = listWorktreesFromAdminDirs(hubPath)
  }
  const validated: ValidatedWorktree[] = []

  for (const wt of worktrees) {
    if (wt.isBare) continue

    let status: WorktreeStatus
    if (!existsSync(wt.path)) {
      status = 'missing'
    } else if (!isGitPointerValid(wt.path, hubPath)) {
      status = 'stale'
    } else {
      status = 'healthy'
    }

    validated.push({ worktree: wt, status })
  }

  // Print validation report
  console.log()
  console.log(bold('Validation Report'))
  console.log(`Hub: ${hubPath}`)
  console.log()

  if (validated.length === 0) {
    console.log('No worktrees found.')
    return
  }

  // Find max branch name length for alignment
  const maxBranchLen = validated.reduce((m, v) => {
    const branch = v.worktree.branch ?? `detached-${v.worktree.head.slice(0, 8)}`
    return Math.max(m, branch.length)
  }, 0)

  // Print table header
  const headerBranch = 'Branch'.padEnd(maxBranchLen)
  const headerStatus = 'Status'
  const headerPath = 'Path'
  console.log(`  ${bold(headerBranch)}  ${bold(headerStatus.padEnd(7))}  ${bold(headerPath)}`)

  // Print each worktree
  const counts = { healthy: 0, missing: 0, stale: 0 }
  for (const v of validated) {
    const branch = v.worktree.branch ?? `detached-${v.worktree.head.slice(0, 8)}`
    const branchCol = branch.padEnd(maxBranchLen)

    let statusCol: string
    if (v.status === 'healthy') {
      statusCol = green('healthy')
      counts.healthy++
    } else if (v.status === 'missing') {
      statusCol = red('missing')
      counts.missing++
    } else {
      statusCol = yellow('stale')
      counts.stale++
    }

    console.log(`  ${branchCol}  ${statusCol.padEnd(7 + (statusCol.length - v.status.length))}  ${v.worktree.path}`)
  }

  // Print summary
  console.log()
  const summaryParts: string[] = []
  if (counts.healthy > 0) summaryParts.push(`${counts.healthy} healthy`)
  if (counts.missing > 0) summaryParts.push(`${counts.missing} missing`)
  if (counts.stale > 0) summaryParts.push(`${counts.stale} stale`)
  console.log(`Summary: ${summaryParts.join(', ')}`)

  // Auto-repair stale worktrees (their path exists, only the .git pointer is wrong)
  const staleWorktrees = validated.filter(v => v.status === 'stale')
  if (staleWorktrees.length > 0) {
    console.log()
    console.log(`${green('==>')} Auto-repairing ${staleWorktrees.length} stale worktree(s)...`)
    await repairHub(hubPath, msg => console.log(`  ${msg}`))
  }

  // Offer interactive repair for missing worktrees (require user to locate them)
  const needsRepair = validated.filter(v => v.status === 'missing')
  if (needsRepair.length === 0) {
    return
  }

  console.log()
  console.log(`${yellow('warn:')} ${needsRepair.length} missing worktree(s) need repair.`)

  // Search for missing worktrees
  const searchDirs = [dirname(hubPath)]
  console.log(`${green('==>')} Searching for missing worktrees...`)
  const results = await findMissingWorktrees(
    hubPath,
    searchDirs,
    msg => console.log(`    ${msg}`)
  )

  // Display results
  const found = results.filter(r => r.candidates.length > 0)
  const notFound = results.filter(r => r.candidates.length === 0)
  const multiple = results.filter(r => r.candidates.length > 1)

  if (notFound.length > 0) {
    console.log(`\n${yellow('Not found:')}`)
    for (const r of notFound) {
      console.log(`  [${r.branch}]`)
    }
  }

  if (found.length === 0) {
    console.log(`\nNo worktrees could be located. Consider pruning them with 'git worktree prune'.`)
    return
  }

  // Handle multiple matches with user selection
  const selections: Map<string, string> = new Map()
  for (const r of multiple) {
    console.log(`\n${bold(`[${r.branch}]`)} has multiple candidates:`)
    for (let i = 0; i < r.candidates.length; i++) {
      console.log(`  ${i + 1}) ${r.candidates[i]}`)
    }
    process.stdout.write(`Select which to use (1-${r.candidates.length}) [skip]: `)
    const sel = await prompt()
    const idx = parseInt(sel) - 1
    if (idx >= 0 && idx < r.candidates.length) {
      selections.set(r.branch, r.candidates[idx])
    }
  }

  // Display found worktrees in table format
  console.log(`\n${green('Found:')}`)
  const maxFoundBranchLen = found.reduce((m, r) => Math.max(m, r.branch.length), 0)
  for (const r of found) {
    const path = selections.get(r.branch) ?? r.candidates[0]
    const branchCol = bold(`[${r.branch}]`).padEnd(maxFoundBranchLen + 2 + BOLD.length + RESET.length)
    console.log(`  ${branchCol}  ${path}`)
  }

  // Batch confirmation
  console.log()
  process.stdout.write('Repair these worktrees? [y/N] ')
  const repairAns = await prompt()
  process.stdin.destroy()
  if (!/^[Yy]$/.test(repairAns)) {
    console.log('Aborted.')
    return
  }

  // Perform repairs
  console.log()
  for (const r of found) {
    const path = selections.get(r.branch) ?? r.candidates[0]
    await repairWorktree(path, hubPath, msg => console.log(`${green('==>')} ${msg}`))
  }
  console.log(`${green('==>')} Repaired ${found.length} worktree(s).`)
}

function usage(): void {
  console.log(`Usage: git-worktree-organize <source> [destination]

Convert a git repository into the canonical bare-hub worktree layout:

  <dest>/.bare/    ← bare git repo
  <dest>/.git      ← plain file: "gitdir: ./.bare"
  <dest>/<branch>/ ← one directory per worktree

Arguments:
  source       Path to existing git repository
  destination  Target hub directory (default: <parent>/<name>-bare)

Options:
  -h, --help      Show help
  -v, --version   Show version`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // Handle --version flag
  if (args[0] === '-v' || args[0] === '--version') {
    console.log(`git-worktree-organize ${getVersion(true)}`)
    process.exit(0)
  }

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    usage()
    process.exit(0)
  }

  // Show banner with version on startup
  console.log(`${bold('git-worktree-organize')} ${getVersion(true)}\n`)

  const sourcePath = args[0]
  const destArg    = args[1]

  // Resolve source early so we can display it
  const source = resolve(sourcePath)

  // If source itself is already a partial hub, resume in-place (dest = source)
  const dest = isPartialMigration(source)
    ? source
    : destArg
      ? resolve(destArg)
      : join(dirname(source), basename(source) + '-bare')

  // ── Validation mode for bare-hub ─────────────────────────────────────────────
  // If the repo is already a bare-hub, run validation mode instead of migration
  const config = await detect(source)
  if (config.type === 'bare-hub') {
    await runValidationMode(source)
    process.exit(0)
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Source is a worktree inside an existing hub? → offer .git repair ────────
  // When the user provides a path that is not a hub itself but sits inside one
  // (e.g. a worktree with a broken .git file), navigate up to find the hub and
  // offer to repair all worktree .git connections instead of migrating fresh.
  if (!isPartialMigration(source) && !destArg) {
    const ancestorHub = findHub(dirname(source))
    if (ancestorHub) {
      console.log(`\n${yellow('warn:')} ${bold(source)} is inside an existing hub at ${bold(ancestorHub)}`)
      console.log(`\nThis looks like manually-placed worktrees with stale .git files.`)
      console.log(`Running repair will fix all worktree .git connections in the hub.\n`)
      process.stdout.write(`Repair hub at ${ancestorHub}? [y/N] `)
      const repairAns = await prompt()
      process.stdin.destroy()
      if (!/^[Yy]$/.test(repairAns)) {
        console.log('Aborted.')
        process.exit(0)
      }
      console.log()
      await repairHub(ancestorHub, msg => console.log(`${green('==>')} ${msg}`))
      console.log()
      console.log(`${green('==>')} Verifying with git worktree list...`)
      console.log(run('git', ['-C', ancestorHub, 'worktree', 'list']).stdout)
      console.log(`Done! Hub: ${ancestorHub}`)
      process.exit(0)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Resume partial migration? ─────────────────────────────────────────────
  if (isPartialMigration(dest)) {
    const hubWorktrees = await listWorktrees(dest)
    const pending = hubWorktrees.filter(wt => {
      if (wt.isBare) return false
      if (isAgentWorktree(wt.path)) return false
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      return wt.path !== join(dest, sanitizeBranch(branch))
    })

    // Check for missing worktrees (paths that don't exist)
    const missing = hubWorktrees.filter(wt => {
      if (wt.isBare) return false
      return !existsSync(wt.path)
    })

    console.log(`\n${yellow('warn:')} Partial migration detected at ${bold(dest)}`)

    // Handle missing worktrees with search-and-repair
    if (missing.length > 0) {
      console.log(`\nThe following worktree paths no longer exist:`)
      for (const wt of missing) {
        const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
        console.log(`  [${branch}]  ${wt.path}`)
      }
      console.log()

      // Search for missing worktrees
      const searchDirs = [dirname(dest)]
      console.log(`${green('==>')} Searching for missing worktrees...`)
      const results = await findMissingWorktrees(
        dest,
        searchDirs,
        msg => console.log(`    ${msg}`)
      )

      // Display results
      const found = results.filter(r => r.candidates.length > 0)
      const notFound = results.filter(r => r.candidates.length === 0)
      const multiple = results.filter(r => r.candidates.length > 1)

      if (notFound.length > 0) {
        console.log(`\n${yellow('Not found:')}`)
        for (const r of notFound) {
          console.log(`  [${r.branch}]`)
        }
      }

      if (found.length === 0) {
        console.log(`\nNo worktrees could be located. Consider pruning them with 'git worktree prune'.`)
        process.exit(0)
      }

      // Handle multiple matches with user selection
      const selections: Map<string, string> = new Map()
      for (const r of multiple) {
        console.log(`\n${bold(`[${r.branch}]`)} has multiple candidates:`)
        for (let i = 0; i < r.candidates.length; i++) {
          console.log(`  ${i + 1}) ${r.candidates[i]}`)
        }
        process.stdout.write(`Select which to use (1-${r.candidates.length}) [skip]: `)
        const sel = await prompt()
        const idx = parseInt(sel) - 1
        if (idx >= 0 && idx < r.candidates.length) {
          selections.set(r.branch, r.candidates[idx])
        }
      }

      // Display found worktrees in table format
      console.log(`\n${green('Found:')}`)
      const maxBranchLen = found.reduce((m, r) => Math.max(m, r.branch.length), 0)
      for (const r of found) {
        const path = selections.get(r.branch) ?? r.candidates[0]
        const branchCol = bold(`[${r.branch}]`).padEnd(maxBranchLen + 2 + BOLD.length + RESET.length)
        console.log(`  ${branchCol}  ${path}`)
      }

      // Batch confirmation
      console.log()
      process.stdout.write('Repair these worktrees? [y/N] ')
      const repairAns = await prompt()
      if (!/^[Yy]$/.test(repairAns)) {
        console.log('Aborted.')
        process.stdin.destroy()
        process.exit(0)
      }

      // Perform repairs
      console.log()
      for (const r of found) {
        const path = selections.get(r.branch) ?? r.candidates[0]
        await repairWorktree(path, dest, msg => console.log(`${green('==>')} ${msg}`))
      }
      console.log(`${green('==>')} Repaired ${found.length} worktree(s).\n`)

      // Re-read worktrees after repair
      const refreshed = await listWorktrees(dest)
      hubWorktrees.length = 0
      hubWorktrees.push(...refreshed)

      // Recalculate pending after repair
      pending.length = 0
      pending.push(...hubWorktrees.filter(wt => {
        if (wt.isBare) return false
        if (isAgentWorktree(wt.path)) return false
        const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
        return wt.path !== join(dest, sanitizeBranch(branch))
      }))
    }

    if (pending.length === 0) {
      // All worktrees are in expected locations - run validation mode
      await runValidationMode(dest)
      process.exit(0)
    }

    console.log(`\nWorktrees still to move:`)
    for (const wt of pending) {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      const exists = existsSync(wt.path)
      const status = exists ? '' : `  ${yellow('(path missing)')}`
      console.log(`  [${bold(branch)}]  ${wt.path}  →  ${join(dest, sanitizeBranch(branch))}${status}`)
    }

    console.log()
    process.stdout.write('Resume migration? [y/N] ')
    const resumeAns = await prompt()
    if (!/^[Yy]$/.test(resumeAns)) {
      console.log('Aborted.')
      process.exit(0)
    }

    console.log()
    const hubPath = await resumeMigrate(
      dest,
      msg => console.log(`${green('==>')} ${msg}`),
      msg => console.log(`${yellow('warn:')} ${msg}`),
    )
    console.log()
    console.log(`${green('==>')} Verifying with git worktree list...`)
    console.log(run('git', ['-C', hubPath, 'worktree', 'list']).stdout)
    console.log(`Done! Hub: ${hubPath}`)
    process.exit(0)
  }
  // ─────────────────────────────────────────────────────────────────────────

  console.log(`\n${green('==>')} Reading worktrees from ${source}\n`)

  // List worktrees for display
  const allWorktrees = await listWorktrees(source)

  // ── In-place migration? ────────────────────────────────────────────────────
  // For standard repos without a destination arg, offer in-place migration.
  // This renames the source to .old and creates the hub at the original path.
  if (config.type === 'standard' && !destArg) {
    const repoName = basename(source)

    // Show worktrees that will be migrated
    let mainBranch = 'main'
    if (allWorktrees.length > 0) {
      mainBranch = allWorktrees[0].branch ?? 'main'
    }

    console.log('Worktrees to migrate:')
    const displayWorktrees = allWorktrees.filter(wt => !wt.isBare && !isAgentWorktree(wt.path))
    const maxNameLen = displayWorktrees.reduce((m, wt) => {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      return Math.max(m, branch.length)
    }, 0)

    for (const wt of displayWorktrees) {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      const safe = sanitizeBranch(branch)
      const isMain = branch === mainBranch
      const destDir = join(source, safe)
      const nameCol = bold(`[${branch}]`).padEnd(maxNameLen + 2 + BOLD.length + RESET.length)
      const annotation = isMain
        ? `  (labeled ${yellow('[main]')})`.padEnd(18 + YELLOW.length + RESET.length)
        : ''.padEnd(18)
      console.log(`  ${nameCol}${annotation}  →  ${destDir}`)
    }
    console.log()
    console.log(`Hub destination: ${bold(source)}  (bare repo at ${source}/.bare)`)
    console.log()

    console.log(`No destination specified. Migrate in-place?`)
    console.log(`This will rename '${bold(repoName)}' to '${bold(repoName + '.old')}' and create the hub here.`)
    console.log()
    process.stdout.write('Proceed with in-place migration? [y/N] ')
    const inPlaceAns = await prompt()
    process.stdin.destroy()

    if (!/^[Yy]$/.test(inPlaceAns)) {
      console.log('Aborted.')
      console.log('Tip: Specify a destination directory to migrate to a new location.')
      process.exit(0)
    }

    console.log()

    // Run in-place migration
    const hubPath = await migrateInPlace(
      source,
      msg => console.log(`${green('==>')} ${msg}`),
      msg => console.log(`${yellow('warn:')} ${msg}`),
    )

    // Verify
    console.log(`${green('==>')} Verifying with git worktree list...`)
    const verifyOutput = run('git', ['-C', hubPath, 'worktree', 'list']).stdout
    console.log(verifyOutput)

    console.log(`Done! Hub: ${hubPath}`)
    console.log(`Backup: ${source}.old`)
    console.log()
    console.log('Useful commands:')
    console.log(`  git -C ${hubPath} worktree list`)
    console.log(`  git -C ${hubPath}/main log --oneline -5`)
    process.exit(0)
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Missing worktrees? Search and repair instead of prune ─────────────────
  // Check for worktrees whose paths no longer exist and search for them.
  // Exclude paths that are stale due to a parent-dir rename but actually exist
  // at the remapped location (dest prefix → dirname(source)).
  const missing = allWorktrees.filter(wt => {
    if (wt.isBare) return false
    const actual = resolveWorktreePath(wt.path, dest, dirname(source))
    return !existsSync(actual)
  })

  if (missing.length > 0) {
    console.log(`\n${yellow('warn:')} The following worktree paths no longer exist:`)
    for (const wt of missing) {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      console.log(`  [${branch}]  ${wt.path}`)
    }
    console.log()

    // Search for missing worktrees
    const searchDirs = [dirname(source)]
    if (dest !== source) {
      searchDirs.push(dest)
    }

    console.log(`${green('==>')} Searching for missing worktrees...`)
    const results = await findMissingWorktrees(
      source,
      searchDirs,
      msg => console.log(`    ${msg}`)
    )

    // Display results
    const found = results.filter(r => r.candidates.length > 0)
    const notFound = results.filter(r => r.candidates.length === 0)
    const multiple = results.filter(r => r.candidates.length > 1)

    if (notFound.length > 0) {
      console.log(`\n${yellow('Not found:')}`)
      for (const r of notFound) {
        console.log(`  [${r.branch}]`)
      }
    }

    if (found.length === 0) {
      console.log(`\nNo worktrees could be located. Consider pruning them with 'git worktree prune'.`)
      process.exit(0)
    }

    // Handle multiple matches with user selection
    const selections: Map<string, string> = new Map()
    for (const r of multiple) {
      console.log(`\n${bold(`[${r.branch}]`)} has multiple candidates:`)
      for (let i = 0; i < r.candidates.length; i++) {
        console.log(`  ${i + 1}) ${r.candidates[i]}`)
      }
      process.stdout.write(`Select which to use (1-${r.candidates.length}) [skip]: `)
      const sel = await prompt()
      const idx = parseInt(sel) - 1
      if (idx >= 0 && idx < r.candidates.length) {
        selections.set(r.branch, r.candidates[idx])
      }
    }

    // Display found worktrees in table format
    console.log(`\n${green('Found:')}`)
    const maxBranchLen = found.reduce((m, r) => Math.max(m, r.branch.length), 0)
    for (const r of found) {
      const path = selections.get(r.branch) ?? r.candidates[0]
      const branchCol = bold(`[${r.branch}]`).padEnd(maxBranchLen + 2 + BOLD.length + RESET.length)
      console.log(`  ${branchCol}  ${path}`)
    }

    // Batch confirmation
    console.log()
    process.stdout.write('Repair these worktrees? [y/N] ')
    const repairAns = await prompt()
    if (!/^[Yy]$/.test(repairAns)) {
      console.log('Aborted.')
      process.stdin.destroy()
      process.exit(0)
    }

    // Perform repairs
    console.log()
    for (const r of found) {
      const path = selections.get(r.branch) ?? r.candidates[0]
      await repairWorktree(path, source, msg => console.log(`${green('==>')} ${msg}`))
    }
    console.log(`${green('==>')} Repaired ${found.length} worktree(s).\n`)

    // Re-read worktrees after repair
    const refreshed = await listWorktrees(source)
    allWorktrees.length = 0
    allWorktrees.push(...refreshed)
  }
  // ─────────────────────────────────────────────────────────────────────────

  const worktrees = allWorktrees.filter(wt => !wt.isBare && !isAgentWorktree(wt.path))

  // Determine which branch is "main" (first worktree for standard repos)
  let mainBranch: string | null = null
  if (config.type === 'standard' && worktrees.length > 0) {
    mainBranch = worktrees[0].branch
  }

  // Print worktrees table
  console.log('Worktrees to migrate:')

  // Find the longest branch name for alignment
  const entries = worktrees.map(wt => {
    const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
    const safe   = sanitizeBranch(branch)
    const isMain = branch === mainBranch
    const destDir = join(dest, safe)
    return { branch, isMain, destDir }
  })

  const maxNameLen = entries.reduce((m, e) => Math.max(m, e.branch.length), 0)

  for (const { branch, isMain, destDir } of entries) {
    const tag     = isMain ? yellow('[main]') : ''
    const tagPad  = isMain ? `  (labeled ${yellow('[main]')})` : ''
    // branch column width: bold branch name padded to maxNameLen + 2 brackets
    const nameCol = bold(`[${branch}]`).padEnd(maxNameLen + 2 + BOLD.length + RESET.length)
    // align the tag annotation
    const annotation = isMain
      ? `  (labeled ${yellow('[main]')})`.padEnd(18 + YELLOW.length + RESET.length)
      : ''.padEnd(18)
    void tag; void tagPad
    console.log(`  ${nameCol}${annotation}  →  ${destDir}`)
  }

  console.log()
  console.log(`Hub destination: ${bold(dest)}  (bare repo at ${dest}/.bare)`)
  console.log()

  // Interactive confirmation
  process.stdout.write('Proceed? [y/N] ')
  const ans = await prompt()
  process.stdin.destroy()

  if (!/^[Yy]$/.test(ans)) {
    console.log('Aborted.')
    process.exit(0)
  }

  console.log()

  // Run migration
  const hubPath = await migrate(
    config,
    { source: sourcePath, dest: destArg ?? '' },
    msg => console.log(`${green('==>')} ${msg}`),
    msg => console.log(`${yellow('warn:')} ${msg}`),
  )

  // Verify
  console.log(`${green('==>')} Verifying with git worktree list...`)
  const verifyOutput = run('git', ['-C', hubPath, 'worktree', 'list']).stdout
  console.log(verifyOutput)

  console.log(`Done! Hub: ${hubPath}`)
  console.log()

  // Determine main branch name for the useful commands hint
  const mainSafe = mainBranch ? sanitizeBranch(mainBranch) : (entries[0]?.branch ? sanitizeBranch(entries[0].branch) : '')

  console.log('Useful commands:')
  console.log(`  git -C ${hubPath} worktree list`)
  if (mainSafe) {
    console.log(`  git -C ${hubPath}/${mainSafe} log --oneline -5`)
  }
}

main().catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
