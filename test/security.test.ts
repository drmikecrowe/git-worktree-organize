import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detect } from '../src/detect.ts'

describe('security', () => {
  it('detect() rejects a .git file pointing to a non-git directory (path traversal guard)', async () => {
    // Simulates a malicious repo whose .git file points at an arbitrary
    // directory (e.g. ~/.ssh) rather than a real git object store.
    // A secure detect() must throw rather than return that path as config.gitdir,
    // preventing migrate() from cp -a'ing the sensitive directory into dest/.bare/.

    // --- Step 1: Create the "sensitive" directory (plain dir, not a git repo) ---
    const sensitiveDir = mkdtempSync(join(tmpdir(), 'git-wto-sensitive-'))
    writeFileSync(join(sensitiveDir, 'secret.txt'), 'sensitive data')

    // --- Step 2: Create a malicious repo with .git pointing at the sensitive dir ---
    const maliciousRepo = mkdtempSync(join(tmpdir(), 'git-wto-malicious-'))
    writeFileSync(join(maliciousRepo, '.git'), `gitdir: ${sensitiveDir}\n`)

    // --- Step 3: detect() must throw — the gitdir is not a git object store ---
    await expect(detect(maliciousRepo)).rejects.toThrow('gitdir does not appear to be a git repository')
  })
})
