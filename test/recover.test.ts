import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { searchForWorktree, findMissingWorktrees, repairWorktree } from '../src/recover.ts'
import { makeTempDir, makeStandardRepo, makeBareHubRepo } from './helpers/repo.ts'
import { run } from './helpers/shell.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

describe('searchForWorktree', () => {
  it('finds matching directory at depth 1', async () => {
    // Setup: create search directory with worktree at depth 1
    const searchDir = makeTempDir()
    const worktreeDir = join(searchDir, 'feature-branch')
    mkdirSync(worktreeDir, { recursive: true })

    // Make it a valid worktree candidate (add .git file)
    writeFileSync(join(worktreeDir, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert
    expect(result.branch).toBe('feature/branch')
    expect(result.sanitizedBranch).toBe('feature-branch')
    expect(result.foundPath).toBe(worktreeDir)
    expect(result.candidates).toHaveLength(1)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('finds matching directory at depth 2', async () => {
    // Setup: create search directory with worktree at depth 2
    const searchDir = makeTempDir()
    const worktreeDir = join(searchDir, 'subdir', 'feature-branch')
    mkdirSync(worktreeDir, { recursive: true })

    // Make it a valid worktree candidate
    writeFileSync(join(worktreeDir, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert
    expect(result.foundPath).toBe(worktreeDir)
    expect(result.candidates).toHaveLength(1)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('finds matching directory at depth 3', async () => {
    // Setup: create search directory with worktree at depth 3
    const searchDir = makeTempDir()
    const worktreeDir = join(searchDir, 'level1', 'level2', 'feature-branch')
    mkdirSync(worktreeDir, { recursive: true })

    // Make it a valid worktree candidate
    writeFileSync(join(worktreeDir, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert
    expect(result.foundPath).toBe(worktreeDir)
    expect(result.candidates).toHaveLength(1)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('returns null when no match found', async () => {
    // Setup: create search directory without matching worktree
    const searchDir = makeTempDir()
    const otherDir = join(searchDir, 'other-directory')
    mkdirSync(otherDir, { recursive: true })
    writeFileSync(join(otherDir, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert
    expect(result.foundPath).toBeNull()
    expect(result.candidates).toHaveLength(0)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('skips hidden dirs, node_modules, .git', async () => {
    // Setup: create search directory with excluded dirs containing matches
    const searchDir = makeTempDir()

    // Hidden directory with match (should be skipped)
    const hiddenDir = join(searchDir, '.hidden', 'feature-branch')
    mkdirSync(hiddenDir, { recursive: true })
    writeFileSync(join(hiddenDir, '.git'), 'gitdir: /some/path\n')

    // node_modules with match (should be skipped)
    const nodeModulesDir = join(searchDir, 'node_modules', 'feature-branch')
    mkdirSync(nodeModulesDir, { recursive: true })
    writeFileSync(join(nodeModulesDir, '.git'), 'gitdir: /some/path\n')

    // .git directory with match (should be skipped)
    const gitSubDir = join(searchDir, '.git', 'feature-branch')
    mkdirSync(gitSubDir, { recursive: true })
    writeFileSync(join(gitSubDir, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert - none should be found since all are in excluded dirs
    expect(result.foundPath).toBeNull()
    expect(result.candidates).toHaveLength(0)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('returns multiple matches when they exist', async () => {
    // Setup: create search directory with multiple matching worktrees
    const searchDir = makeTempDir()

    const worktree1 = join(searchDir, 'dir1', 'feature-branch')
    mkdirSync(worktree1, { recursive: true })
    writeFileSync(join(worktree1, '.git'), 'gitdir: /some/path1\n')

    const worktree2 = join(searchDir, 'dir2', 'feature-branch')
    mkdirSync(worktree2, { recursive: true })
    writeFileSync(join(worktree2, '.git'), 'gitdir: /some/path2\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert - both should be found, foundPath is null (multiple matches)
    expect(result.foundPath).toBeNull()
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates).toContain(worktree1)
    expect(result.candidates).toContain(worktree2)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('validates candidate has .git file', async () => {
    // Setup: create search directory with matching dir but no .git file
    const searchDir = makeTempDir()

    const worktreeNoGit = join(searchDir, 'feature-branch')
    mkdirSync(worktreeNoGit, { recursive: true })
    // No .git file - should not be a valid candidate

    const worktreeWithGit = join(searchDir, 'other-branch')
    mkdirSync(worktreeWithGit, { recursive: true })
    writeFileSync(join(worktreeWithGit, '.git'), 'gitdir: /some/path\n')

    // Execute
    const result = await searchForWorktree('feature/branch', { searchDirs: [searchDir], maxDepth: 3 })

    // Assert - no valid candidates (matching dir has no .git file)
    expect(result.foundPath).toBeNull()
    expect(result.candidates).toHaveLength(0)

    // Cleanup
    rmSync(searchDir, { recursive: true, force: true })
  })
})

describe('findMissingWorktrees', () => {
  it('identifies worktrees with non-existent paths', async () => {
    // Setup: create hub with worktree pointing to non-existent path
    const hubDir = makeTempDir()
    const searchDir = makeTempDir()

    // Create a bare hub repo
    await makeBareHubRepo(hubDir)

    // Create a worktree that exists on disk
    const worktreeDir = join(searchDir, 'feature-branch')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/branch', worktreeDir], { quiet: true, env: isolatedEnv })

    // Now remove the worktree directory to simulate it being moved/missing
    rmSync(worktreeDir, { recursive: true, force: true })

    // Execute
    const results = await findMissingWorktrees(hubDir, [searchDir])

    // Assert - should find the missing worktree
    expect(results).toHaveLength(1)
    expect(results[0].branch).toBe('feature/branch')
    expect(results[0].sanitizedBranch).toBe('feature-branch')

    // Cleanup
    rmSync(hubDir, { recursive: true, force: true })
    rmSync(searchDir, { recursive: true, force: true })
  })

  it('searches all provided directories', async () => {
    // Setup: create hub with missing worktree in specific search dir
    const hubDir = makeTempDir()
    const searchDir1 = makeTempDir()
    const searchDir2 = makeTempDir()

    await makeBareHubRepo(hubDir)

    // Create worktree in searchDir2
    const worktreeDir = join(searchDir2, 'feature-branch')
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/branch', worktreeDir], { quiet: true, env: isolatedEnv })

    // Remove the worktree directory
    rmSync(worktreeDir, { recursive: true, force: true })

    // Create matching directory in searchDir1 (the "moved" location)
    const movedDir = join(searchDir1, 'feature-branch')
    mkdirSync(movedDir, { recursive: true })
    writeFileSync(join(movedDir, '.git'), 'gitdir: /old/path\n')

    // Execute - search both directories
    const results = await findMissingWorktrees(hubDir, [searchDir1, searchDir2])

    // Assert - should find the worktree in searchDir1
    expect(results).toHaveLength(1)
    expect(results[0].foundPath).toBe(movedDir)

    // Cleanup
    rmSync(hubDir, { recursive: true, force: true })
    rmSync(searchDir1, { recursive: true, force: true })
    rmSync(searchDir2, { recursive: true, force: true })
  })
})

describe('repairWorktree', () => {
  it('fixes .git file to point to correct admin dir', async () => {
    // Setup: create hub and worktree with broken .git pointer
    const hubDir = makeTempDir()
    const worktreeDir = makeTempDir()

    await makeBareHubRepo(hubDir)

    // Create a worktree
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/branch', worktreeDir], { quiet: true, env: isolatedEnv })

    // Read the original .git content to get admin name
    const gitFile = join(worktreeDir, '.git')
    const originalContent = require('fs').readFileSync(gitFile, 'utf8')
    const match = originalContent.match(/^gitdir:\s*(.+)/m)
    const adminDir = match![1].trim()
    const adminName = require('path').basename(adminDir)

    // Corrupt the .git file with wrong path (but preserve admin name for realistic scenario)
    writeFileSync(gitFile, `gitdir: /old/hub/.bare/worktrees/${adminName}\n`)

    // Execute
    await repairWorktree(worktreeDir, hubDir)

    // Assert - .git file should now point to correct admin dir
    const repairedContent = require('fs').readFileSync(gitFile, 'utf8')
    expect(repairedContent).toContain(hubDir)
    expect(repairedContent).toContain('.bare/worktrees')
    expect(repairedContent).toContain(adminName)

    // Cleanup
    rmSync(hubDir, { recursive: true, force: true })
    rmSync(worktreeDir, { recursive: true, force: true })
  })

  it('updates admin dir gitdir file', async () => {
    // Setup: create hub and worktree
    const hubDir = makeTempDir()
    const worktreeDir = makeTempDir()

    await makeBareHubRepo(hubDir)
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/branch', worktreeDir], { quiet: true, env: isolatedEnv })

    // Get the admin dir path
    const gitFile = join(worktreeDir, '.git')
    const originalContent = require('fs').readFileSync(gitFile, 'utf8')
    const match = originalContent.match(/^gitdir:\s*(.+)/m)
    const adminDir = match![1].trim()
    const adminName = require('path').basename(adminDir)
    const gitdirFile = join(adminDir, 'gitdir')

    // Corrupt the gitdir file
    writeFileSync(gitdirFile, '/wrong/worktree/path/.git\n')

    // Corrupt the worktree's .git file (preserve admin name)
    writeFileSync(gitFile, `gitdir: /old/hub/.bare/worktrees/${adminName}\n`)

    // Execute
    await repairWorktree(worktreeDir, hubDir)

    // Assert - gitdir file should now point to correct worktree
    const repairedGitdir = require('fs').readFileSync(gitdirFile, 'utf8')
    expect(repairedGitdir.trim()).toBe(`${worktreeDir}/.git`)

    // Cleanup
    rmSync(hubDir, { recursive: true, force: true })
    rmSync(worktreeDir, { recursive: true, force: true })
  })

  it('after repair, git commands work in the worktree', async () => {
    // Setup: create hub and worktree
    const hubDir = makeTempDir()
    const worktreeDir = makeTempDir()

    await makeBareHubRepo(hubDir)
    await run('git', ['-C', hubDir, 'worktree', 'add', '-b', 'feature/branch', worktreeDir], { quiet: true, env: isolatedEnv })

    // Read the original .git content to get admin name
    const gitFile = join(worktreeDir, '.git')
    const originalContent = require('fs').readFileSync(gitFile, 'utf8')
    const match = originalContent.match(/^gitdir:\s*(.+)/m)
    const adminDir = match![1].trim()
    const adminName = require('path').basename(adminDir)

    // Corrupt the .git file (preserve admin name for realistic scenario)
    writeFileSync(gitFile, `gitdir: /old/hub/.bare/worktrees/${adminName}\n`)

    // Execute repair
    await repairWorktree(worktreeDir, hubDir)

    // Assert - git status should work
    await expect(
      run('git', ['-C', worktreeDir, 'status'], { quiet: true, env: isolatedEnv })
    ).resolves.not.toThrow()

    // Cleanup
    rmSync(hubDir, { recursive: true, force: true })
    rmSync(worktreeDir, { recursive: true, force: true })
  })
})
