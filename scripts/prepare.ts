/**
 * `prepare` entry point: build the two published faces from source.
 *
 * A git install fetches SOURCE, so pnpm runs this after checkout and nothing
 * else builds the package. Two constraints shape it:
 *
 * 1. It may only use dependencies that resolve from a plain registry. tsdown
 *    cannot be one: its graph reaches harness-internal packages that are not
 *    published (`@deepseek-ai/dsh-type-meta`), so a bare checkout can never
 *    install it. esbuild has no such dependency and is the bundler here.
 * 2. Under the Desktop the runtime's `node` is Electron in RunAsNode mode, so
 *    this drives esbuild's JS API rather than spawning a CLI.
 *
 * The host face keeps @deepseek-ai/* external (the running harness supplies
 * them); the browser face reproduces the ModuleLoader factory contract.
 *
 * @module dsh-grafana-plugin/prepare
 */
import { mkdirSync } from 'node:fs'
import { build } from 'esbuild'
import { CLIENT_EXTERNALS, PLUGIN_ID } from '../build-faces.ts'

const HOST_ENTRY = 'src/index.ts'
const CLIENT_ENTRY = 'src/client/index.ts'

try {
  mkdirSync('lib', { recursive: true })

  // Host half: lib/index.js. `packages: 'external'` keeps every bare specifier
  // (including @deepseek-ai/*) out of the bundle — the harness supplies them.
  // Types are not emitted: they need host declarations a prepare run cannot
  // resolve.
  await build({
    entryPoints: [HOST_ENTRY],
    outfile: 'lib/index.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    packages: 'external',
    logLevel: 'info',
  })

  // Browser half: lib/client.js, wrapped exactly as the harness module loader
  // evaluates it (one lazy-CJS factory registering under the package id).
  await build({
    entryPoints: [CLIENT_ENTRY],
    outfile: 'lib/client.js',
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
    },
    banner: {
      js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
    },
    footer: { js: 'return module.exports; } });' },
    logLevel: 'info',
  })

  console.log('[dsh-grafana-plugin] prepare: built lib/index.js + lib/client.js')
} catch (error) {
  console.error('[dsh-grafana-plugin] prepare failed:', error)
  process.exitCode = 1
}
