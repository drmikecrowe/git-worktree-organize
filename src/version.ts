/**
 * Version information for git-worktree-organize.
 *
 * The version is read from package.json and embedded at build time.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Read version from package.json.
 * Uses require.resolve to find package.json relative to this module.
 */
function readVersion(): string {
  // In development, read from package.json directly
  // In production (bundled), this path still works relative to dist/
  const pkgPath = join(import.meta.dirname, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return pkg.version
}

/** The current version string (e.g., "1.0.13") */
export const VERSION = readVersion()

/**
 * Get the version string, optionally with "v" prefix.
 * @param withPrefix - If true, prepend "v" to version
 * @returns Version string like "1.0.13" or "v1.0.13"
 */
export function getVersion(withPrefix = false): string {
  return withPrefix ? `v${VERSION}` : VERSION
}
