/**
 * Loki query tools: LogQL queries (log + metric), and label names/values —
 * via the Grafana datasource proxy.
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { resolveDatasource } from './client.js'
import type { GrafanaClient } from './client.js'
import { relativetoEpoch } from './tools-prometheus.js'

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

async function resolveLokiUid(client: GrafanaClient, uidOrName: string): Promise<string> {
  const ds = await resolveDatasource(client, uidOrName)
  if (!ds.type.toLowerCase().includes('loki')) throw new Error(`数据源「${uidOrName}」的类型是 ${ds.type}，不是 Loki`)
  return ds.uid
}

interface LokiQueryResult {
  status?: string
  data?: {
    resultType?: string
    result?: Array<{ stream?: Record<string, string>; values?: Array<[string, string]>; metric?: Record<string, string>; value?: Array<[string, string]> }>
  }
}

export function queryLokiTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_query_loki',
    description:
      '对 Loki 数据源执行 LogQL 查询。type=logs 返回原始日志行（如 {app="nginx"} |= "error"）；' +
      'type=metric 返回数值序列（如 count_over_time({app="nginx"}[5m])）。流选择器至少含一个正向标签匹配。',
    parameters: {
      datasourceUid: { type: 'string', required: true, description: 'Loki 数据源 uid（或名称）' },
      query: { type: 'string', required: true, description: 'LogQL 查询，如 {job="nginx"} |= "error"' },
      type: { type: 'string', enum: ['logs', 'metric'], description: 'logs=日志行（默认）；metric=数值' },
      limit: { type: 'number', description: '日志行数上限（默认 50，最大 500）' },
      start: { type: 'string', description: '起始时间：now-1h 或 RFC3339（默认 now-1h）' },
      end: { type: 'string', description: '结束时间（默认 now）' },
      direction: { type: 'string', enum: ['backward', 'forward'], description: 'backward=最新优先（默认）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uidOrName = typeof input.datasourceUid === 'string' ? input.datasourceUid : ''
      const query = typeof input.query === 'string' ? input.query : ''
      if (uidOrName === '' || query === '') throw new Error('grafana_query_loki: datasourceUid 和 query 是必填参数')
      const uid = await resolveLokiUid(client, uidOrName)
      const isMetric = input.type === 'metric'
      const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.trunc(input.limit) : 50, 1), 500)
      const startNs = relativetoEpoch(typeof input.start === 'string' ? input.start : 'now-1h') * 1_000_000_000
      const endNs = relativetoEpoch(typeof input.end === 'string' && input.end !== '' ? input.end : 'now') * 1_000_000_000
      const direction = input.direction === 'forward' ? 'forward' : 'backward'

      const params = new URLSearchParams({ query, limit: String(limit), direction })
      if (!isMetric) {
        params.set('start', String(startNs))
        params.set('end', String(endNs))
      }
      const endpoint = isMetric ? 'loki/api/v1/query' : 'loki/api/v1/query_range'
      const result = await client.request<LokiQueryResult>(
        `/api/datasources/proxy/uid/${encodeURIComponent(uid)}/${endpoint}`,
        { query: params.toString() },
      )
      const rows = result.data?.result ?? []
      if (isMetric) {
        const lines = rows.map((r) => {
          const metricStr = JSON.stringify(r.metric ?? {})
          const v = r.value?.[0]?.[1] ?? '?'
          return `${metricStr} = ${v}`
        })
        return textResult(`LogQL 指标查询结果：\n${lines.join('\n') || '(空)'}`, { seriesCount: rows.length, series: rows })
      }
      const lines: string[] = []
      for (const stream of rows) {
        const labels = JSON.stringify(stream.stream ?? {})
        for (const [ts, line] of (stream.values ?? []).slice(0, limit)) {
          lines.push(`${ts} ${labels} ${line}`)
          if (lines.length >= limit) break
        }
        if (lines.length >= limit) break
      }
      return textResult(`LogQL 查询返回 ${lines.length} 行日志：\n${lines.join('\n') || '(空)'}`, { lineCount: lines.length, streams: rows.length })
    },
  })
}

export function listLokiLabelsTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_list_loki_labels',
    description: '列出 Loki 的标签名，或某个标签的取值（用于构造 LogQL 流选择器）。mode=names 列标签名；mode=values 列 labelName 的取值。',
    parameters: {
      datasourceUid: { type: 'string', required: true, description: 'Loki 数据源 uid（或名称）' },
      mode: { type: 'string', enum: ['names', 'values'], description: 'names=列标签名（默认）；values=列取值' },
      labelName: { type: 'string', description: 'mode=values 时必填，如 app、job' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uidOrName = typeof input.datasourceUid === 'string' ? input.datasourceUid : ''
      if (uidOrName === '') throw new Error('grafana_list_loki_labels: datasourceUid 是必填参数')
      const uid = await resolveLokiUid(client, uidOrName)
      const mode = input.mode === 'values' ? 'values' : 'names'
      const base = `/api/datasources/proxy/uid/${encodeURIComponent(uid)}/loki/api/v1`
      let resp: { status?: string; data?: string[] }
      if (mode === 'values') {
        const labelName = typeof input.labelName === 'string' ? input.labelName : ''
        if (labelName === '') throw new Error('grafana_list_loki_labels: mode=values 时 labelName 是必填参数')
        resp = await client.request<{ status?: string; data?: string[] }>(`${base}/label/${encodeURIComponent(labelName)}/values`)
      } else {
        resp = await client.request<{ status?: string; data?: string[] }>(`${base}/labels`)
      }
      // Loki wraps results in { status, data: [...] }.
      const items = Array.isArray(resp) ? resp : Array.isArray(resp.data) ? resp.data : []
      const subject = mode === 'values' ? `标签「${String(input.labelName)}」的取值` : '标签名'
      const text = `${subject} 共 ${items.length} 个：\n${items.join('\n')}`
      return textResult(text, { total: items.length, items })
    },
  })
}
