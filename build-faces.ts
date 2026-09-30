/**
 * Shared build-face definitions, imported by both the CLI configs and the
 * `prepare` script so a git install and a local build produce identical
 * artifacts.
 *
 * @module dsh-grafana-plugin/build-faces
 */
import type { UserConfig } from 'tsdown'

/** Published package id; the browser factory registers under this name. */
export const PLUGIN_ID = 'dsh-grafana-plugin'

/** Module-table specifiers the web shell shares; they stay external. */
export const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-plugin-manager',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-api-remotes',
]

/** Every @deepseek-ai host package is provided by the running harness. */
export const isHostExternal = (specifier: string): boolean => specifier.startsWith('@deepseek-ai/')

/** Host half: lib/index.js from src/index.ts. */
export const hostFace = (options: { dts: boolean }): UserConfig => ({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: options.dts,
  sourcemap: false,
  clean: false,
  external: isHostExternal,
})

/** Browser half: lib/client.js in the ModuleLoader factory contract. */
export const clientFace = (entry: string): UserConfig => ({
  entry: { client: entry },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  minify: false,
  external: (specifier: string) => CLIENT_EXTERNALS.includes(specifier),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    inlineDynamicImports: true,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
