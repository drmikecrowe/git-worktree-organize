/**
 * Shell helper module that replaces Bun's `$` tagged-template API with a
 * function-based approach using Node.js spawn.
 *
 * This provides a simpler, more testable API for executing shell commands
 * in the test suite without depending on Bun's runtime.
 */
import { spawn } from 'node:child_process'

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Options for the run() function.
 */
export interface RunOptions {
  /** Suppress stdout/stderr output to console (capture only) */
  quiet?: boolean
  /** Working directory for the command */
  cwd?: string
  /** Environment variables to merge with process.env */
  env?: Record<string, string>
}

/**
 * Execute a shell command and return the result.
 *
 * @param cmd - The command to execute (e.g., 'git', 'echo')
 * @param args - Array of arguments to pass to the command
 * @param options - Optional configuration (quiet, cwd)
 * @returns Promise resolving to ShellResult with stdout, stderr, exitCode
 * @throws Error with exitCode property on non-zero exit code
 *
 * @example
 * // Simple command
 * const result = await run('echo', ['hello'])
 * console.log(result.stdout) // 'hello\n'
 *
 * @example
 * // With options
 * const result = await run('git', ['status'], { quiet: true, cwd: '/path/to/repo' })
 */
export async function run(
  cmd: string,
  args: string[],
  options?: RunOptions
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      if (!options?.quiet) {
        process.stdout.write(chunk)
      }
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      if (!options?.quiet) {
        process.stderr.write(chunk)
      }
    })

    child.on('close', (code) => {
      const exitCode = code ?? 1
      const result: ShellResult = {
        stdout,
        stderr,
        exitCode,
      }

      if (exitCode !== 0) {
        const error = new Error(
          `Command failed: ${cmd} ${args.join(' ')}\n${stderr}`
        ) as Error & { exitCode: number }
        error.exitCode = exitCode
        reject(error)
      } else {
        resolve(result)
      }
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}
