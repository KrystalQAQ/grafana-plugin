// Live check against the real Grafana instance.
// Token comes from the GRAFANA_TOKEN env var; the caller decrypts the DPAPI
// store (start-mcp-grafana-http.ps1 compatible) before launching.
import * as m from '../lib/index.js'

const token = process.env.GRAFANA_TOKEN ?? ''
if (token === '') throw new Error('GRAFANA_TOKEN env var is empty')

const cfg = m.Config({
  url: 'http://8.137.182.194:3002',
  token,
  timeoutMs: 30000,
  categories: ['dashboards', 'loki', 'alerting'],
})
const registered = new Map()
m.apply(
  { effect(fn) { fn() }, tools: { register(t) { registered.set(t.name, t) } }, systemPrompt: { section() {} }, console: { info() {} } },
  cfg,
)

const ds = await registered.get('grafana_list_datasources').execute({})
console.log('datasources:', ds.text.split('\n').slice(1).join(' | '))

const lokiUid = ds.data.items[0].uid
const logs = await registered.get('grafana_query_loki').execute({ datasourceUid: lokiUid, query: '{job="grafana"}', limit: 3 })
console.log('loki query:', logs.text.split('\n')[0])

const labels = await registered.get('grafana_list_loki_labels').execute({ datasourceUid: lokiUid })
console.log('loki labels:', labels.text.split('\n').slice(1).join(' | '))

console.log('LIVE CHECKS PASSED')
process.exit(0)
