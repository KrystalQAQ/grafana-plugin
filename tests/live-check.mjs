// Live check against the real Grafana instance.
// Token comes from the GRAFANA_TOKEN env var; the caller decrypts the DPAPI
// store (start-mcp-grafana-http.ps1 compatible) before launching.
import * as m from '../lib/index.js'

const token = process.env.GRAFANA_TOKEN ?? ''
if (token === '') throw new Error('GRAFANA_TOKEN env var is empty')

// Volatile references, exactly as the Cordis loader hands them over.
const vol = value => ({ get: () => value })
const cfg = {
  url: vol('http://8.137.182.194:3002'),
  token: vol(token),
  timeoutMs: vol(30_000),
  categories: vol(['dashboards', 'loki', 'alerting']),
}
const registered = new Map()
m.apply(
  {
    effect(fn) { fn() },
    on() {},
    tools: { register(t) { registered.set(t.name, t); return () => { registered.delete(t.name) } } },
    systemPrompt: { section() {} },
    console: { info() {} },
  },
  cfg,
)
console.log('registered tools:', registered.size)

const ds = await registered.get('grafana_list_datasources').execute({})
console.log('datasources:', ds.text.split('\n').slice(1).join(' | '))

const lokiUid = ds.data.items[0].uid
const labels = await registered.get('grafana_list_loki_labels').execute({ datasourceUid: lokiUid })
console.log('loki labels:', labels.text.split('\n').slice(1).join(' | '))

const rules = await registered.get('grafana_list_alert_rules').execute({})
console.log('alert rules:', rules.text.split('\n')[0])

console.log('LIVE CHECKS PASSED')
process.exit(0)
