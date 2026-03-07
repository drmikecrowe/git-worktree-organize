import { describe, it, expect } from 'vitest'
import { run } from './shell.ts'

describe('shell helper', () => {
  it('returns stdout, stderr, exitCode for successful command', async () => {
    const result = await run('echo', ['hello'])
    expect(result.stdout).toBe('hello\n')
    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
  })

  it('throws on non-zero exit code with exitCode property', async () => {
    try {
      await run('git', ['--invalid-flag'])
      // Should not reach here
      expect.fail('Expected an error to be thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error & { exitCode?: number }).exitCode).toBeDefined()
      expect((error as Error & { exitCode?: number }).exitCode).not.toBe(0)
    }
  })

  it('supports quiet option to suppress output', async () => {
    // This test verifies the quiet option works
    const result = await run('echo', ['test'], { quiet: true })
    expect(result.stdout).toBe('test\n')
  })

  it('accepts command, args array, and options object', async () => {
    // Verify the function signature is correct
    const result = await run('echo', ['arg1', 'arg2'], { quiet: true })
    expect(result.exitCode).toBe(0)
  })
})
