import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './helpers/shell.ts'
import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'gwt-detect-'))
}

async function makeCommit(dir: string) {
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
  await run('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'init'], { quiet: true, env: isolatedEnv })
}

describe('detect', () => {
  it('standard: git init + commit → type standard', async () => {
    const dir = tempDir()
    await run('git', ['-C', dir, 'init'], { quiet: true, env: isolatedEnv })
    await makeCommit(dir)

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'standard',
      gitdir: join(dir, '.git'),
      mainWorktree: dir,
    })
  })

  it('bare-root: git init --bare → type bare-root', async () => {
    const dir = tempDir()
    await run('git', ['-C', dir, 'init', '--bare'], { quiet: true, env: isolatedEnv })

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'bare-root',
      gitdir: dir,
    })
  })

  it('bare-dotgit: git init + core.bare=true → type bare-dotgit', async () => {
    const dir = tempDir()
    await run('git', ['-C', dir, 'init'], { quiet: true, env: isolatedEnv })
    // Set core.bare = true in .git/config
    await run('git', ['-C', dir, 'config', 'core.bare', 'true'], { quiet: true, env: isolatedEnv })

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'bare-dotgit',
      gitdir: join(dir, '.git'),
    })
  })

  it('bare-hub: .git file pointing to .bare dir → type bare-hub', async () => {
    const dir = tempDir()
    const bareDir = join(dir, '.bare')
    mkdirSync(bareDir)
    await run('git', ['-C', bareDir, 'init', '--bare'], { quiet: true, env: isolatedEnv })
    writeFileSync(join(dir, '.git'), 'gitdir: ./.bare\n')

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'bare-hub',
      gitdir: bareDir,
    })
  })

  it('bare-external: .git file pointing to external gitdir → type bare-external', async () => {
    const dir = tempDir()
    const extDir = join(dir, 'extgit')
    mkdirSync(extDir)
    await run('git', ['-C', extDir, 'init', '--bare'], { quiet: true, env: isolatedEnv })
    writeFileSync(join(dir, '.git'), 'gitdir: ./extgit\n')

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'bare-external',
      gitdir: extDir,
    })
  })

  it('reject linked worktree: detect on worktree dir throws', async () => {
    const mainDir = tempDir()
    const wtDir = join(tempDir(), 'wt')
    await run('git', ['-C', mainDir, 'init'], { quiet: true, env: isolatedEnv })
    await makeCommit(mainDir)
    await run('git', ['-C', mainDir, 'worktree', 'add', wtDir], { quiet: true, env: isolatedEnv })

    await expect(detect(wtDir)).rejects.toThrow('linked worktree')
  })

  it('reject not a git repo: plain dir throws', async () => {
    const dir = tempDir()

    await expect(detect(dir)).rejects.toThrow('not a git repository')
  })
})
