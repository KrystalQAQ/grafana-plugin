/**
 * Minimal Grafana HTTP API client.
 *
 * Design points (per dsh-plugin-developer/http-client.md):
 * - injectable fetch for tests and egress control;
 * - Bearer service-account token auth (Grafana 9.0+), token never logged;
 * - per-request timeout via AbortController;
 * - structured errors the model can read (`GrafanaApiError`).
 */

export interface GrafanaClientConfig {
  /** Grafana base URL, e.g. http://localhost:3000 */
  url: string
  /** Service-account token (Bearer). Empty for anonymous access. */
  token: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
}

export class GrafanaApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, endpoint: string) {
    super(`Grafana API ${endpoint} 返回 ${status}: ${truncate(body, 300)}`)
    this.name = 'GrafanaApiError'
    this.status = status
    this.body = body
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export interface GrafanaRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON-serializable request body. */
  body?: unknown
  /** Raw query string (already encoded), e.g. `query=up&time=now`. */
  query?: string
}

export function makeGrafanaClient(config: GrafanaClientConfig, fetchImpl: typeof fetch = fetch) {
  const base = config.url.replace(/\/+$/, '')

  async function request<T>(endpoint: string, options: GrafanaRequestOptions = {}): Promise<T> {
    const url = `${base}${endpoint}${options.query ? `?${options.query}` : ''}`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (config.token !== '') headers.Authorization = `Bearer ${config.token}`
    let body: string | undefined
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      })
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === 'AbortError'
        ? `请求超时（>${config.timeoutMs}ms）`
        : `网络错误: ${cause instanceof Error ? cause.message : String(cause)}`
      throw new Error(`Grafana API ${endpoint} 请求失败: ${reason}`)
    } finally {
      clearTimeout(timer)
    }

    const text = await res.text()
    if (!res.ok) throw new GrafanaApiError(res.status, text, endpoint)
    if (text === '') return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      // Some endpoints return plain text; pass it through wrapped.
      return text as unknown as T
    }
  }

  return { request, base }
}

/**
 * Resolve a datasource (uid or name) to `{ uid, type }`. Newer Grafana serves
 * `/api/datasources/uid/<uid>` and `/api/datasources/name/<name>`; the bare
 * `/api/datasources/<id>` form only accepts numeric ids there.
 */
export async function resolveDatasource(client: GrafanaClient, uidOrName: string): Promise<{ uid: string; type: string }> {
  // Numeric id: legacy endpoint.
  if (/^\d+$/.test(uidOrName)) {
    return client.request<{ uid: string; type: string }>(`/api/datasources/${uidOrName}`)
  }
  try {
    return await client.request<{ uid: string; type: string }>(`/api/datasources/uid/${encodeURIComponent(uidOrName)}`)
  } catch {
    // Fall back to name lookup (also covers proxies that reject the uid form).
    return client.request<{ uid: string; type: string }>(`/api/datasources/name/${encodeURIComponent(uidOrName)}`)
  }
}

export type GrafanaClient = ReturnType<typeof makeGrafanaClient>

// ---- Shared DTOs (only the fields the tools surface) ----

export interface DashboardHit {
  id: number
  uid: string
  title: string
  url: string
  folderTitle: string
  folderUid: string
  tags: string[]
  type: string
}

export interface FolderHit {
  id: number
  uid: string
  title: string
  url?: string
}

export interface DatasourceSummary {
  uid: string
  name: string
  type: string
  isDefault?: boolean
  url?: string
}

export interface AlertRuleSummary {
  uid: string
  title: string
  state: { status?: string } | string
  ruleGroup?: string
  folderUid?: string
  for?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export function summarizeDashboard(hit: DashboardHit): Record<string, unknown> {
  return {
    uid: hit.uid,
    title: hit.title,
    folder: hit.folderTitle || '(General)',
    tags: hit.tags,
    url: hit.url,
  }
}
