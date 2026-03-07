import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './shell.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

/** Create a temp directory and return its path. */
export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'git-worktree-organize-'))
}

/**
 * Create a standard git repo (non-bare, .git/ dir) with one commit.
 * Adds extra worktrees for each branch name supplied in `branches`.
 */
export async function makeStandardRepo(dir: string, branches: string[] = []): Promise<void> {
  await run('git', ['init', '--initial-branch=main', dir], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { quiet: true, env: isolatedEnv })

  for (const branch of branches) {
    const wtDir = join(dir + '-' + branch.replace(/\//g, '-'))
    await run('git', ['-C', dir, 'worktree', 'add', '-b', branch, wtDir], { quiet: true, env: isolatedEnv })
  }
}

/**
 * Create a bare repo at `dir` (clone --bare equivalent).
 */
export async function makeBareRootRepo(dir: string): Promise<void> {
  await run('git', ['init', '--bare', dir], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
}

/**
 * Create a bare-hub repo (already in hub layout: .bare/ + .git file).
 */
export async function makeBareHubRepo(dir: string): Promise<void> {
  const bareDir = join(dir, '.bare')
  mkdirSync(bareDir, { recursive: true })
  await run('git', ['init', '--bare', bareDir], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', bareDir, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', bareDir, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
  writeFileSync(join(dir, '.git'), 'gitdir: ./.bare\n')
}

/**
 * Assert the hub structure at `dir` is valid.
 */
export async function assertHubStructure(dir: string): Promise<void> {
  const bareDir = join(dir, '.bare')
  if (!existsSync(bareDir) || !statSync(bareDir).isDirectory()) {
    throw new Error(`assertHubStructure: ${bareDir} does not exist or is not a directory`)
  }
  const gitFile = join(dir, '.git')
  if (!existsSync(gitFile) || !statSync(gitFile).isFile()) {
    throw new Error(`assertHubStructure: ${gitFile} does not exist or is not a file`)
  }
  const gitFileContent = readFileSync(gitFile, 'utf8')  // eslint-disable-line @typescript-eslint/no-use-before-define
  if (!gitFileContent.includes('gitdir: ./.bare')) {
    throw new Error(`assertHubStructure: ${gitFile} does not contain 'gitdir: ./.bare'`)
  }
  // Assert git worktree list succeeds
  await run('git', ['-C', dir, 'worktree', 'list'], { quiet: true })
}

/**
 * Assert that a worktree for `branch` is functional (git status succeeds).
 */
export async function assertWorktreeWorks(dir: string, branch: string): Promise<void> {
  const safeBranch = branch.replace(/\//g, '-')
  const wtPath = join(dir, safeBranch)
  await run('git', ['-C', wtPath, 'status'], { quiet: true })
}
