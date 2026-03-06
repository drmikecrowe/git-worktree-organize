import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { $ } from 'bun'
import { describe, it, expect } from 'vitest'
import { migrate, resumeMigrate, isPartialMigration } from '../src/migrate.ts'
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

  it('resumeMigrate: source is already partial hub, moves remaining worktrees in-place', async () => {
    // Scenario: source itself has .bare/ + .git (it IS the hub-in-progress)
    // but linked worktrees are still at their original locations outside source/.
    // resumeMigrate(source) should move them in.
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature', 'hotfix'])
    const config = await detect(src)
    const dest = src + '-hub'

    // Partially migrate: run full migrate so hub is set up including main,
    // but then manually undo the feature and hotfix moves to simulate a
    // partial failure after main was moved but before linked worktrees were.
    await migrate(config, { source: src, dest })

    // Move feature and hotfix back to their "original" locations to simulate
    // the partial state (hub exists but linked worktrees still outside).
    const featureDest = join(dest, 'feature')
    const hotfixDest  = join(dest, 'hotfix')
    const featureOrig = dest + '-feature-orig'
    const hotfixOrig  = dest + '-hotfix-orig'
    await $`mv -f ${featureDest} ${featureOrig}`.quiet()
    await $`mv -f ${hotfixDest}  ${hotfixOrig}`.quiet()
    // Update the hub's worktree admin to point back to original paths so git
    // worktree list shows them as outside dest/.
    await $`git -C ${dest} worktree repair ${featureOrig}`.quiet()
    await $`git -C ${dest} worktree repair ${hotfixOrig}`.quiet()

    // Now simulate the user re-running on dest (which is the partial hub)
    expect(isPartialMigration(dest)).toBe(true)

    const logs: string[] = []
    await resumeMigrate(dest, msg => logs.push(msg))

    // Both worktrees should now be inside dest/
    await assertWorktreeWorks(dest, 'feature')
    await assertWorktreeWorks(dest, 'hotfix')
    expect(existsSync(join(dest, 'feature'))).toBe(true)
    expect(existsSync(join(dest, 'hotfix'))).toBe(true)
    // Originals should be gone
    expect(existsSync(featureOrig)).toBe(false)
    expect(existsSync(hotfixOrig)).toBe(false)
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
