// Verify the built browser bundle contract (loose: banner/footer may be
// separated by the sourcemap comment; katex check looks at identifiers only).
const fs = require('node:fs')
const s = fs.readFileSync('D:/code/dsh/grafana-plugin/lib/client.js', 'utf8')
const code = s.replace(/\/\/# sourceMappingURL=.*\s*$/, '')
const checks = {
  'factory banner': s.startsWith('window.__ModuleLoader__.load({ id: "dsh-grafana-plugin", factory: (require) => {'),
  'footer': code.trimEnd().endsWith('return module.exports; } });'),
  'no katex identifiers': !/katex/i.test(code),
  'no .css requires': !/require\("[^"]*\.css"\)/.test(code),
  'react/jsx-runtime required': /require\("react\/jsx-runtime"\)/.test(code),
  'client-store required': /require\("@deepseek-ai\/dsh-client-store"\)/.test(code),
  'no inlined cordis Service class': !/class Service extends/.test(code),
  'registers plugins.item slot': code.includes('plugins.item'),
  'namespace grafana-plugin': code.includes('grafana-plugin'),
}
let ok = true
for (const [name, pass] of Object.entries(checks)) {
  console.log(pass ? 'PASS' : 'FAIL', name)
  if (!pass) ok = false
}
process.exit(ok ? 0 : 1)
