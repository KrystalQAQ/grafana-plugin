/**
 * tsdown config for the local CLI build's browser half.
 *
 * Compiled from the tsc-emitted `lib/types/client/index.js`, so the local build
 * type-checks the client graph first (see tsconfig.client.json). `prepare`
 * compiles `src/client/index.ts` directly instead, because a git install has no
 * host types to check against. Both produce the same ModuleLoader contract.
 */
import type { UserConfig } from 'tsdown'
import { clientFace } from './build-faces.ts'

export default clientFace('lib/types/client/index.js') satisfies UserConfig
