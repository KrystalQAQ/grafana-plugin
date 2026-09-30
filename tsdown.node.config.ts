/**
 * tsdown config for the grafana plugin's host half (Node side): lib/index.js
 * from the TypeScript source. The browser half is built separately with
 * tsdown.client.config.ts after tsc has emitted lib/types.
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
  clean: false,
  deps: {
    // schemastery stays unbundled because the Loader validates the plugin's
    // `Config` schema and must see its own instance; cordis is type-only.
    neverBundle: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'],
  },
} satisfies UserConfig
