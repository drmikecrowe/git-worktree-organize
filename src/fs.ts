import { statSync, renameSync } from 'node:fs'
import { run } from './run.ts'

/**
 * Move `src` to `dest`.
 * Uses rename() on the same filesystem; falls back to copy+delete across filesystems.
 */
export async function move(src: string, dest: string): Promise<void> {
  if (samefs(src, dest)) {
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
