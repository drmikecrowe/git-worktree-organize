# Phase 1: Runtime Migration - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Bun bundler with a Node.js-compatible build toolchain, Remove Bun-specific devDependencies, ensure build artifacts work without Bun runtime APIs.

**NOT in scope:** Test migration (Phase 2), adding new features, changing CLI behavior.

</domain>

<decisions>
## Implementation Decisions

### Build Tool
- **Bundler:** esbuild (replaces `bun build`)
- **Invocation:** `npx esbuild` — no devDependency needed
- **Target:** `--platform=node` only (let esbuild auto-detect Node features)
- **Output:** `dist/cli.js` (no change from current)
- **Config location:** Inline in package.json scripts (no separate config file)
- **Build command:** `npx esbuild src/cli.ts --outfile dist/cli.js --platform=node --bundle`

### TypeScript Config
- **Types:** Replace `bun-types` with `@types/node` only
- **Target/Module:** Keep `ESNext` (esbuild handles actual transpilation)
- **tsconfig.json change:** Update `types` array from `["bun-types"]` to `["node"]`

### Package.json Scripts
- **build:** `npx esbuild src/cli.ts --outfile dist/cli.js --platform=node --bundle`
- **prepublishOnly:** `npm run build` (use npm instead of bun)
- **test:** Keep `bun test` for now — Phase 2 handles test migration

### Claude's Discretion
- Exact esbuild version resolution (npx uses latest)
- Whether to add `--minify` flag
- Whether to add `--sourcemap` flag
- Any additional tsconfig.json cleanup (strict settings, lib settings)

</decisions>

<specifics>
## Specific Ideas

- Build should feel the same to users: `npm run build` produces a working CLI
- Published package continues to work identically — only the build process changes
- Keep zero runtime dependencies constraint

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli.ts`: Entry point with shebang — no changes needed
- `package.json`: Structure stays the same, just script commands change
- `tsconfig.json`: Same structure, just `types` array change

### Established Patterns
- Single-file bundle output (`dist/cli.js`)
- ESM module type (`"type": "module"`)
- TypeScript strict mode — no changes needed
- `.ts` extension imports — esbuild handles these natively

### Integration Points
- `npm run build` → produces `dist/cli.js`
- `npm publish` → triggers prepublishOnly → build
- `npm test` → still uses bun (Phase 2 changes this)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-runtime-migration*
*Context gathered: 2026-03-07*
