// Syntax-check the installed browser bundle: the factory body must parse as a
// classic script and the whole file must be a single loader call.
const fs = require('node:fs')
const path = require('node:path')

const profile = process.argv[2] ?? 'web'
const file = path.join(process.env.USERPROFILE, '.dsh', 'profiles', profile, 'node_modules', 'dsh-grafana-plugin', 'lib', 'client.js')
const src = fs.readFileSync(file, 'utf8')

const banner = /^window\.__ModuleLoader__\.load\(\{ id: "([^"]+)", factory: \(require\) => \{/
const match = banner.exec(src)
console.log('loader banner id:', match?.[1] ?? 'MISSING')

const body = src
  .replace(banner, '')
  .replace(/return module\.exports; \} \}\);[\s\S]*$/, '')

try {
  new Function('require', 'module', 'exports', body)
  console.log('factory body parses: OK')
} catch (error) {
  console.log('factory body SYNTAX ERROR:', error.message)
  process.exitCode = 1
}
console.log('bytes:', src.length)
console.log('single loader call:', (src.match(/__ModuleLoader__\.load\(/g) ?? []).length === 1)
