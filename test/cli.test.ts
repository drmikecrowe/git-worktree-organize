/**
 * CLI integration tests for worktree recovery flow.
 *
 * Tests the search-and-recover flow that replaces the prune flow when
 * worktrees have missing paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { makeTempDir, makeBareHubRepo, assertWorktreeWorks } from './helpers/repo.ts'
import { run } from './helpers/shell.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

/**
 * Create a hub repo with initial commit on 'main' branch.
 * Returns the path to the hub directory.
 */
async function makeHubWithCommit(hubDir: string): Promise<string> {
  await makeBareHubRepo(hubDir)

  // Create main worktree to establish initial commit
  const mainWt = join(hubDir, 'main')
  // Use --orphan flag to create an orphan branch
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
 * Node's renameSync doesn't work across filesystems.
 */
async function moveDir(src: string, dest: string): Promise<void> {
  // Ensure parent directory exists
  mkdirSync(dirname(dest), { recursive: true })
  await run('mv', ['-f', src, dest], { quiet: true })
}

/**
 * Spawn the CLI and capture output, providing input via stdin.
 * Returns the combined stdout+stderr and exit code.
 */
async function runCli(
  args: string[],
  inputs: string[] = [],
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
    let inputIndex = 0

    child.stdout.on('data', (data) => {
      output += data.toString()
    })

    child.stderr.on('data', (data) => {
      output += data.toString()
    })

    // Send inputs when prompted
    child.stdin.setDefaultEncoding('utf8')
    const sendNextInput = () => {
      if (inputIndex < inputs.length) {
        // Small delay to ensure prompt is shown
        setTimeout(() => {
          child.stdin.write(inputs[inputIndex] + '\n')
          inputIndex++
        }, 100)
      }
    }
    sendNextInput() // Send first input immediately

    // Watch for prompts and send subsequent inputs
    const outputChecker = setInterval(() => {
      if (inputIndex < inputs.length && (output.includes('[y/N]') || output.includes('Select'))) {
        child.stdin.write(inputs[inputIndex] + '\n')
        inputIndex++
      }
    }, 200)

    const timeout = setTimeout(() => {
      clearInterval(outputChecker)
      child.kill()
      reject(new Error(`CLI timeout after ${options?.timeout ?? 30000}ms`))
    }, options?.timeout ?? 30000)

    child.on('close', (code) => {
      clearTimeout(timeout)
      clearInterval(outputChecker)
      resolve({ output, exitCode: code ?? 1 })
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      clearInterval(outputChecker)
      reject(err)
    })
  })
}

