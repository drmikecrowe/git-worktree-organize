import { run } from './run.ts'

/**
 * Run a git command and return stdout as a string.
 * Throws if the command exits non-zero.
 */
export async function git(args: string[], options?: { cwd?: string; env?: Record<string, string> }): Promise<string> {
  const result = run('git', args, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
  })
  return result.stdout
}

/**
 * Read a git config value. Returns null if the key is not set.
 */
export async function gitConfig(key: string, options?: { gitdir?: string; cwd?: string }): Promise<string | null> {
  const env: Record<string, string> = {}
  if (options?.gitdir) env['GIT_DIR'] = options.gitdir

  try {
    const result = await git(['config', '--get', key], { cwd: options?.cwd, env })
    return result.trimEnd()
  } catch (err: any) {
    // git config --get exits with code 1 when the key is not set
    if (err?.exitCode === 1) return null
    throw err
  }
}

/**
 * Set a git config value.
 */
export async function setGitConfig(key: string, value: string, options?: { gitdir?: string; cwd?: string }): Promise<void> {
  const env: Record<string, string> = {}
  if (options?.gitdir) env['GIT_DIR'] = options.gitdir

  await git(['config', key, value], { cwd: options?.cwd, env })
}
