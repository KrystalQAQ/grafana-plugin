/**
 * Prometheus query tools: instant/range queries, metric names, label names
 * and values. All calls go through the Grafana datasource proxy
 * `/api/datasources/proxy/uid/<uid>/...` so only Grafana's own auth is needed.
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { resolveDatasource } from './client.js'
import type { GrafanaClient } from './client.js'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', required: true },
    data: { type: 'json', required: true },
  },
} as const

const OUTPUT = {
  schema: OUTPUT_SCHEMA,
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
}

function textResult(text: string, data: unknown) {
  return { text, data: data as never }
}

/** Resolve a datasource by uid or name to its uid. */
async function resolveDatasourceUid(client: GrafanaClient, uidOrName: string, expectedType?: string): Promise<string> {
  const ds = await resolveDatasource(client, uidOrName)
  if (expectedType !== undefined && !ds.type.toLowerCase().includes(expectedType)) {
    throw new Error(`数据源「${uidOrName}」的类型是 ${ds.type}，不是 ${expectedType}`)
  }
  return ds.uid
}

interface PromQueryResult {
  status?: string
  data?: {
    resultType?: string
    result?: Array<{ metric: Record<string, string>; value?: [number, string]; values?: Array<[number, string]> }>
  }
}

function formatSeries(result: NonNullable<NonNullable<PromQueryResult['data']>['result']>): string {
  if (result.length === 0) return '查询结果为空。'
  const lines: string[] = []
  for (const item of result.slice(0, 50)) {
    const metricStr = Object.entries(item.metric).map(([k, v]) => `${k}="${v}"`).join(', ')
    if (item.value) lines.push(`{${metricStr}} = ${item.value[1]} @${item.value[0]}`)
    else if (item.values && item.values.length > 0) {
      const sample = item.values.slice(-5).map(([t, v]) => `${t}:${v}`).join(' ')
      lines.push(`{${metricStr}} 最近 ${item.values.length} 个点: ${sample}`)
    }
  }
  if (result.length > 50) lines.push(`(仅显示前 50 条，共 ${result.length} 条)`)
  return lines.join('\n')
}

export function queryPrometheusTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_query_prometheus',
    description:
      '对 Prometheus 数据源执行 PromQL 查询。type=instant 查当前值（如 up）；type=range 查时间序列（配合 start/end）。' +
      '先用 grafana_list_datasources 找到 Prometheus 数据源的 uid。',
    parameters: {
      datasourceUid: { type: 'string', required: true, description: 'Prometheus 数据源 uid（或名称）' },
      query: { type: 'string', required: true, description: 'PromQL 表达式，如 up、rate(http_requests_total[5m])' },
      type: { type: 'string', enum: ['instant', 'range'], description: '查询类型，默认 instant' },
      start: { type: 'string', description: 'range 查询起始：now-1h、RFC3339 或 epoch 秒' },
      end: { type: 'string', description: 'range 查询结束，默认 now' },
      stepSeconds: { type: 'number', description: 'range 查询步长（秒），默认 60' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uidOrName = typeof input.datasourceUid === 'string' ? input.datasourceUid : ''
      const query = typeof input.query === 'string' ? input.query : ''
      if (uidOrName === '' || query === '') throw new Error('grafana_query_prometheus: datasourceUid 和 query 是必填参数')
      const uid = await resolveDatasourceUid(client, uidOrName, 'prometheus')

      const isRange = input.type === 'range'
      const step = String(typeof input.stepSeconds === 'number' ? Math.max(input.stepSeconds, 1) : 60)
      const startSpec = typeof input.start === 'string' && input.start !== '' ? input.start : 'now-1h'
      const endSpec = typeof input.end === 'string' && input.end !== '' ? input.end : 'now'
      // Grafana datasource proxy passes query params to Prometheus, which expects
      // epoch seconds — always normalize relative specs ourselves.
      const params = isRange
        ? new URLSearchParams({ query, start: String(relativetoEpoch(startSpec)), end: String(relativetoEpoch(endSpec)), step })
        : new URLSearchParams({ query })
      const endpoint = `/api/datasources/proxy/uid/${encodeURIComponent(uid)}/api/v1/${isRange ? 'query_range' : 'query'}`
      const result = await client.request<PromQueryResult>(endpoint, { query: params.toString() })
      if (result.status !== 'success' || result.data?.result === undefined) {
        throw new Error(`PromQL 查询失败: ${JSON.stringify(result).slice(0, 300)}`)
      }
      const resultType = result.data.resultType ?? 'vector'
      const text = `PromQL「${query}」(${resultType}):\n${formatSeries(result.data.result)}`
      return textResult(text, { resultType, seriesCount: result.data.result.length, series: result.data.result })
    },
  })
}

