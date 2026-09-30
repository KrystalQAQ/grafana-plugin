/**
 * tsdown config for the local CLI build: the host half WITH type declarations.
 * Declarations need the harness checkout's host types, so only the local build
 * emits them; `prepare` (git install) builds the same face without `dts`.
 */
import type { UserConfig } from 'tsdown'
import { hostFace } from './build-faces.ts'

export default hostFace({ dts: true }) satisfies UserConfig
