#!/usr/bin/env node
/**
 * git-worktree-organize <source> [destination]
 *
 * Convert any git repo into the canonical bare-hub worktree layout.
 */

import { resolve, join, dirname, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { run } from './run.ts'
import { detect } from './detect.ts'
import { listWorktrees } from './worktrees.ts'
import { migrate, resumeMigrate, isPartialMigration, sanitizeBranch, resolveWorktreePath } from './migrate.ts'

// ANSI color helpers
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function green(s: string)  { return `${GREEN}${s}${RESET}` }
function yellow(s: string) { return `${YELLOW}${s}${RESET}` }
function bold(s: string)   { return `${BOLD}${s}${RESET}` }

function prompt(): Promise<string> {
  return new Promise<string>(res => {
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', chunk => res(chunk.toString().trim()))
  })
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
  -h, --help   Show help`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    usage()
    process.exit(0)
  }

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

  // ── Resume partial migration? ─────────────────────────────────────────────
  if (isPartialMigration(dest)) {
    const hubWorktrees = await listWorktrees(dest)
    const pending = hubWorktrees.filter(wt => !wt.isBare && !wt.path.startsWith(dest + '/'))

    console.log(`\n${yellow('warn:')} Partial migration detected at ${bold(dest)}`)

    if (pending.length === 0) {
      console.log('All worktrees are already in place — nothing to resume.')
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
    const hubPath = await resumeMigrate(dest, msg => console.log(`${green('==>')} ${msg}`))
    console.log()
    console.log(`${green('==>')} Verifying with git worktree list...`)
    console.log(run('git', ['-C', hubPath, 'worktree', 'list']).stdout)
    console.log(`Done! Hub: ${hubPath}`)
    process.exit(0)
  }
  // ─────────────────────────────────────────────────────────────────────────

  console.log(`\n${green('==>')} Reading worktrees from ${source}\n`)

  // Detect repo type and list worktrees for display
  const config = await detect(source)
  const allWorktrees = await listWorktrees(source)

  // Check for worktrees whose paths no longer exist and offer to prune them.
  // Exclude paths that are stale due to a parent-dir rename but actually exist
  // at the remapped location (dest prefix → dirname(source)).
  const missing = allWorktrees.filter(wt => {
    if (wt.isBare) return false
    const actual = resolveWorktreePath(wt.path, dest, dirname(source))
    return !existsSync(actual)
  })
  if (missing.length > 0) {
    console.log(`${yellow('warn:')} The following worktree paths no longer exist:`)
    for (const wt of missing) {
      const branch = wt.branch ?? `detached-${wt.head.slice(0, 8)}`
      console.log(`  [${branch}]  ${wt.path}`)
    }
    console.log()
    process.stdout.write('Remove them with `git worktree prune` and continue? [y/N] ')
    const pruneAns = await prompt()
    if (!/^[Yy]$/.test(pruneAns)) {
      console.log('Aborted.')
      process.stdin.destroy()
      process.exit(0)
    }
    run('git', ['-C', source, 'worktree', 'prune'])
    console.log(`${green('==>')} Pruned stale worktrees.\n`)
    // Re-read worktrees after pruning
    const refreshed = await listWorktrees(source)
    allWorktrees.length = 0
    allWorktrees.push(...refreshed)
  }

  const worktrees = allWorktrees.filter(wt => !wt.isBare)

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
  const hubPath = await migrate(config, { source: sourcePath, dest: destArg ?? '' })

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