/** Convert `now`, `now-1h`, `now-30m` or epoch/RFC3339 to epoch seconds. */
export function relativetoEpoch(spec: string): number {
  const now = Math.floor(Date.now() / 1000)
  if (spec === 'now' || spec === '') return now
  const match = /^now-(\d+)([smhd])$/.exec(spec)
  if (match) {
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
    return now - Number(match[1]) * multipliers[match[2]]
  }
  if (/^\d+$/.test(spec)) return Number(spec)
  const parsed = Date.parse(spec)
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
  throw new Error(`无法解析时间「${spec}」，支持 now、now-1h、RFC3339 或 epoch 秒`)
}

/** Unwrap Prometheus-style envelope responses: { status, data: [...] } | [...]. */
function unwrapStringList(resp: unknown): string[] {
  if (Array.isArray(resp)) return resp.filter((x): x is string => typeof x === 'string')
  if (resp !== null && typeof resp === 'object') {
    const data = (resp as { data?: unknown }).data
    if (Array.isArray(data)) return data.filter((x): x is string => typeof x === 'string')
  }
  return []
}

export function listPrometheusMetricsTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_list_prometheus_metrics',
    description: '列出 Prometheus 数据源上可用的指标名，可用正则过滤。构建 PromQL 查询前用它发现指标。',
    parameters: {
      datasourceUid: { type: 'string', required: true, description: 'Prometheus 数据源 uid（或名称）' },
      regex: { type: 'string', description: '指标名过滤正则，如 .*http.*' },
      limit: { type: 'number', description: '返回条数上限（默认 50，最大 500）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uidOrName = typeof input.datasourceUid === 'string' ? input.datasourceUid : ''
      if (uidOrName === '') throw new Error('grafana_list_prometheus_metrics: datasourceUid 是必填参数')
      const uid = await resolveDatasourceUid(client, uidOrName, 'prometheus')
      const raw = await client.request<unknown>(`/api/datasources/proxy/uid/${encodeURIComponent(uid)}/api/v1/label/__name__/values`)
      const names = unwrapStringList(raw)
      const regex = typeof input.regex === 'string' && input.regex !== '' ? input.regex : null
      const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.trunc(input.limit) : 50, 1), 500)
      const filtered = regex === null ? names : names.filter((n) => new RegExp(regex).test(n))
      const shown = filtered.slice(0, limit)
      const text = `共 ${filtered.length} 个指标${regex ? `（匹配 /${regex}/）` : ''}：\n${shown.join('\n')}${filtered.length > limit ? `\n(仅显示前 ${limit} 个)` : ''}`
      return textResult(text, { total: filtered.length, metrics: shown })
    },
  })
}

export function listPrometheusLabelsTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_list_prometheus_labels',
    description: '列出 Prometheus 指标的标签名（可选匹配某个 series selector），或查某个标签的取值。mode=names 列标签名，mode=values 列某标签的值。',
    parameters: {
      datasourceUid: { type: 'string', required: true, description: 'Prometheus 数据源 uid（或名称）' },
      mode: { type: 'string', enum: ['names', 'values'], description: 'names=列标签名（默认）；values=列 labelName 的取值' },
      labelName: { type: 'string', description: 'mode=values 时必填，如 job、instance' },
      match: { type: 'string', description: 'series selector 过滤，如 up{job="prometheus"}' },
      limit: { type: 'number', description: '返回条数上限（默认 100）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uidOrName = typeof input.datasourceUid === 'string' ? input.datasourceUid : ''
      if (uidOrName === '') throw new Error('grafana_list_prometheus_labels: datasourceUid 是必填参数')
      const uid = await resolveDatasourceUid(client, uidOrName, 'prometheus')
      const mode = input.mode === 'values' ? 'values' : 'names'
      const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.trunc(input.limit) : 100, 1), 1000)
      const params = new URLSearchParams()
      if (typeof input.match === 'string' && input.match !== '') params.set('match[]', input.match)

      const base = `/api/datasources/proxy/uid/${encodeURIComponent(uid)}/api/v1`
      let items: string[]
      if (mode === 'values') {
        const labelName = typeof input.labelName === 'string' ? input.labelName : ''
        if (labelName === '') throw new Error('grafana_list_prometheus_labels: mode=values 时 labelName 是必填参数')
        items = unwrapStringList(await client.request<unknown>(`${base}/label/${encodeURIComponent(labelName)}/values`, { query: params.toString() }))
      } else {
        items = unwrapStringList(await client.request<unknown>(`${base}/labels`, { query: params.toString() }))
      }
      const shown = items.slice(0, limit)
      const subject = mode === 'values' ? `标签「${String(input.labelName)}」的取值` : '标签名'
      const text = `${subject} 共 ${items.length} 个：\n${shown.join('\n')}${items.length > limit ? `\n(仅显示前 ${limit} 个)` : ''}`
      return textResult(text, { total: items.length, items: shown })
    },
  })
}
