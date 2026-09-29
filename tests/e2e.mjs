// End-to-end test: built plugin tools against the local mock Grafana server.
import assert from 'node:assert/strict'
import * as m from '../lib/index.js'
import { startMockGrafana } from './mock-server.mjs'

const PORT = 19301
const server = await startMockGrafana(PORT)

const registered = new Map()
const ctx = {
  effect(fn, key) { fn() },
  tools: { register(t) { registered.set(t.name, t) } },
  systemPrompt: { section() {} },
  console: { info() {} },
}
m.apply(ctx, { url: `http://127.0.0.1:${PORT}`, token: 'test-token-123', timeoutMs: 5000, categories: ['dashboards', 'prometheus', 'loki', 'alerting'] })
assert.equal(registered.size, 11, `expected 11 tools, got ${registered.size}`)

async function call(name, args) {
  return registered.get(name).execute(args)
}

// 1. search dashboards
{
  const r = await call('grafana_search_dashboards', {})
  assert.equal(r.data.count, 2)
  assert.match(r.text, /API Overview/)
}
// 2. search with query filter
{
  const r = await call('grafana_search_dashboards', { query: 'DB' })
  assert.equal(r.data.count, 1)
}
// 3. get dashboard summary
{
  const r = await call('grafana_get_dashboard', { uid: 'dash-1' })
  assert.equal(r.data.panelCount, 1)
  assert.match(r.text, /API Overview/)
}
// 4. get dashboard panels
{
  const r = await call('grafana_get_dashboard', { uid: 'dash-1', mode: 'panels' })
  assert.equal(r.data.panels[0].queries[0].expr, 'rate(http_requests_total[5m])')
}
// 5. list datasources
{
  const r = await call('grafana_list_datasources', {})
  assert.equal(r.data.count, 2)
}
// 6. list datasources filtered
{
  const r = await call('grafana_list_datasources', { type: 'loki' })
  assert.equal(r.data.count, 1)
  assert.equal(r.data.items[0].uid, 'loki-1')
}
// 7. prometheus instant query
{
  const r = await call('grafana_query_prometheus', { datasourceUid: 'prom-1', query: 'up' })
  assert.equal(r.data.seriesCount, 1)
  assert.match(r.text, /up/)
}
// 8. prometheus metric names
{
  const r = await call('grafana_list_prometheus_metrics', { datasourceUid: 'prom-1', regex: 'http.*' })
  assert.deepEqual(r.data.metrics, ['http_requests_total'])
}
// 9. prometheus label names
{
  const r = await call('grafana_list_prometheus_labels', { datasourceUid: 'prom-1' })
  assert.equal(r.data.total, 3)
}
// 10. prometheus label values
{
  const r = await call('grafana_list_prometheus_labels', { datasourceUid: 'prom-1', mode: 'values', labelName: 'job' })
  assert.deepEqual(r.data.items, ['grafana', 'prometheus'])
}
// 11. loki labels
{
  const r = await call('grafana_list_loki_labels', { datasourceUid: 'loki-1' })
  assert.deepEqual(r.data.items, ['app', 'job'])
}
// 12. loki label values
{
  const r = await call('grafana_list_loki_labels', { datasourceUid: 'loki-1', mode: 'values', labelName: 'app' })
  assert.deepEqual(r.data.items, ['nginx', 'grafana'])
}
// 13. loki query
{
  const r = await call('grafana_query_loki', { datasourceUid: 'loki-1', query: '{app="nginx"}' })
  assert.equal(r.data.lineCount, 1)
  assert.match(r.text, /GET \/api 200/)
}
// 14. alert rules
{
  const r = await call('grafana_list_alert_rules', {})
  assert.equal(r.data.total, 2)
}
// 15. alert rules filtered by firing
{
  const r = await call('grafana_list_alert_rules', { state: 'firing' })
  assert.equal(r.data.total, 1)
  assert.equal(r.data.rules[0].title, 'HighErrorRate')
}
// 16. get alert rule
{
  const r = await call('grafana_get_alert_rule', { uid: 'rule-1' })
  assert.equal(r.data.rule.title, 'HighErrorRate')
  assert.equal(r.data.rule.for, '5m')
}
// 17. folders
{
  const r = await call('grafana_search_folders', {})
  assert.equal(r.data.count, 1)
}
// 18. auth error surfaces clearly
{
  const registered2 = new Map()
  m.apply({
    effect(fn) { fn() },
    tools: { register(t) { registered2.set(t.name, t) } },
    systemPrompt: { section() {} },
    console: { info() {} },
  }, { url: `http://127.0.0.1:${PORT}`, token: 'wrong-token', timeoutMs: 5000, categories: ['dashboards'] })
  await assert.rejects(() => registered2.get('grafana_search_dashboards').execute({}), /401/)
}
// 19. schema/config validation round-trip
{
  const validated = m.Config({ url: 'http://x' })
  assert.deepEqual(validated.categories, ['dashboards', 'prometheus', 'loki', 'alerting'])
  assert.equal(validated.token, '')
}

server.close()
console.log(`ALL ${19} E2E CHECKS PASSED`)
process.exit(0)
