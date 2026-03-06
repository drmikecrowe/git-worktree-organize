import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { $ } from 'bun'
import { describe, it, expect } from 'vitest'
import { migrate } from '../src/migrate.ts'
import { detect } from '../src/detect.ts'
import {
  makeStandardRepo,
  makeBareRootRepo,
  makeBareHubRepo,
  assertHubStructure,
  assertWorktreeWorks,
  makeTempDir,
} from './helpers/repo.ts'

describe('migrate', () => {
  it('standard repo with extra worktree → hub layout', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'

    await migrate(config, { source: src, dest })

    await assertHubStructure(dest)
    await assertWorktreeWorks(dest, 'main')
    await assertWorktreeWorks(dest, 'feature')
  })

  it('standard repo with no extra worktrees → hub with just main', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src)
    const config = await detect(src)
    const dest = src + '-hub'

    await migrate(config, { source: src, dest })

    await assertHubStructure(dest)
    await assertWorktreeWorks(dest, 'main')
  })

  it('bare-root repo → hub layout', async () => {
    const src = makeTempDir()
    await makeBareRootRepo(src)
    const config = await detect(src)
    expect(config.type).toBe('bare-root')
    const dest = src + '-hub'

    await migrate(config, { source: src, dest })

    await assertHubStructure(dest)
  })

  it('bare-hub repo → new location', async () => {
    const src = makeTempDir()
    await makeBareHubRepo(src)
    const config = await detect(src)
    expect(config.type).toBe('bare-hub')
    const dest2 = src + '-hub2'

    await migrate(config, { source: src, dest: dest2 })

    await assertHubStructure(dest2)
  })

  it('branch with / → sanitized to - in directory name', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature/my-feature'])
    const config = await detect(src)
    const dest = src + '-hub'

    await migrate(config, { source: src, dest })

    await assertHubStructure(dest)
    await assertWorktreeWorks(dest, 'main')
    await assertWorktreeWorks(dest, 'feature/my-feature')
    // The directory should be named feature-my-feature
    expect(existsSync(join(dest, 'feature-my-feature'))).toBe(true)
  })

  it('branch name collision → throws with collision message', async () => {
    const src = makeTempDir()
    // Create a standard repo with two branches that sanitize to the same name:
    // 'a/b' → 'a-b' and 'a-b' → 'a-b'
    // We use different worktree directory names to avoid the filesystem conflict.
    await $`git init ${src}`.quiet()
    await $`git -C ${src} config user.email "test@test.com"`.quiet()
    await $`git -C ${src} config user.name "Test"`.quiet()
    await $`git -C ${src} commit --allow-empty -m "init"`.quiet()
    // Create first worktree with branch 'a/b' in dir 'wt1'
    const wt1 = join(src + '-wt1')
    await $`git -C ${src} worktree add -b ${'a/b'} ${wt1}`.quiet()
    // Create second worktree with branch 'a-b' in dir 'wt2'
    const wt2 = join(src + '-wt2')
    await $`git -C ${src} worktree add -b ${'a-b'} ${wt2}`.quiet()

    const config = await detect(src)
    const dest = src + '-hub'

    await expect(migrate(config, { source: src, dest })).rejects.toThrow('collision')
  })

  it('default dest derivation when dest is empty string', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src)
    const config = await detect(src)

    const result = await migrate(config, { source: src, dest: '' })

    const expectedDest = join(dirname(src), basename(src) + '-bare')
    expect(result).toBe(expectedDest)
    await assertHubStructure(expectedDest)
  })

  it('throws if dest/.bare already exists', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src)
    const config = await detect(src)
    const dest = src + '-hub'
    await makeBareHubRepo(dest)  // creates dest/.bare already

    await expect(migrate(config, { source: src, dest })).rejects.toThrow('already exists')
  })
})
