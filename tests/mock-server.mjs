// Mock Grafana server for end-to-end tool execution tests (no real Grafana needed).
import http from 'node:http'

const hits = [
  { id: 1, uid: 'dash-1', title: 'API Overview', url: '/d/dash-1/api', folderTitle: 'Prod', folderUid: 'f1', tags: ['api'], type: 'dash-db' },
  { id: 2, uid: 'dash-2', title: 'DB Health', url: '/d/dash-2/db', folderTitle: 'Prod', folderUid: 'f1', tags: ['db'], type: 'dash-db' },
]
const datasources = [
  { uid: 'prom-1', name: 'Prometheus', type: 'prometheus', isDefault: true },
  { uid: 'loki-1', name: 'Loki', type: 'loki', isDefault: false },
]

export function startMockGrafana(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname
    const auth = req.headers.authorization ?? ''
    const json = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }

    if (auth !== 'Bearer test-token-123') { json({ message: 'invalid token' }, 401); return }

    if (p === '/api/search' && url.searchParams.get('type') === 'dash-db') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase()
      json(hits.filter((h) => q === '' || h.title.toLowerCase().includes(q)))
    } else if (p === '/api/search' && url.searchParams.get('type') === 'dash-folder') {
      json([{ id: 1, uid: 'f1', title: 'Prod' }])
    } else if (p === '/api/datasources') {
      json(datasources)
    } else if (p.startsWith('/api/datasources/proxy/')) {
      // proxy routes (must be checked before generic /api/datasources/<id>)
      if (p.startsWith('/api/datasources/proxy/uid/prom-1/api/v1/query')) {
        json({ status: 'success', data: { resultType: p.includes('query_range') ? 'matrix' : 'vector', result: [{ metric: { __name__: 'up', job: 'grafana' }, value: [1700000000, '1'] }] } })
      } else if (p.startsWith('/api/datasources/proxy/uid/prom-1/api/v1/label/__name__/values')) {
        json(['up', 'http_requests_total', 'node_cpu_seconds_total'])
      } else if (p.startsWith('/api/datasources/proxy/uid/prom-1/api/v1/labels')) {
        json(['job', 'instance', '__name__'])
      } else if (p.startsWith('/api/datasources/proxy/uid/prom-1/api/v1/label/job/values')) {
        json(['grafana', 'prometheus'])
      } else if (p.startsWith('/api/datasources/proxy/uid/loki-1/loki/api/v1/labels')) {
        json(['app', 'job'])
      } else if (p.startsWith('/api/datasources/proxy/uid/loki-1/loki/api/v1/label/app/values')) {
        json(['nginx', 'grafana'])
      } else if (p.startsWith('/api/datasources/proxy/uid/loki-1/loki/api/v1/query_range')) {
        json({ status: 'success', data: { resultType: 'streams', result: [{ stream: { app: 'nginx' }, values: [['1700000000000000000', 'GET /api 200']] }] } })
      } else {
        json({ message: `unhandled proxy ${p}` }, 404)
      }
    } else if (p.startsWith('/api/datasources/')) {
      const id = decodeURIComponent(p.split('/').pop())
      const ds = datasources.find((d) => d.uid === id || d.name === id)
      if (ds) json(ds); else json({ message: 'not found' }, 404)
    } else if (p === '/api/dashboards/uid/dash-1') {
      json({ dashboard: { title: 'API Overview', panels: [{ id: 1, title: 'RPS', type: 'timeseries', datasource: { uid: 'prom-1' }, targets: [{ expr: 'rate(http_requests_total[5m])' }] }] }, meta: { version: 3, url: '/d/dash-1/' } })
    } else if (p === '/api/prometheus/grafana/api/v1/rules') {
      json({ data: { groups: [{ name: 'core', folderUid: 'f1', rules: [{ uid: 'rule-1', name: 'HighErrorRate', state: 'firing', health: 'ok', lastEvaluation: '2026-01-01T00:00:00Z' }, { uid: 'rule-2', name: 'LowTraffic', state: 'normal', health: 'ok' }] }] } })
    } else if (p === '/api/v1/provisioning/alert-rules/rule-1') {
      json({ uid: 'rule-1', title: 'HighErrorRate', ruleGroup: 'core', folderUid: 'f1', for: '5m', labels: { severity: 'critical' }, annotations: { summary: 'error rate > 5%' } })
    } else {
      json({ message: `unhandled ${p}` }, 404)
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}
