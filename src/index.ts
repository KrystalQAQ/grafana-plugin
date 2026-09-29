/**
 * dsh-grafana-plugin: Grafana integration without the heavyweight MCP server.
 *
 * Registers a category-configurable set of model-facing tools backed by the
 * Grafana HTTP API (service-account Bearer auth):
 * - dashboards: search/get dashboards, folders, datasources
 * - prometheus: instant/range queries, metric/label discovery
 * - loki: LogQL queries, label discovery
 * - alerting: read-only alert rule listing and detail
 *
 * Namespace plugin (named exports, no default export). All registrations are
 * effect-scoped and cleaned up automatically on unload/HMR swap.
 *
 * @module dsh-grafana-plugin
 */

import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type ToolRegistry from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { makeGrafanaClient, type GrafanaClientConfig } from './client.ts'
import { searchDashboardsTool, getDashboardTool, listDatasourcesTool, searchFoldersTool } from './tools-dashboard.ts'
import { queryPrometheusTool, listPrometheusMetricsTool, listPrometheusLabelsTool } from './tools-prometheus.ts'
import { queryLokiTool, listLokiLabelsTool } from './tools-loki.ts'
import { listAlertRulesTool, getAlertRuleTool } from './tools-alerting.ts'

type Context = CordisContext & {
  tools: ToolRegistry
  systemPrompt: SystemPrompt
}

export const name = 'grafana-plugin'

/** Services required before apply runs. */
export const inject = ['tools', 'systemPrompt']

/** Tool categories; each enabled category registers its tools. */
export type ToolCategory = 'dashboards' | 'prometheus' | 'loki' | 'alerting'

export interface Config extends GrafanaClientConfig {
  /** Which tool categories to register. Fewer categories = smaller tool surface. */
  categories: ToolCategory[]
}

const ALL_CATEGORIES: ToolCategory[] = ['dashboards', 'prometheus', 'loki', 'alerting']

export const Config: z<Config> = z.object({
  url: z.string().required().description('Grafana 基地址，如 http://localhost:3000'),
  token: z.string().default('').description('服务账号 token（Bearer）；留空则匿名访问'),
  timeoutMs: z.number().step(1).min(1_000).default(30_000).description('单次 API 请求超时（毫秒）'),
  categories: z.array(z.union(['dashboards', 'prometheus', 'loki', 'alerting'] as const))
    .default(ALL_CATEGORIES)
    .description('启用的工具类别；按需裁剪以减小模型工具面'),
})

const PROMPT_TEXT = `## Grafana tools (grafana_*)
Use Grafana tools for dashboards, metrics, logs, and alerts:
1. Datasources: call \`grafana_list_datasources\` first to get the datasource \`uid\` (filter by type prometheus / loki) — every query tool needs it.
2. Dashboards: \`grafana_search_dashboards\` → \`grafana_get_dashboard\` (use mode=summary first to save context).
3. Metrics: \`grafana_list_prometheus_metrics\` to discover metric names, \`grafana_list_prometheus_labels\` for label names/values, then \`grafana_query_prometheus\` (instant for current values, range for time series).
4. Logs: \`grafana_list_loki_labels\` to build stream selectors, then \`grafana_query_loki\` (LogQL; include at least one positive label matcher and keep time ranges narrow).
5. Alerts: \`grafana_list_alert_rules\` with state=firing for "what is alerting now", \`grafana_get_alert_rule\` for a full definition.
Ask the user for the Grafana URL/token if the plugin config is not set (tools will error clearly).`

export function apply(ctx: Context, config: Config): void {
  const client = makeGrafanaClient({
    url: config.url,
    token: config.token,
    timeoutMs: config.timeoutMs ?? 30_000,
  })

  const byCategory: Record<ToolCategory, ToolDefinition[]> = {
    dashboards: [
      searchDashboardsTool(client),
      getDashboardTool(client),
      listDatasourcesTool(client),
      searchFoldersTool(client),
    ],
    prometheus: [
      queryPrometheusTool(client),
      listPrometheusMetricsTool(client),
      listPrometheusLabelsTool(client),
    ],
    loki: [
      queryLokiTool(client),
      listLokiLabelsTool(client),
    ],
    alerting: [
      listAlertRulesTool(client),
      getAlertRuleTool(client),
    ],
  }

  const enabled = new Set<ToolCategory>(config.categories?.length ? config.categories : ALL_CATEGORIES)
  for (const category of enabled) {
    for (const tool of byCategory[category]) {
      ctx.effect(() => ctx.tools.register(tool), `grafana-plugin.tool.${tool.name}`)
    }
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:grafana',
    order: 118,
    text: PROMPT_TEXT,
  }), 'grafana-plugin.prompt')
}
