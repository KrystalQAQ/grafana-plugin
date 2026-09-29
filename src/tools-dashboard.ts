/**
 * Dashboard & folder query tools: search, read (summary / full / panel
 * queries), folders, datasources.
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { GrafanaClient } from './client.js'
import { summarizeDashboard, type DashboardHit, type DatasourceSummary, type FolderHit } from './client.js'

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

export function searchDashboardsTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_search_dashboards',
    description:
      '搜索 Grafana 仪表盘。按关键词、标签、文件夹或星标过滤，返回 uid/标题/文件夹/标签列表。' +
      '需要查看某个仪表盘详情时，用返回的 uid 调 grafana_get_dashboard。',
    parameters: {
      query: { type: 'string', description: '标题关键词过滤' },
      tag: { type: 'string', description: '按标签过滤' },
      folderUid: { type: 'string', description: '按文件夹 uid 过滤' },
      starred: { type: 'boolean', description: '仅星标仪表盘' },
      limit: { type: 'number', description: '返回条数上限（默认 20，最大 100）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as { query?: unknown; tag?: unknown; folderUid?: unknown; starred?: unknown; limit?: unknown }
      const params = new URLSearchParams()
      params.set('type', 'dash-db')
      if (typeof input.query === 'string' && input.query !== '') params.set('query', input.query)
      if (typeof input.tag === 'string' && input.tag !== '') params.set('tag', input.tag)
      if (typeof input.folderUid === 'string' && input.folderUid !== '') params.set('folderUids', input.folderUid)
      if (input.starred === true) params.set('starred', 'true')
      const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.trunc(input.limit) : 20, 1), 100)
      params.set('limit', String(limit))
      const hits = await client.request<DashboardHit[]>(`/api/search`, { query: params.toString() })
      const items = hits.map(summarizeDashboard)
      const text = hits.length === 0
        ? '未找到匹配的仪表盘。'
        : `找到 ${hits.length} 个仪表盘：\n${hits.map((h) => `- ${h.title} (uid: ${h.uid}, 文件夹: ${h.folderTitle || 'General'})`).join('\n')}`
      return textResult(text, { count: items.length, items })
    },
  })
}

export function getDashboardTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_get_dashboard',
    description:
      '获取 Grafana 仪表盘内容。mode=summary 返回紧凑概览（面板标题/类型，省 token，推荐先调）；' +
      'mode=full 返回完整 JSON；mode=panels 返回每个面板的查询与数据源信息。',
    parameters: {
      uid: { type: 'string', required: true, description: '仪表盘 uid（来自 grafana_search_dashboards）' },
      mode: { type: 'string', enum: ['summary', 'panels', 'full'], description: '返回粒度，默认 summary' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as { uid?: unknown; mode?: unknown }
      const uid = typeof input.uid === 'string' ? input.uid : ''
      if (uid === '') throw new Error('grafana_get_dashboard: uid 是必填参数')
      const mode = input.mode === 'full' || input.mode === 'panels' ? input.mode : 'summary'
      const resp = await client.request<{ dashboard: Record<string, unknown>; meta: { url?: string; version?: number } }>(
        `/api/dashboards/uid/${encodeURIComponent(uid)}`,
      )
      const dash = resp.dashboard
      const title = typeof dash.title === 'string' ? dash.title : uid

      if (mode === 'full') {
        return textResult(`仪表盘「${title}」完整 JSON 已返回（见 data.dashboard）。`, { dashboard: dash })
      }

      const panels = extractPanels(dash)
      if (mode === 'summary') {
        const lines = panels.map((p) => `- [${p.type}] ${p.title}`)
        const text = `仪表盘「${title}」（uid: ${uid}，版本 ${resp.meta.version ?? '?'}）共 ${panels.length} 个面板：\n${lines.join('\n') || '(无面板)'}`
        return textResult(text, { uid, title, version: resp.meta.version ?? null, panelCount: panels.length, url: resp.meta.url ?? null })
      }
      // panels mode: include queries + datasource per panel.
      return textResult(`仪表盘「${title}」面板查询详情见 data.panels。`, {
        uid,
        title,
        panels: panels.map((p) => ({ id: p.id, title: p.title, type: p.type, datasource: p.datasource ?? null, queries: p.targets ?? [] })),
      })
    },
  })
}

interface PanelLike {
  id?: unknown
  title?: unknown
  type?: unknown
  datasource?: unknown
  targets?: unknown
  panels?: unknown
}

function extractPanels(dash: Record<string, unknown>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const walk = (raw: unknown): void => {
    if (!Array.isArray(raw)) return
    for (const item of raw) {
      const panel = item as PanelLike
      if (panel === null || typeof panel !== 'object') continue
      // collapsed rows nest panels under `panels`.
      if (Array.isArray(panel.panels)) walk(panel.panels)
      else out.push(panel as Record<string, unknown>)
    }
  }
  walk(dash.panels)
  return out
}

export function listDatasourcesTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_list_datasources',
    description: '列出 Grafana 中配置的所有数据源（uid、名称、类型、是否默认）。查询 Prometheus/Loki 前先调它拿数据源 uid。',
    parameters: {
      type: { type: 'string', description: '按数据源类型过滤，如 prometheus、loki、tempo' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as { type?: unknown }
      const all = await client.request<DatasourceSummary[]>(`/api/datasources`)
      const wanted = typeof input.type === 'string' && input.type !== '' ? input.type.toLowerCase() : null
      const items = wanted === null ? all : all.filter((d) => d.type.toLowerCase().includes(wanted))
      const text = items.length === 0
        ? '没有匹配的数据源。'
        : `共 ${items.length} 个数据源：\n${items.map((d) => `- ${d.name} (uid: ${d.uid}, 类型: ${d.type}${d.isDefault ? ', 默认' : ''})`).join('\n')}`
      return textResult(text, { count: items.length, items: items.map(({ uid, name, type, isDefault }) => ({ uid, name, type, isDefault: isDefault ?? false })) })
    },
  })
}

export function searchFoldersTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_search_folders',
    description: '按关键词搜索 Grafana 文件夹，返回 uid 和标题。',
    parameters: {
      query: { type: 'string', description: '文件夹名关键词' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as { query?: unknown }
      const params = new URLSearchParams({ type: 'dash-folder' })
      if (typeof input.query === 'string' && input.query !== '') params.set('query', input.query)
      const hits = await client.request<FolderHit[]>(`/api/search`, { query: params.toString() })
      const text = hits.length === 0
        ? '未找到匹配的文件夹。'
        : `找到 ${hits.length} 个文件夹：\n${hits.map((f) => `- ${f.title} (uid: ${f.uid})`).join('\n')}`
      return textResult(text, { count: hits.length, items: hits.map(({ uid, title }) => ({ uid, title })) })
    },
  })
}
