[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Run 01-INSTALL-TOOLS.cmd first.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is required. Run 01-INSTALL-TOOLS.cmd first.'
}

& node '.claude\tests\guardrails.test.mjs'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& node 'tools\validate-package.mjs'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path '.git')) {
    throw 'Git repository is missing. Run 02-SETUP-PROJECT.cmd.'
}
$commitCountText = [string](& git rev-list --all --count 2>$null)
if ([string]::IsNullOrWhiteSpace($commitCountText) -or [int]$commitCountText.Trim() -lt 1) {
    throw 'No baseline commit exists. Run 02-SETUP-PROJECT.cmd and do not run TC-00 yet.'
}
if (-not (Test-Path '.table-companion-backups\baseline.bundle')) {
    Write-Warning 'The local baseline Git bundle is missing. Re-run setup or create a private remote before TC-00.'
}

Write-Host "Git recovery check passed: $($commitCountText.Trim()) commit(s)." -ForegroundColor Green
exit 0
