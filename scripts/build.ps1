# One-shot rebuild of the grafana dsh plugin (node half only).
# Prereqs:
#   1. Node 22+ (verify: node -v)
#   2. dsh host packages resolvable by scripts/link_deps.py
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> [1/3] Install build tools (tsdown/typescript, first run) ..." -ForegroundColor Cyan
npm install --legacy-peer-deps 2>&1 | Select-Object -Last 3

Write-Host "==> [2/3] Link host deps (junction, must run AFTER npm install) ..." -ForegroundColor Cyan
python scripts/link_deps.py
if ($LASTEXITCODE -ne 0) { throw "link_deps failed" }

Write-Host "==> [3/3] Build node half (lib/index.js) ..." -ForegroundColor Cyan
npx tsdown
if ($LASTEXITCODE -ne 0) { throw "tsdown build failed" }

if (-not (Test-Path "lib/index.js")) { throw "build artifact missing" }
Write-Host "OK: lib/index.js generated" -ForegroundColor Green

Write-Host ""
Write-Host "Install into a profile:" -ForegroundColor Green
Write-Host "  dsh plugin --profile web add file:$PWD"
Write-Host "  (re-run scripts/sync_profile.py after rebuilds)"
