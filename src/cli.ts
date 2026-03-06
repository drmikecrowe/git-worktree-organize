#!/usr/bin/env bun
/**
 * git-worktree-organize <source> [destination]
 *
 * Convert any git repo into the canonical bare-hub worktree layout.
 */

import { resolve, join, dirname, basename } from 'node:path'
import { $ } from 'bun'
import { detect } from './detect.ts'
import { listWorktrees } from './worktrees.ts'
import { migrate, sanitizeBranch } from './migrate.ts'

// ANSI color helpers
const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function green(s: string)  { return `${GREEN}${s}${RESET}` }
function yellow(s: string) { return `${YELLOW}${s}${RESET}` }
function bold(s: string)   { return `${BOLD}${s}${RESET}` }

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

  // Compute the destination the same way migrate() does
  const dest = destArg
    ? resolve(destArg)
    : join(dirname(source), basename(source) + '-bare')

  console.log(`\n${green('==>')} Reading worktrees from ${source}\n`)

  // Detect repo type and list worktrees for display
  const config = await detect(source)
  const allWorktrees = await listWorktrees(source)
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
  const ans = await new Promise<string>(resolve => {
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', chunk => resolve(chunk.toString().trim()))
  })
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
  const verifyOutput = await $`git -C ${hubPath} worktree list`.text()
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
