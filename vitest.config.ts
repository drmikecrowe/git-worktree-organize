import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      bun: resolve(__dirname, 'test/__bun-shim__.ts'),
    },
  },
  test: {
    globals: false,
  },
})
