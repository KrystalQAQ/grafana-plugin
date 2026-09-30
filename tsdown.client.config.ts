/**
 * tsdown config for the grafana plugin's browser half (external-plugin
 * variant). The in-repo clientBundle preset cannot be used outside the
 * workspace (it asserts the package lives under packages/*), so this config
 * reproduces the same artifact contract directly:
 * - CJS output wrapped in window.__ModuleLoader__.load({ id, factory });
 * - every @deepseek-ai/* specifier external (module-table rows);
 * - react/jsx-runtime external; everything else inlined;
 * - lib/client.js is the single entry (inlineDynamicImports).
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-grafana-plugin'

/** Module-table specifiers the web shell shares; they stay external. */
const EXTERNALS = [
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

/** True for module-table specifiers (exact match, like the loader keys rows). */
const isExternal = (specifier: string): boolean => (EXTERNALS as readonly string[]).includes(specifier)

export default {
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  minify: false,
  external: isExternal,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    inlineDynamicImports: true,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig
