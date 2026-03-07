/**
 * CLI integration tests for worktree recovery flow.
 *
 * Tests the search-and-recover flow that replaces the prune flow when
 * worktrees have missing paths.
 *
 * Note: Full CLI interaction testing is complex due to stdin handling.
 * Core recovery logic is tested in recover.test.ts. These tests verify
 * the CLI triggers the right behaviors.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, dirname, basename } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { makeTempDir, makeBareHubRepo, makeStandardRepo, assertHubStructure } from './helpers/repo.ts'
import { run } from './helpers/shell.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

/**
 * Create a hub repo with initial commit on 'main' branch.
 */
async function makeHubWithCommit(hubDir: string): Promise<string> {
  await makeBareHubRepo(hubDir)

  // Create main worktree to establish initial commit
  const mainWt = join(hubDir, 'main')
  await run('git', ['-C', hubDir, 'worktree', 'add', '--orphan', '-b', 'main', mainWt], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', mainWt, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', mainWt, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', mainWt, 'commit', '--allow-empty', '-m', 'initial'], { quiet: true, env: isolatedEnv })

  // Set HEAD in bare repo to point to main branch
  const bareDir = join(hubDir, '.bare')
  await run('git', ['-C', bareDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { quiet: true, env: isolatedEnv })

  return hubDir
}

/**
 * Move a directory recursively using shell mv command.
 */
async function moveDir(src: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  await run('mv', ['-f', src, dest], { quiet: true })
}

/**
 * Run CLI with single input via stdin pipe.
 * Note: Only supports single-prompt scenarios due to stdin buffering.
 */
async function runCli(
  args: string[],
  input: string | undefined = undefined,
  options?: { cwd?: string; timeout?: number }
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const cliPath = join(process.cwd(), 'src', 'cli.ts')
    const child = spawn('npx', ['tsx', cliPath, ...args], {
      cwd: options?.cwd ?? process.cwd(),
      env: { ...process.env, ...isolatedEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let output = ''

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      output += data.toString()
    })

    // Send input if provided (empty string sends just newline for skip scenarios)
    if (input !== undefined) {
      child.stdin.setDefaultEncoding('utf8')
      child.stdin.write(input + '\n')
    }

    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`CLI timeout after ${options?.timeout ?? 30000}ms. Output:\n${output}`))
    }, options?.timeout ?? 30000)

    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ output, exitCode: code ?? 1 })
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

describe('cli validation mode', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('detects bare-hub and runs validation', async () => {
    const hubDir = join(tempDir, 'myproject-bare')
    await makeHubWithCommit(hubDir)

    const { output, exitCode } = await runCli([hubDir])

    // Should show validation report
    expect(output).toContain('Validation Report')
    expect(output).toContain('main')
    expect(exitCode).toBe(0)
  })

  it('reports healthy worktrees', async () => {
    const hubDir = join(tempDir, 'project-bare')
    await makeHubWithCommit(hubDir)

    const { output } = await runCli([hubDir])

    expect(output).toContain('healthy')
  })

  it('reports missing worktrees', async () => {
    const hubDir = join(tempDir, 'project-bare')
    await makeHubWithCommit(hubDir)

    // Create another worktree and then delete it
    const featureWt = join(hubDir, 'feature-x')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature-x', featureWt], { quiet: true, env: isolatedEnv })
    rmSync(featureWt, { recursive: true, force: true })

    const { output } = await runCli([hubDir])

    expect(output).toContain('missing')
    expect(output).toContain('feature-x')
  })

  it('reports stale worktrees', async () => {
    const hubDir = join(tempDir, 'project-bare')
    await makeHubWithCommit(hubDir)

    // Create another worktree and corrupt its .git file
    const featureWt = join(hubDir, 'feature-y')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature-y', featureWt], { quiet: true, env: isolatedEnv })
    writeFileSync(join(featureWt, '.git'), 'gitdir: /wrong/path\n')

    const { output } = await runCli([hubDir])

    expect(output).toContain('stale')
    expect(output).toContain('feature-y')
  })

  it('shows summary counts', async () => {
    const hubDir = join(tempDir, 'project-bare')
    await makeHubWithCommit(hubDir)

    // Create a missing worktree
    const missingWt = join(hubDir, 'missing-branch')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'missing-branch', missingWt], { quiet: true, env: isolatedEnv })
    rmSync(missingWt, { recursive: true, force: true })

    // Create a stale worktree
    const staleWt = join(hubDir, 'stale-branch')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'stale-branch', staleWt], { quiet: true, env: isolatedEnv })
    writeFileSync(join(staleWt, '.git'), 'gitdir: /wrong/path\n')

    const { output } = await runCli([hubDir])

    // Should show counts: 1 healthy, 1 missing, 1 stale
    expect(output).toContain('1 healthy')
    expect(output).toContain('1 missing')
    expect(output).toContain('1 stale')
  })
})

