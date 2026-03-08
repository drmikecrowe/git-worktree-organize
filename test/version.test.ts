/**
 * Tests for version module.
 */
import { describe, it, expect } from 'vitest'
import { VERSION, getVersion } from '../src/version.ts'

describe('version', () => {
  it('exports VERSION constant', () => {
    expect(VERSION).toBeDefined()
    expect(typeof VERSION).toBe('string')
  })

  it('VERSION matches semver pattern', () => {
    // Should be like "1.0.13" or "1.1.0"
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('getVersion returns version string', () => {
    const version = getVersion()
    expect(version).toBe(VERSION)
  })

  it('getVersion includes "v" prefix option', () => {
    const version = getVersion(true)
    expect(version).toBe(`v${VERSION}`)
  })
})
