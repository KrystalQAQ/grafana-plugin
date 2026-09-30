# One-shot build of the grafana dsh plugin: host half, client types, browser half.
# Prereqs:
#   1. Node 22+ (verify: node -v)
#   2. dsh host packages resolvable by scripts/link_deps.py
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$NPM_CLI = "C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js"

function Invoke-NpmCli([string[]]$CliArgs, [string]$Step) {
  & node $NPM_CLI @CliArgs
  if ($LASTEXITCODE -ne 0) { throw "$Step failed" }
}

Write-Host "==> [1/5] Install build tools (first run) ..." -ForegroundColor Cyan
Invoke-NpmCli @("install", "--legacy-peer-deps", "--no-fund", "--no-audit") "npm install"

Write-Host "==> [2/5] Link host deps (junction, AFTER npm install) ..." -ForegroundColor Cyan
python scripts/link_deps.py
if ($LASTEXITCODE -ne 0) { throw "link_deps failed" }

Write-Host "==> [3/5] Build host half (lib/index.js) ..." -ForegroundColor Cyan
Invoke-NpmCli @("exec", "--yes", "--", "tsdown", "--config", "tsdown.node.config.ts") "tsdown node"

Write-Host "==> [4/5] Compile host + client types (lib/types) ..." -ForegroundColor Cyan
Invoke-NpmCli @("exec", "--yes", "--", "tsc", "-p", "tsconfig.client.json") "tsc client emit"

Write-Host "==> [5/5] Build browser half (lib/client.js) ..." -ForegroundColor Cyan
Invoke-NpmCli @("exec", "--yes", "--", "tsdown", "--config", "tsdown.client.config.ts") "tsdown client"

if (-not (Test-Path "lib/index.js")) { throw "host artifact missing" }
if (-not (Test-Path "lib/client.js")) { throw "browser artifact missing" }
Write-Host "OK: lib/index.js + lib/client.js generated" -ForegroundColor Green

Write-Host ""
Write-Host "Install into a profile:" -ForegroundColor Green
Write-Host "  dsh plugin --profile web add file:$PWD"
Write-Host "  (re-run scripts/sync_profile.py web after rebuilds)"
