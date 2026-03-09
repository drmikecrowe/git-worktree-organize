import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { run } from './helpers/shell.ts'
import { describe, it, expect } from 'vitest'
import { migrate, migrateInPlace, resumeMigrate, repairHub, findHub, isPartialMigration } from '../src/migrate.ts'
import { detect } from '../src/detect.ts'
import {
  makeStandardRepo,
  makeBareRootRepo,
  makeBareHubRepo,
  assertHubStructure,
  assertWorktreeWorks,
  makeTempDir,
} from './helpers/repo.ts'

/** Environment for isolated git operations (ignores user's ~/.gitconfig) */
const isolatedEnv = { GIT_CONFIG_GLOBAL: '/dev/null' }

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
    await run('git', ['init', src], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', src, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', src, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', src, 'commit', '--allow-empty', '-m', 'init'], { quiet: true, env: isolatedEnv })
    // Create first worktree with branch 'a/b' in dir 'wt1'
    const wt1 = join(src + '-wt1')
    await run('git', ['-C', src, 'worktree', 'add', '-b', 'a/b', wt1], { quiet: true, env: isolatedEnv })
    // Create second worktree with branch 'a-b' in dir 'wt2'
    const wt2 = join(src + '-wt2')
    await run('git', ['-C', src, 'worktree', 'add', '-b', 'a-b', wt2], { quiet: true, env: isolatedEnv })

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
    await run('mv', ['-f', featureDest, featureOrig], { quiet: true })
    await run('mv', ['-f', hotfixDest, hotfixOrig], { quiet: true })
    // Update the hub's worktree admin to point back to original paths so git
    // worktree list shows them as outside dest/.
    await run('git', ['-C', dest, 'worktree', 'repair', featureOrig], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', dest, 'worktree', 'repair', hotfixOrig], { quiet: true, env: isolatedEnv })

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

  it('resumeMigrate: repairs worktrees that are at correct location but have stale .git (parent-dir rename scenario)', async () => {
    // Simulates recovery-1 from the field:
    // - Hub was at old/main-bare/ with worktrees inside it
    // - User renamed old/ → old.bak/, so worktrees moved with it
    // - resumeMigrate(old.bak/main-bare/) should find the worktrees already at
    //   dest/branch and fix their .git files instead of skipping them.
    const tmp = makeTempDir()
    const base = join(tmp, 'project')
    const hubDir = join(base, 'main-bare')
    mkdirSync(hubDir, { recursive: true })

    // Build a hub with one worktree already inside it
    const srcForHub = makeTempDir()
    await makeStandardRepo(srcForHub, ['feature'])
    const config = await detect(srcForHub)
    await migrate(config, { source: srcForHub, dest: hubDir })

    // Now rename base/ → base.old/ (simulating user renaming the parent dir)
    const baseOld = join(tmp, 'project.old')
    await run('mv', ['-f', base, baseOld], { quiet: true })

    const dest = join(baseOld, 'main-bare')
    // resumeMigrate should detect the worktrees are already at dest/feature
    // (they moved with the rename) and repair their .git files
    const logs: string[] = []
    await resumeMigrate(dest, msg => logs.push(msg))

    await assertHubStructure(dest)
    await assertWorktreeWorks(dest, 'main')
    await assertWorktreeWorks(dest, 'feature')
  })

  it('resumeMigrate: moves worktrees at wrong sub-path inside dest and repairs .git (nested-path scenario)', async () => {
    // Simulates recovery-2 from the field:
    // - Hub is at dest/ but worktrees ended up at dest/sub/feature instead of
    //   dest/feature (wrong nesting, e.g. after manual recovery steps)
    // - resumeMigrate(dest/) should detect the mismatch, move them, and fix .git
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    // Move feature worktree into a wrong sub-path inside dest/
    const subDir = join(dest, 'sub')
    mkdirSync(subDir, { recursive: true })
    const featureCorrect = join(dest, 'feature')
    const featureWrong   = join(subDir, 'feature')
    await run('mv', ['-f', featureCorrect, featureWrong], { quiet: true })
    // Update git's record so it knows about the new (wrong) location
    await run('git', ['-C', dest, 'worktree', 'repair', featureWrong], { quiet: true, env: isolatedEnv })

    // resumeMigrate should detect feature is at dest/sub/feature (!= dest/feature)
    // and move it to dest/feature, fixing .git files
    const logs: string[] = []
    await resumeMigrate(dest, msg => logs.push(msg))

    await assertWorktreeWorks(dest, 'main')
    await assertWorktreeWorks(dest, 'feature')
    expect(existsSync(join(dest, 'feature'))).toBe(true)
    expect(existsSync(featureWrong)).toBe(false)
  })

  it('migrates when source parent dir was renamed (stale worktree paths point to dest)', async () => {
    // Scenario: repo was originally at base/main with a linked worktree at
    // base/main-worktrees/feature (inside the same parent). Git records the
    // absolute worktree path as base/main-worktrees/feature.
    // User renames base/ → base.old/, then runs:
    //   git-worktree-organize base.old/main base
    // Git still records the worktree at base/main-worktrees/feature (doesn't
    // exist), but it actually lives at base.old/main-worktrees/feature.
    // migrate() should detect and remap these stale paths.
    const tmp = makeTempDir()
    const base = join(tmp, 'expense')
    const sourceOrig = join(base, 'main')
    mkdirSync(sourceOrig, { recursive: true })
    await run('git', ['init', '--initial-branch=main', sourceOrig], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', sourceOrig, 'config', 'user.email', 'test@test.com'], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', sourceOrig, 'config', 'user.name', 'Test'], { quiet: true, env: isolatedEnv })
    await run('git', ['-C', sourceOrig, 'commit', '--allow-empty', '-m', 'init'], { quiet: true, env: isolatedEnv })

    // Add worktree inside base/ (sibling of 'main')
    const wtDir = join(base, 'main-worktrees', 'feature')
    mkdirSync(dirname(wtDir), { recursive: true })
    await run('git', ['-C', sourceOrig, 'worktree', 'add', '-b', 'feature', wtDir], { quiet: true, env: isolatedEnv })

    // Rename base/ → base.old/ (parent dir renamed, git paths now stale)
    const baseOld = join(tmp, 'expense.old')
    await run('mv', ['-f', base, baseOld], { quiet: true })

    const source = join(baseOld, 'main')
    const dest = base  // same path as the original base (= 'expense')

    const config = await detect(source)
    await migrate(config, { source, dest })

    await assertHubStructure(dest)
    await assertWorktreeWorks(dest, 'main')
    await assertWorktreeWorks(dest, 'feature')
  })

  it('findHub: returns hub when given hub path itself', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src)
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    expect(findHub(dest)).toBe(dest)
  })

  it('findHub: returns hub when given a worktree path inside the hub', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    // findHub from the feature worktree should navigate up to dest
    expect(findHub(join(dest, 'feature'))).toBe(dest)
  })

  it('findHub: returns null when no hub ancestor exists', async () => {
    expect(findHub('/tmp')).toBeNull()
  })

  it('repairHub: fixes stale .git files for worktrees already at correct location', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    // Corrupt the .git file of the feature worktree (stale admin path)
    const featurePath = join(dest, 'feature')
    writeFileSync(join(featurePath, '.git'), 'gitdir: /nonexistent/old/path\n')

    const logs: string[] = []
    await repairHub(dest, msg => logs.push(msg))

    // .git file should now point to the correct admin dir
    await assertWorktreeWorks(dest, 'feature')
    expect(logs.some(l => l.includes('feature'))).toBe(true)
  })

  it('repairHub: skips worktrees whose .git is already correct', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    const logs: string[] = []
    await repairHub(dest, msg => logs.push(msg))

    // Nothing to repair — logs should be empty
    expect(logs).toHaveLength(0)
  })

  it('resumeMigrate: repairHub pass fixes stale .git for in-place worktrees', async () => {
    // Simulate: worktree IS at the expected location (git admin was updated
    // via worktree repair) but the worktree's own .git file is still stale.
    // resumeMigrate should call repairHub and fix it.
    const src = makeTempDir()
    await makeStandardRepo(src, ['feature'])
    const config = await detect(src)
    const dest = src + '-hub'
    await migrate(config, { source: src, dest })

    // Corrupt only the worktree .git file (leave admin gitdir correct)
    const featurePath = join(dest, 'feature')
    writeFileSync(join(featurePath, '.git'), 'gitdir: /nonexistent/old/path\n')

    // git worktree list still reports feature at dest/feature (admin gitdir is
    // correct) so the pending filter sees wt.path === expectedPath → skips it.
    // The repairHub pass at the end of resumeMigrate should catch and fix it.
    const logs: string[] = []
    await resumeMigrate(dest, msg => logs.push(msg))

    await assertWorktreeWorks(dest, 'feature')
  })

  it('throws if dest/.bare already exists', async () => {
    const src = makeTempDir()
    await makeStandardRepo(src)
    const config = await detect(src)
    const dest = src + '-hub'
    await makeBareHubRepo(dest)  // creates dest/.bare already

    await expect(migrate(config, { source: src, dest })).rejects.toThrow('already exists')
  })

  describe('AGENTS.md', () => {
    it('migrate creates AGENTS.md in destination when not present', async () => {
      const src = makeTempDir()
      await makeStandardRepo(src)
      const config = await detect(src)
      const dest = src + '-hub'

      await migrate(config, { source: src, dest })

      const agentsPath = join(dest, 'AGENTS.md')
      expect(existsSync(agentsPath)).toBe(true)
      const content = readFileSync(agentsPath, 'utf8')
      expect(content).toContain('Git Worktree Layout')
      expect(content).toContain('.bare/')
    })

    it('migrate does not overwrite existing AGENTS.md at hub root', async () => {
      const src = makeTempDir()
      await makeStandardRepo(src)
      const config = await detect(src)
      const dest = src + '-hub'

      await migrate(config, { source: src, dest })

      // Now overwrite the AGENTS.md with custom content
      writeFileSync(join(dest, 'AGENTS.md'), 'custom content\n')

      // Migrate another repo to the same dest won't work (dest/.bare exists),
      // so test writeAgentsMd directly
      const { writeAgentsMd } = await import('../src/migrate.ts')
      writeAgentsMd(dest)

      expect(readFileSync(join(dest, 'AGENTS.md'), 'utf8')).toBe('custom content\n')
    })

    it('migrateInPlace creates AGENTS.md in hub when not present', async () => {
      const src = makeTempDir()
      await makeStandardRepo(src)

      const hubPath = await migrateInPlace(src)

      const agentsPath = join(hubPath, 'AGENTS.md')
      expect(existsSync(agentsPath)).toBe(true)
      const content = readFileSync(agentsPath, 'utf8')
      expect(content).toContain('Git Worktree Layout')
    })

    it('migrateInPlace does not overwrite existing AGENTS.md at hub root', async () => {
      const src = makeTempDir()
      await makeStandardRepo(src)

      const hubPath = await migrateInPlace(src)

      // Overwrite with custom content, then call writeAgentsMd again
      writeFileSync(join(hubPath, 'AGENTS.md'), 'my custom agents doc\n')

      const { writeAgentsMd } = await import('../src/migrate.ts')
      writeAgentsMd(hubPath)

      expect(readFileSync(join(hubPath, 'AGENTS.md'), 'utf8')).toBe('my custom agents doc\n')
    })
  })
})
