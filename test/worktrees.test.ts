import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './helpers/shell.ts'
import { parsePorcelain, listWorktrees } from '../src/worktrees'

describe('parsePorcelain', () => {
  it('parses a single normal worktree with branch main', () => {
    const input = `worktree /path/to/main
HEAD abc123def456abc123def456abc123def456abc123
branch refs/heads/main
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/path/to/main',
      head: 'abc123def456abc123def456abc123def456abc123',
      branch: 'main',
      isBare: false,
    })
  })

  it('parses multiple worktrees (main + feature branch)', () => {
    const input = `worktree /path/to/main
HEAD abc123def456abc123def456abc123def456abc123
branch refs/heads/main

worktree /path/to/feature
HEAD def456abc123def456abc123def456abc123def456
branch refs/heads/feature
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      path: '/path/to/main',
      head: 'abc123def456abc123def456abc123def456abc123',
      branch: 'main',
      isBare: false,
    })
    expect(result[1]).toEqual({
      path: '/path/to/feature',
      head: 'def456abc123def456abc123def456abc123def456',
      branch: 'feature',
      isBare: false,
    })
  })

  it('parses a worktree with detached HEAD (branch = null, isBare = false)', () => {
    const input = `worktree /path/to/detached
HEAD ghi789abc123ghi789abc123ghi789abc123ghi789
detached
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/path/to/detached',
      head: 'ghi789abc123ghi789abc123ghi789abc123ghi789',
      branch: null,
      isBare: false,
    })
  })

  it('parses a bare worktree (isBare = true, branch = null)', () => {
    const input = `worktree /path/to/bare
HEAD 0000000000000000000000000000000000000000
bare
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/path/to/bare',
      head: '0000000000000000000000000000000000000000',
      branch: null,
      isBare: true,
    })
  })

  it('parses a branch with / in name (feature/my-feature)', () => {
    const input = `worktree /path/to/feature
HEAD abc123def456abc123def456abc123def456abc123
branch refs/heads/feature/my-feature
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/path/to/feature',
      head: 'abc123def456abc123def456abc123def456abc123',
      branch: 'feature/my-feature',
      isBare: false,
    })
  })

  it('parses mixed: bare + linked + detached', () => {
    const input = `worktree /path/to/bare
HEAD 0000000000000000000000000000000000000000
bare

worktree /path/to/linked
HEAD abc123def456abc123def456abc123def456abc123
branch refs/heads/main

worktree /path/to/detached
HEAD def456abc123def456abc123def456abc123def456
detached
`
    const result = parsePorcelain(input)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      path: '/path/to/bare',
      head: '0000000000000000000000000000000000000000',
      branch: null,
      isBare: true,
    })
    expect(result[1]).toEqual({
      path: '/path/to/linked',
      head: 'abc123def456abc123def456abc123def456abc123',
      branch: 'main',
      isBare: false,
    })
    expect(result[2]).toEqual({
      path: '/path/to/detached',
      head: 'def456abc123def456abc123def456abc123def456',
      branch: null,
      isBare: false,
    })
  })
})

describe('listWorktrees', () => {
  it('lists worktrees from a real git repo', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'git-worktree-test-'))
    const repoDir = join(tmpDir, 'repo')
    const linkedDir = join(tmpDir, 'linked')

    // Initialize a git repo with an initial commit
    await run('git', ['init', repoDir], { quiet: true })
    await run('git', ['-C', repoDir, 'config', 'user.email', 'test@example.com'], { quiet: true })
    await run('git', ['-C', repoDir, 'config', 'user.name', 'Test'], { quiet: true })
    await run('touch', [join(repoDir, 'README')], { quiet: true })
    await run('git', ['-C', repoDir, 'add', 'README'], { quiet: true })
    await run('git', ['-C', repoDir, 'commit', '-m', 'init'], { quiet: true })

    // Add a linked worktree on a new branch
    await run('git', ['-C', repoDir, 'worktree', 'add', '-b', 'feature', linkedDir], { quiet: true })

    const worktrees = await listWorktrees(repoDir)

    expect(worktrees.length).toBe(2)

    const main = worktrees.find(w => w.path === repoDir)
    expect(main).toBeDefined()
    // branch name depends on system git default (master or main)
    expect(typeof main!.branch).toBe('string')
    expect(main!.isBare).toBe(false)
    expect(main!.head).toMatch(/^[0-9a-f]{40}$/)

    const linked = worktrees.find(w => w.path === linkedDir)
    expect(linked).toBeDefined()
    expect(linked!.branch).toBe('feature')
    expect(linked!.isBare).toBe(false)
    expect(linked!.head).toMatch(/^[0-9a-f]{40}$/)
  })
})
