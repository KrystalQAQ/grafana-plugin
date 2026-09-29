// Read the Grafana token from the DPAPI-protected clixml store.
import { execSync } from 'node:child_process'

export function readToken() {
  const script = `
    $credPath = 'D:\\code\\运维\\.pi\\grafana-token.machine.clixml'
    if (-not (Test-Path $credPath)) { $credPath = 'D:\\code\\运维\\.pi\\grafana-token.clixml' }
    $secure = ConvertTo-SecureString ((Get-Content $credPath -Raw).Trim())
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  `
  const out = execSync('powershell -NoProfile -Command -', { input: script, encoding: 'utf8' })
  return out.trim()
}
