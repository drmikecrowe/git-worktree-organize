import { statSync, renameSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { run } from './run.ts'

/**
 * Move `src` to `dest`.
 * Uses rename() on the same filesystem; falls back to copy+delete across filesystems.
 * Handles the case where dest doesn't exist by statting dest's parent for the filesystem check.
 */
export async function move(src: string, dest: string): Promise<void> {
  const destForStat = existsSync(dest) ? dest : dirname(dest)
  if (samefs(src, destForStat)) {
    renameSync(src, dest)
  } else {
    run('cp', ['-a', src, dest])
    run('rm', ['-rf', src])
  }
}

/**
 * Returns true if `a` and `b` are on the same filesystem (same device number).
 */
export function samefs(a: string, b: string): boolean {
  return statSync(a).dev === statSync(b).dev
}
