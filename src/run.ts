import { spawnSync } from 'node:child_process'

export interface RunResult {
  stdout: string
  stderr: string
}

/**
 * Run a command synchronously. Throws on non-zero exit.
 */
export function run(cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): RunResult {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: options?.cwd,
    env: options?.env ?? process.env,
  })
  if (result.status !== 0) {
    const err: any = new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr?.trim() || result.error?.message}`)
    err.exitCode = result.status
    err.stderr = result.stderr
    throw err
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}
