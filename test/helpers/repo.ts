import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'

/** Create a temp directory and return its path. */
export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'git-worktree-organize-'))
}

/**
 * Create a standard git repo (non-bare, .git/ dir) with one commit.
 * Adds extra worktrees for each branch name supplied in `branches`.
 */
export async function makeStandardRepo(dir: string, branches: string[] = []): Promise<void> {
  await $`git init ${dir}`.quiet()
  await $`git -C ${dir} config user.email "test@test.com"`.quiet()
  await $`git -C ${dir} config user.name "Test"`.quiet()
  await $`git -C ${dir} commit --allow-empty -m "init"`.quiet()

  for (const branch of branches) {
    const wtDir = join(dir + '-' + branch.replace(/\//g, '-'))
    await $`git -C ${dir} worktree add -b ${branch} ${wtDir}`.quiet()
  }
}

/**
 * Create a bare repo at `dir` (clone --bare equivalent).
 */
export async function makeBareRootRepo(dir: string): Promise<void> {
  await $`git init --bare ${dir}`.quiet()
  await $`git -C ${dir} config user.email "test@test.com"`.quiet()
  await $`git -C ${dir} config user.name "Test"`.quiet()
}

/**
 * Create a bare-hub repo (already in hub layout: .bare/ + .git file).
 */
export async function makeBareHubRepo(dir: string): Promise<void> {
  const bareDir = join(dir, '.bare')
  mkdirSync(bareDir, { recursive: true })
  await $`git init --bare ${bareDir}`.quiet()
  await $`git -C ${bareDir} config user.email "test@test.com"`.quiet()
  await $`git -C ${bareDir} config user.name "Test"`.quiet()
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
  await $`git -C ${dir} worktree list`.quiet()
}

/**
 * Assert that a worktree for `branch` is functional (git status succeeds).
 */
export async function assertWorktreeWorks(dir: string, branch: string): Promise<void> {
  const safeBranch = branch.replace(/\//g, '-')
  const wtPath = join(dir, safeBranch)
  await $`git -C ${wtPath} status`.quiet()
}
