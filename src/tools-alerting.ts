/**
 * Alerting read-only tools: list alert rules (with state filter) and get one
 * rule in full via the Grafana Ruler / provisioning APIs.
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
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

interface ProvisionedRule {
  uid: string
  title: string
  ruleGroup: string
  folderUid: string
  for?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

interface RulerApiResp {
  data?: {
    groups?: Array<{
      name: string
      folderUid?: string
      rules?: Array<{
        uid?: string
        name?: string
        state?: string
        health?: string
        lastEvaluation?: string
        labels?: Record<string, string>
        annotations?: Record<string, string>
      }>
    }>
  }
}

export function listAlertRulesTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_list_alert_rules',
    description:
      '列出 Grafana 告警规则及其状态。state 过滤：firing（正在告警）、pending、normal、inactive、error、nodata。' +
      '默认返回全部规则。排查"现在有什么在告警"时用 state=firing。',
    parameters: {
      state: { type: 'string', enum: ['firing', 'pending', 'normal', 'inactive', 'error', 'nodata'], description: '按状态过滤' },
      folderUid: { type: 'string', description: '按文件夹 uid 过滤' },
      limit: { type: 'number', description: '返回条数上限（默认 50，最大 200）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const state = typeof input.state === 'string' && input.state !== '' ? input.state : null
      const folderUid = typeof input.folderUid === 'string' && input.folderUid !== '' ? input.folderUid : null
      const limit = Math.min(Math.max(typeof input.limit === 'number' ? Math.trunc(input.limit) : 50, 1), 200)

      // Ruler API gives live state per rule group; provisioning API gives definition.
      const ruler = await client.request<RulerApiResp>(`/api/prometheus/grafana/api/v1/rules`)
      const rules: Array<Record<string, unknown>> = []
      for (const group of ruler.data?.groups ?? []) {
        if (folderUid !== null && group.folderUid !== folderUid) continue
        for (const rule of group.rules ?? []) {
          if (state !== null && rule.state !== state) continue
          rules.push({
            uid: rule.uid ?? null,
            title: rule.name ?? '(unnamed)',
            state: rule.state ?? 'unknown',
            health: rule.health ?? null,
            group: group.name,
            folderUid: group.folderUid ?? null,
            lastEvaluation: rule.lastEvaluation ?? null,
            labels: rule.labels ?? {},
            annotations: rule.annotations ?? {},
          })
        }
      }
      const shown = rules.slice(0, limit)
      const text = rules.length === 0
        ? state !== null
          ? `没有处于 ${state} 状态的告警规则。`
          : '没有告警规则。'
        : `共 ${rules.length} 条告警规则${state ? `（状态: ${state}）` : ''}：\n${shown.map((r) => `- ${r.title} [${r.state}${r.health && r.health !== 'ok' ? ` (health: ${r.health})` : ''}] 组: ${r.group}`).join('\n')}${rules.length > limit ? `\n(仅显示前 ${limit} 条)` : ''}`
      return textResult(text, { total: rules.length, rules: shown })
    },
  })
}

export function getAlertRuleTool(client: GrafanaClient): ToolDefinition {
  return defineTool({
    name: 'grafana_get_alert_rule',
    description: '按 uid 获取单条告警规则的完整定义（查询表达式、评估间隔、注释、标签）。',
    parameters: {
      uid: { type: 'string', required: true, description: '告警规则 uid（来自 grafana_list_alert_rules）' },
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const input = args as Record<string, unknown>
      const uid = typeof input.uid === 'string' ? input.uid : ''
      if (uid === '') throw new Error('grafana_get_alert_rule: uid 是必填参数')
      const rule = await client.request<ProvisionedRule & { condition?: string; queries?: unknown }>(
        `/api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`,
      )
      const text = `告警规则「${rule.title}」：\n- 组: ${rule.ruleGroup}，文件夹: ${rule.folderUid}\n- 持续: ${rule.for ?? '0s'}\n- 标签: ${JSON.stringify(rule.labels ?? {})}\n- 注释: ${JSON.stringify(rule.annotations ?? {})}\n完整定义见 data.rule。`
      return textResult(text, { rule })
    },
  })
}
