import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'
import { describe, it, expect } from 'vitest'
import { detect } from '../src/detect.ts'

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'gwt-detect-'))
}

async function makeCommit(dir: string) {
  await $`git -C ${dir} config user.email "test@test.com"`.quiet()
  await $`git -C ${dir} config user.name "Test"`.quiet()
  await $`git -C ${dir} commit --allow-empty -m "init"`.quiet()
}

describe('detect', () => {
  it('standard: git init + commit → type standard', async () => {
    const dir = tempDir()
    await $`git -C ${dir} init`.quiet()
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
    await $`git -C ${dir} init --bare`.quiet()

    const result = await detect(dir)
    expect(result).toEqual({
      type: 'bare-root',
      gitdir: dir,
    })
  })

  it('bare-dotgit: git init + core.bare=true → type bare-dotgit', async () => {
    const dir = tempDir()
    await $`git -C ${dir} init`.quiet()
    // Set core.bare = true in .git/config
    await $`git -C ${dir} config core.bare true`.quiet()

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
    await $`git -C ${bareDir} init --bare`.quiet()
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
    await $`git -C ${extDir} init --bare`.quiet()
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
    await $`git -C ${mainDir} init`.quiet()
    await makeCommit(mainDir)
    await $`git -C ${mainDir} worktree add ${wtDir}`.quiet()

    await expect(detect(wtDir)).rejects.toThrow('linked worktree')
  })

  it('reject not a git repo: plain dir throws', async () => {
    const dir = tempDir()

    await expect(detect(dir)).rejects.toThrow('not a git repository')
  })
})
