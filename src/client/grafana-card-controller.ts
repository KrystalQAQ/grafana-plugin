/**
 * Lightweight settings-card controller for an external dsh plugin.
 *
 * The in-repo UI primitives are intentionally not imported here: the external
 * bundle cannot resolve their style asset chain. This controller uses the
 * same ConfigForms namespace contract and the shared client-store snapshot
 * primitive directly.
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

export const GRAFANA_NS = 'grafana-plugin'

export interface GrafanaSettings {
  url?: string
  token?: string
  timeoutMs?: number
}

export interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
  base: unknown
  user: unknown
  writable: boolean
  revision: number | undefined
}

export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  mutate(operations: readonly SettingsOperation[], expectedRevision?: number): Promise<boolean>
}

export type SettingsOperation =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

export interface FieldState {
  text: string
  overridden: boolean
  invalid: boolean
}

export interface GrafanaCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
  url: FieldState
  token: FieldState
  timeoutMs: FieldState
  tokenConfigured: boolean
}

export interface GrafanaCardFace {
  hooks: { grafanaCard: SnapshotStore<GrafanaCardState> }
  edit(field: 'url' | 'token' | 'timeoutMs', text: string): void
  resetField(field: 'url' | 'timeoutMs'): void
  save(): void
  discard(): void
}

interface Draft {
  url?: string
  token?: string
  timeoutMs?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasField(value: unknown, field: string): boolean {
  return isObject(value) && Object.hasOwn(value, field)
}

export class GrafanaCardController {
  private readonly store: SnapshotStore<GrafanaCardState>
  private readonly unsubscribe: () => void
  private readonly draft: Draft = {}
  private saving = false
  private failed = false
  private baselineRevision: number | undefined

  constructor(private readonly scope: SettingsScope<GrafanaSettings>) {
    this.store = createSnapshotStore(this.project())
    this.unsubscribe = scope.subscribe(() => {
      if (!this.saving) this.store.set(this.project())
    })
  }

  private project(): GrafanaCardState {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value ?? {}
    const user = isObject(snapshot.user) ? snapshot.user : {}
    const base = isObject(snapshot.base) ? snapshot.base : {}
    const urlText = this.draft.url ?? value.url ?? ''
    const timeoutText = this.draft.timeoutMs ?? (value.timeoutMs === undefined ? '' : String(value.timeoutMs))
    const tokenConfigured = hasField(user, 'token') || hasField(base, 'token')
    const timeoutInvalid = this.draft.timeoutMs !== undefined
      && this.draft.timeoutMs.trim() !== ''
      && !Number.isFinite(Number(this.draft.timeoutMs))
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: Object.keys(this.draft).length > 0,
      invalid: timeoutInvalid,
      saving: this.saving,
      failed: this.failed,
      url: { text: urlText, overridden: hasField(user, 'url'), invalid: false },
      token: { text: this.draft.token ?? '', overridden: false, invalid: false },
      timeoutMs: { text: timeoutText, overridden: hasField(user, 'timeoutMs'), invalid: timeoutInvalid },
      tokenConfigured,
    }
  }

  inject(): GrafanaCardFace {
    return {
      hooks: { grafanaCard: this.store },
      edit: (field, text) => {
        if (this.baselineRevision === undefined) this.baselineRevision = this.scope.getSnapshot().revision
        this.draft[field] = text
        this.failed = false
        this.store.set(this.project())
      },
      resetField: (field) => {
        if (this.baselineRevision === undefined) this.baselineRevision = this.scope.getSnapshot().revision
        this.draft[field] = ''
        this.failed = false
        this.store.set(this.project())
      },
      save: () => { void this.save() },
      discard: () => {
        for (const key of Object.keys(this.draft) as Array<keyof Draft>) delete this.draft[key]
        this.baselineRevision = undefined
        this.failed = false
        this.store.set(this.project())
      },
    }
  }

  private async save(): Promise<void> {
    if (this.saving || !this.scope.getSnapshot().writable || this.project().invalid) return
    const operations: SettingsOperation[] = []
    if (this.draft.url !== undefined) operations.push(this.draft.url.trim() === ''
      ? { op: 'unset', path: ['url'] }
      : { op: 'set', path: ['url'], value: this.draft.url.trim() })
    if (this.draft.timeoutMs !== undefined) operations.push(this.draft.timeoutMs.trim() === ''
      ? { op: 'unset', path: ['timeoutMs'] }
      : { op: 'set', path: ['timeoutMs'], value: Number(this.draft.timeoutMs) })
    // Blank token means "do not alter" so reopening the card never clears a
    // secret just because the redacted field is visually empty.
    if (this.draft.token !== undefined && this.draft.token.trim() !== '') {
      operations.push({ op: 'set', path: ['token'], value: this.draft.token.trim() })
    }
    if (operations.length === 0) return
    this.saving = true
    this.store.set(this.project())
    try {
      const ok = await this.scope.mutate(operations, this.baselineRevision)
      this.failed = !ok
      if (ok) {
        for (const key of Object.keys(this.draft) as Array<keyof Draft>) delete this.draft[key]
        this.baselineRevision = undefined
      }
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.store.set(this.project())
    }
  }

  dispose(): void {
    this.unsubscribe()
  }
}