describe('cli worktree recovery', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('basic recovery flow', () => {
    it('shows missing worktrees and searches for them', async () => {
      // Setup: Create hub with worktree, then move worktree outside hub
      const hubDir = join(tempDir, 'myproject-bare')
      await makeHubWithCommit(hubDir)

      // Create a feature worktree
      const wtDir = join(hubDir, 'feature-test')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/test', wtDir], { quiet: true, env: isolatedEnv })
      await run('git', ['-C', wtDir, 'commit', '--allow-empty', '-m', 'test'], { quiet: true, env: isolatedEnv })

      // Move worktree outside hub (making it "missing")
      const externalDir = join(tempDir, 'external-projects')
      const movedWtDir = join(externalDir, 'feature-test')
      await moveDir(wtDir, movedWtDir)

      // Run CLI - it should detect missing worktree and search
      const { output, exitCode } = await runCli([hubDir], ['n'])

      // Should show warning about missing worktree
      expect(output).toContain('warn:')
      expect(output).toContain('feature/test')

      // Should search for missing worktrees
      expect(output).toContain('Searching for missing worktree')

      // Should find the moved worktree
      expect(output).toContain('Found candidate')

      // User declined repair, so should abort
      expect(exitCode).toBe(0)
      expect(output).toContain('Aborted')
    })

    it('displays found worktrees in table format', async () => {
      // Setup: Create hub with missing worktree
      const hubDir = join(tempDir, 'myproject-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'dev-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'dev-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Move worktree
      const externalDir = join(tempDir, 'elsewhere')
      await moveDir(wtDir, join(externalDir, 'dev-branch'))

      const { output } = await runCli([hubDir], ['n'])

      // Should display found worktrees
      expect(output).toContain('Found:')
      expect(output).toContain('dev-branch')
    })

    it('prompts for confirmation before repair', async () => {
      // Setup: Hub with missing worktree
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'test-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'test-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Move worktree
      await moveDir(wtDir, join(tempDir, 'test-branch'))

      const { output } = await runCli([hubDir], ['n'])

      // Should prompt for confirmation
      expect(output).toContain('Repair these worktrees?')
    })

    it('repairs worktrees after confirmation', async () => {
      // Setup: Hub with missing worktree
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'fixme-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'fixme-branch', wtDir], { quiet: true, env: isolatedEnv })
      await run('git', ['-C', wtDir, 'commit', '--allow-empty', '-m', 'work'], { quiet: true, env: isolatedEnv })

      // Move worktree
      const movedWtDir = join(tempDir, 'fixme-branch')
      await moveDir(wtDir, movedWtDir)

      // Run CLI and confirm repair
      const { output, exitCode } = await runCli([hubDir], ['y'])

      // Should show repair messages
      expect(output).toContain('Repairing')
      expect(output).toContain('Repaired')

      // Should verify the worktree is functional after repair
      await assertWorktreeWorks(movedWtDir, 'fixme-branch')
    })

    it('handles multiple matches with user selection', async () => {
      // Setup: Hub with missing worktree, multiple potential matches
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'multi-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'multi-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Create multiple directories with same name
      const dir1 = join(tempDir, 'location1', 'multi-branch')
      const dir2 = join(tempDir, 'location2', 'multi-branch')
      mkdirSync(dirname(dir1), { recursive: true })
      mkdirSync(dirname(dir2), { recursive: true })

      // Move worktree to location1 (has valid .git)
      await moveDir(wtDir, dir1)
      // Create fake directory with same name at location2
      mkdirSync(dir2, { recursive: true })
      writeFileSync(join(dir2, '.git'), 'gitdir: /fake/path\n')

      const { output } = await runCli([hubDir], ['1', 'n'])

      // Should show multiple candidates
      expect(output).toContain('multiple candidates')
      expect(output).toContain('Select which to use')
    })

    it('handles no-match case gracefully', async () => {
      // Setup: Hub with missing worktree that won't be found
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'gone-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'gone-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Delete worktree completely
      rmSync(wtDir, { recursive: true, force: true })

      const { output, exitCode } = await runCli([hubDir])

      // Should show not found message
      expect(output).toContain('Not found:')
      expect(output).toContain('gone-branch')
      expect(output).toContain('No worktrees could be located')
    })

    it('shows repair results summary', async () => {
      // Setup: Hub with missing worktree
      const hubDir = join(tempDir, 'project-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'summary-branch')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'summary-branch', wtDir], { quiet: true, env: isolatedEnv })

      // Move worktree
      const movedWtDir = join(tempDir, 'summary-branch')
      await moveDir(wtDir, movedWtDir)

      const { output } = await runCli([hubDir], ['y'])

      // Should show summary
      expect(output).toContain('Repaired')
      expect(output).toContain('worktree')
    })
  })

  describe('integration scenarios', () => {
    it('full recovery scenario - missing worktrees found and repaired end-to-end', async () => {
      // Setup: Create hub with multiple worktrees
      const hubDir = join(tempDir, 'fulltest-bare')
      await makeHubWithCommit(hubDir)

      // Create feature worktree (will be moved)
      const featWt = join(hubDir, 'feature-x')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature-x', featWt], { quiet: true, env: isolatedEnv })
      await run('git', ['-C', featWt, 'commit', '--allow-empty', '-m', 'feature work'], { quiet: true, env: isolatedEnv })

      // Move feature worktree outside hub
      const externalDir = join(tempDir, 'external')
      await moveDir(featWt, join(externalDir, 'feature-x'))

      // Run CLI and confirm repair
      const { output, exitCode } = await runCli([hubDir], ['y'])

      // Verify repair happened
      expect(exitCode).toBe(0)
      expect(output).toContain('Repaired')

      // Verify worktree is functional
      const repairedWtPath = join(externalDir, 'feature-x')
      await assertWorktreeWorks(repairedWtPath, 'feature-x')
    })

    it('recovery with parent-dir rename scenario', async () => {
      // Setup: Create hub with worktree
      const hubDir = join(tempDir, 'original-name-bare')
      await makeHubWithCommit(hubDir)

      const wtDir = join(hubDir, 'dev')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'dev', wtDir], { quiet: true, env: isolatedEnv })
      await run('git', ['-C', wtDir, 'commit', '--allow-empty', '-m', 'dev work'], { quiet: true, env: isolatedEnv })

      // Move worktree to reflect parent-dir rename
      const newParentDir = join(tempDir, 'renamed-parent')
      await moveDir(wtDir, join(newParentDir, 'dev'))

      // Run CLI with search directory including new parent
      const { output, exitCode } = await runCli([hubDir], ['y'])

      // Should find and repair
      expect(output).toContain('Found')
      expect(output).toContain('dev')

      // Verify repaired worktree works
      const repairedPath = join(newParentDir, 'dev')
      await assertWorktreeWorks(repairedPath, 'dev')
    })

    it('recovery skips worktrees that are already at correct location', async () => {
      // Setup: Hub with worktrees, some missing, some present
      const hubDir = join(tempDir, 'mixed-bare')
      await makeHubWithCommit(hubDir)

      // Create feature worktree that will be moved
      const featWt = join(hubDir, 'feature')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature', featWt], { quiet: true, env: isolatedEnv })

      // Missing worktree
      const missingWt = join(hubDir, 'missing')
      await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'missing', missingWt], { quiet: true, env: isolatedEnv })
      await moveDir(missingWt, join(tempDir, 'missing'))

      const { output } = await runCli([hubDir], ['y'])

      // Should only search for missing worktree
      expect(output).toContain('Searching for missing worktree')
      expect(output).toContain('missing')
      expect(output).toContain('Repaired 1 worktree')
    })
  })
})