describe('cli worktree recovery', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('detection and search', () => {
    it('shows missing worktrees and searches for them', async () => {
      const hubDir = join(tempDir, 'myproject-bare')
      await makeHubWithCommit(hubDir)

      // Create and move a worktree
      const wtDir = join(hubDir, 'feature-test')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/test', wtDir], { quiet: true, env: isolatedEnv })
      await run('git', ['-C', wtDir, 'commit', '--allow-empty', '-m', 'test'], { quiet: true, env: isolatedEnv })

      const externalDir = join(tempDir, 'external')
      mkdirSync(externalDir, { recursive: true })
      await moveDir(wtDir, join(externalDir, 'feature-test'))

      // Run CLI and decline repair
      const { output, exitCode } = await runCli([hubDir], 'n')

      // Should detect and search
      expect(output).toContain('warn:')
      expect(output).toContain('feature/test')
      expect(output).toContain('Searching')
      expect(output).toContain('Found')
      expect(output).toContain('Aborted')
      expect(exitCode).toBe(0)
    })

    it('displays found worktrees in table format', async () => {
      const hubDir = join(tempDir, 'myproject-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'dev-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'dev-branch', wtDir], { quiet: true, env: isolatedEnv })

      const externalDir = join(tempDir, 'elsewhere')
      mkdirSync(externalDir, { recursive: true })
      await moveDir(wtDir, join(externalDir, 'dev-branch'))

      const { output } = await runCli([hubDir], 'n')

      expect(output).toContain('Found:')
      expect(output).toContain('dev-branch')
    })

    it('prompts for confirmation before repair', async () => {
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'test-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'test-branch', wtDir], { quiet: true, env: isolatedEnv })

      mkdirSync(join(tempDir, 'external'), { recursive: true })
      await moveDir(wtDir, join(tempDir, 'external', 'test-branch'))

      const { output } = await runCli([hubDir], 'n')

      expect(output).toContain('Repair these worktrees?')
    })

    it('handles no-match case gracefully', async () => {
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'gone-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'gone-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Delete worktree completely
      rmSync(wtDir, { recursive: true, force: true })

      const { output } = await runCli([hubDir])

      expect(output).toContain('Not found:')
      expect(output).toContain('gone-branch')
      expect(output).toContain('No worktrees could be located')
    })
  })
})

describe('cli in-place migration', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('prompts for in-place when standard repo + no dest', async () => {
    // Create a standard repo without destination arg
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Run CLI with just source (no destination)
    const { output, exitCode } = await runCli([repoDir], 'n')

    // Should prompt for in-place migration
    expect(output).toContain('in-place')
    expect(output).toContain('Aborted')
    expect(exitCode).toBe(0)
  })

  it('renames source to .old before creating hub', async () => {
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Run CLI and accept in-place migration
    const { output, exitCode } = await runCli([repoDir], 'y')

    // Should mention the .old backup
    expect(output).toContain('.old')
    expect(exitCode).toBe(0)
  })

  it('hub ends up at original source path', async () => {
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Run CLI and accept in-place migration
    const { output, exitCode } = await runCli([repoDir], 'y')

    expect(exitCode).toBe(0)

    // Hub should be at the original source path
    await assertHubStructure(repoDir)
  })

  it('aborts if .old already exists', async () => {
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Create .old directory to block migration
    const oldDir = repoDir + '.old'
    mkdirSync(oldDir, { recursive: true })

    // Run CLI and accept in-place migration
    const { output, exitCode } = await runCli([repoDir], 'y')

    // Should abort with error about .old existing
    expect(output).toContain('.old')
    expect(output).toContain('already exists')
    expect(exitCode).toBe(1)
  })

  it('shows confirmation before rename', async () => {
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Run CLI - decline in-place to see the prompt
    const { output } = await runCli([repoDir], 'n')

    // Should show what will happen
    expect(output).toContain('rename')
    expect(output).toContain('hub')
  })

  it('mentions .old backup on success', async () => {
    const repoDir = join(tempDir, 'myproject')
    await makeStandardRepo(repoDir)

    // Run CLI and accept in-place migration
    const { output, exitCode } = await runCli([repoDir], 'y')

    expect(exitCode).toBe(0)

    // Success message should mention backup location (case-insensitive)
    expect(output.toLowerCase()).toContain('backup')
    expect(output).toContain('.old')
  })
})
