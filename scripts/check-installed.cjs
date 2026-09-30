// Verify a prepared/installed copy the way the harness consumes it:
// - the host half keeps @deepseek-ai packages as bare externals;
// - the browser half is one ModuleLoader factory call whose body parses.
const fs = require('node:fs')
const path = require('node:path')

const target = process.argv[2] === '--local'
  ? path.join(__dirname, '..', 'lib')
  : path.join(process.env.USERPROFILE, '.dsh', 'profiles', process.argv[2] ?? 'web', 'node_modules', 'dsh-grafana-plugin', 'lib')

console.log('inspecting:', target)

// --- host half ---
const hostPath = path.join(target, 'index.js')
const host = fs.readFileSync(hostPath, 'utf8')
const hostImports = [...new Set([...host.matchAll(/from\s*["']([^"']+)["']/g)].map(m => m[1]))]
console.log('lib/index.js imports:', hostImports.join(', ') || '(none)')
const hostExternal = hostImports.filter(s => s.startsWith('@deepseek-ai/')).length
console.log('  host packages left external:', hostExternal > 0)

// --- browser half ---
const clientPath = path.join(target, 'client.js')
const client = fs.readFileSync(clientPath, 'utf8')
const banner = /^window\.__ModuleLoader__\.load\(\{ id: "([^"]+)", factory: \(require\) => \{/
console.log('loader banner id:', banner.exec(client)?.[1] ?? 'MISSING')
console.log('single loader call:', (client.match(/__ModuleLoader__\.load\(/g) ?? []).length === 1)

const body = client.replace(banner, '').replace(/return module\.exports; \} \}\);[\s\S]*$/, '')
try {
  new Function('require', 'module', 'exports', body)
  console.log('factory body parses: OK')
} catch (error) {
  console.log('factory body SYNTAX ERROR:', error.message)
  process.exitCode = 1
}
const reqs = [...new Set([...client.matchAll(/require\("([^"]+)"\)/g)].map(m => m[1]))]
console.log('lib/client.js requires:', reqs.join(', ') || '(none)')
