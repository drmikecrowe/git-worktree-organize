---
phase: 01-runtime-migration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
autonomous: true
requirements:
  - RUNTIME-01
  - RUNTIME-02
  - RUNTIME-03
user_setup: []
must_haves:
  truths:
    - "User can run `npm run build` successfully without Bun installed"
    - "User can execute built CLI with `node dist/cli.js` on any Node.js 18+ system"
    - "Package.json contains only Node.js-compatible devDependencies (no Bun-specific packages)"
    - "All build artifacts work without Bun runtime APIs"
  artifacts:
    - path: "package.json"
      provides: "Build scripts and dependencies"
      contains: "esbuild"
    - path: "tsconfig.json"
      provides: "TypeScript configuration with Node types"
      contains: '"node"'
  key_links:
    - from: "npm run build"
      to: "npx esbuild"
      via: "package.json scripts.build"
      pattern: "npx esbuild.*--platform=node"
    - from: "tsconfig.json"
      to: "@types/node"
      via: "types array"
      pattern: '"types".*"node"'
---

<objective>
Replace Bun build toolchain with Node.js-compatible esbuild, enabling developers to build and run the CLI without Bun installed.

Purpose: Remove Bun as a development dependency, making the project accessible to any Node.js developer.
Output: Updated package.json and tsconfig.json that work with Node.js toolchain only.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-runtime-migration/01-CONTEXT.md

## Current State

**package.json (relevant sections):**
```json
{
  "scripts": {
    "build": "bun build src/cli.ts --outfile dist/cli.js --target node",
    "prepublishOnly": "bun run build",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["bun-types"],
    "skipLibCheck": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Update package.json for Node.js build toolchain</name>
  <files>package.json</files>
  <behavior>
    - Test 1: `npm run build` exits with code 0
    - Test 2: After build, `node dist/cli.js --help` outputs usage text
    - Test 3: `node dist/cli.js` runs without errors on Node.js 18+
  </behavior>
  <action>
Update package.json with the following changes:

1. **Replace the build script:**
   - Change: `"build": "bun build src/cli.ts --outfile dist/cli.js --target node"`
   - To: `"build": "npx esbuild src/cli.ts --outfile dist/cli.js --platform=node --bundle"`

2. **Replace the prepublishOnly script:**
   - Change: `"prepublishOnly": "bun run build"`
   - To: `"prepublishOnly": "npm run build"`

3. **Keep test script unchanged** (Phase 2 handles test migration):
   - Keep: `"test": "bun test"`

4. **Replace devDependencies:**
   - Remove: `"@types/bun": "latest"`
   - Add: `"@types/node": "^20.0.0"`

The final devDependencies should be:
```json
"devDependencies": {
  "@types/node": "^20.0.0",
  "typescript": "^5.0.0",
  "vitest": "^2.0.0"
}
```

Rationale (per user decision):
- Using `npx esbuild` means no devDependency for esbuild needed
- Using `@types/node` version ^20.0.0 for Node.js 18+ compatibility
- Test migration is Phase 2 scope, so `bun test` stays for now
</action>
  <verify>
    <automated>node -e "const p = require('./package.json'); console.log('build:', p.scripts.build); console.log('prepublishOnly:', p.scripts.prepublishOnly); console.log('has @types/node:', p.devDependencies['@types/node'] ? 'YES' : 'NO'); console.log('has @types/bun:', p.devDependencies['@types/bun'] ? 'YES (BAD)' : 'NO (GOOD)'); process.exit(p.devDependencies['@types/bun'] ? 1 : 0)"</automated>
  </verify>
  <done>package.json has esbuild build script, npm prepublishOnly, @types/node instead of @types/bun</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update tsconfig.json for Node.js types</name>
  <files>tsconfig.json</files>
  <behavior>
    - Test 1: `npx tsc --noEmit` exits with code 0
    - Test 2: TypeScript resolves node:* imports without errors
  </behavior>
  <action>
Update tsconfig.json to use Node.js types instead of Bun types:

1. **Replace the types array:**
   - Change: `"types": ["bun-types"]`
   - To: `"types": ["node"]`

All other settings remain unchanged (ESNext target/module, bundler resolution, strict mode, etc.) as esbuild handles the actual transpilation.

The final tsconfig.json should be:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Rationale (per user decision):
- `@types/node` provides Node.js standard library type definitions
- ESNext target/module preserved since esbuild handles transpilation
- bundler moduleResolution works with esbuild's bundling strategy
</action>
  <verify>
    <automated>node -e "const t = require('./tsconfig.json'); console.log('types:', JSON.stringify(t.compilerOptions.types)); process.exit(t.compilerOptions.types.includes('node') &amp;&amp; !t.compilerOptions.types.includes('bun-types') ? 0 : 1)"</automated>
  </verify>
  <done>tsconfig.json has "types": ["node"] instead of "types": ["bun-types"]</done>
</task>

<task type="auto">
  <name>Task 3: Install dependencies and verify build</name>
  <files>package.json (lockfile update)</files>
  <action>
After the package.json and tsconfig.json changes:

1. **Install the new dependency:**
   ```bash
   npm install
   ```
   This installs `@types/node` and updates package-lock.json.

2. **Verify TypeScript compilation:**
   ```bash
   npx tsc --noEmit
   ```

3. **Build the CLI:**
   ```bash
   npm run build
   ```

4. **Verify the built CLI works:**
   ```bash
   node dist/cli.js --help
   ```

The build must:
- Complete without errors
- Produce `dist/cli.js` with the shebang `#!/usr/bin/env node`
- Execute correctly when run with `node dist/cli.js --help`
</action>
  <verify>
    <automated>npm run build && node dist/cli.js --help | grep -q "Usage: git-worktree-organize"</automated>
  </verify>
  <done>
    - `npm install` completes successfully
    - `npx tsc --noEmit` passes without errors
    - `npm run build` produces dist/cli.js
    - `node dist/cli.js --help` outputs usage text
  </done>
</task>

</tasks>

<verification>
## Build Verification

After all tasks complete, verify:

1. **No Bun required for build:**
   ```bash
   # In a clean environment (no Bun), run:
   npm install
   npm run build
   ```
   Expected: Build succeeds without errors

2. **Built CLI runs on Node.js:**
   ```bash
   node dist/cli.js --help
   ```
   Expected: Usage text displayed

3. **TypeScript compiles with Node types:**
   ```bash
   npx tsc --noEmit
   ```
   Expected: No type errors

4. **No Bun-specific devDependencies:**
   ```bash
   grep -c "@types/bun" package.json
   ```
   Expected: 0 (not found)
</verification>

<success_criteria>
- [ ] `npm run build` succeeds without Bun installed
- [ ] `node dist/cli.js --help` outputs usage text
- [ ] `package.json` has no Bun-specific devDependencies
- [ ] `tsconfig.json` uses `@types/node` instead of `bun-types`
- [ ] `npx tsc --noEmit` passes without errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-runtime-migration/01-SUMMARY.md`
</output>
