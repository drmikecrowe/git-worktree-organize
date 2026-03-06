/**
 * Minimal shim for `import { $ } from 'bun'` when running under Vitest (Node.js).
 * Implements the tagged-template shell API that the tests use.
 */
import { spawnSync } from 'node:child_process'

class ShellOutput {
  private _stdout: string
  private _stderr: string
  private _exitCode: number

  constructor(stdout: string, stderr: string, exitCode: number) {
    this._stdout = stdout
    this._stderr = stderr
    this._exitCode = exitCode
  }

  text() { return this._stdout }
  get stdout() { return Buffer.from(this._stdout) }
  get stderr() { return Buffer.from(this._stderr) }
  get exitCode() { return this._exitCode }
}

class ShellPromise extends Promise<ShellOutput> {
  private _cmd: string[]

  constructor(cmd: string[]) {
    let resolve_: (v: ShellOutput) => void
    let reject_: (e: unknown) => void
    super((res, rej) => { resolve_ = res; reject_ = rej })
    this._cmd = cmd

    // Run synchronously but resolve asynchronously so it's awaitable
    Promise.resolve().then(() => {
      try {
        const result = spawnSync(cmd[0], cmd.slice(1), {
          encoding: 'utf8',
          stdio: ['inherit', 'pipe', 'pipe'],
        })
        const exitCode = result.status ?? 1
        const out = new ShellOutput(result.stdout ?? '', result.stderr ?? '', exitCode)
        if (exitCode !== 0) {
          const err = new Error(`Command failed: ${cmd.join(' ')}\n${result.stderr ?? ''}`)
          ;(err as any).exitCode = exitCode
          reject_!(err)
        } else {
          resolve_!(out)
        }
      } catch (e) {
        reject_!(e)
      }
    })
  }

  quiet(): ShellPromise {
    // Already quiet (stderr captured, not printed)
    return this
  }
}

function buildCmd(strings: TemplateStringsArray, ...values: unknown[]): string[] {
  // Combine template parts and interpolated values into a flat array of tokens
  const parts: string[] = []
  strings.forEach((str, i) => {
    // Split the static part by whitespace
    parts.push(...str.trim().split(/\s+/).filter(Boolean))
    if (i < values.length) {
      const val = String(values[i]).trim()
      if (val) parts.push(val)
    }
  })
  return parts
}

export function $(strings: TemplateStringsArray, ...values: unknown[]): ShellPromise {
  const cmd = buildCmd(strings, ...values)
  return new ShellPromise(cmd)
}
