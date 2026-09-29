/**
 * tsdown preset for the grafana dsh plugin (node half only — no browser
 * Toolview in the MVP; all results are model-facing text).
 *
 * schemastery stays unbundled because the Loader validates the plugin's
 * `Config` schema and must see its own instances; cordis / dsh-* are
 * type-only imports (erased at build).
 */
import type { UserConfig } from 'tsdown'

export default {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    neverBundle: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'],
  },
} satisfies UserConfig
