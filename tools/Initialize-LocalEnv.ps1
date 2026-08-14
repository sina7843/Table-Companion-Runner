[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$example = Join-Path $Root '.env.example'
$target = Join-Path $Root '.env'

if (-not (Test-Path $example)) {
    throw '.env.example does not exist yet. Complete the scaffold step or create the documented example first.'
}
if ((Test-Path $target) -and -not $Force) {
    throw '.env already exists. Re-run with -Force only if you intentionally want to replace it.'
}
Copy-Item -LiteralPath $example -Destination $target -Force:$Force
Write-Host "Created local environment file: $target" -ForegroundColor Green
Write-Host 'Claude is intentionally blocked from reading this file. Edit real local values yourself.'
